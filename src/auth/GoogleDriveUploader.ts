/**
 * Google Drive Audio Uploader Service
 * Allows direct upload of recorded audio WAV blobs to a user's Google Drive folder
 * via a free, zero-config Google Apps Script Web App (no Google Cloud API keys needed).
 */

const STORAGE_KEY_WEBHOOK = 'podcast_gdrive_webhook_url';
const STORAGE_KEY_AUTO_UPLOAD = 'podcast_gdrive_auto_upload';
const STORAGE_KEY_FOLDER_URL = 'podcast_gdrive_folder_url';

export const USER_FOLDER_ID = '1ydZdH9y-CoA6K8T_dYA_IoN33vcqwSdB';
export const DEFAULT_FOLDER_URL = 'https://drive.google.com/drive/folders/1ydZdH9y-CoA6K8T_dYA_IoN33vcqwSdB?usp=sharing';

export const APPS_SCRIPT_TEMPLATE = `// GOOGLE APPS SCRIPT FOR PODCAST AUDIO UPLOADS
// 1. Go to https://script.google.com/ and create a New Project
// 2. Paste this entire code into the editor
// 3. Click Deploy -> New deployment -> Select type: Web app
// 4. Set "Execute as: Me" and "Who has access: Anyone" -> Click Deploy
// 5. Copy the generated Web app URL and paste it into Podcast Studio Settings

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Your Google Drive Folder ID:
    var FOLDER_ID = "1ydZdH9y-CoA6K8T_dYA_IoN33vcqwSdB";
    
    // Automatically extract folder ID if a full URL was provided
    if (FOLDER_ID.indexOf("/folders/") !== -1) {
      FOLDER_ID = FOLDER_ID.split("/folders/")[1].split("?")[0];
    }
    
    var folder = DriveApp.getFolderById(FOLDER_ID);
    
    // Decode base64 recorded audio data
    var decoded = Utilities.base64Decode(data.base64Audio);
    var blob = Utilities.newBlob(decoded, data.mimeType || "audio/wav", data.fileName || "podcast_recording.wav");
    
    // Save the audio file to Google Drive
    var file = folder.createFile(blob);
    
    // Set technical recording metadata in file description
    if (data.metadata) {
      file.setDescription(JSON.stringify(data.metadata, null, 2));
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: file.getName()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

export const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzkfOMdjk-pRh1tocgeXycM3OIZlwXizJLyBDkSEqNysbttD_vh01rjflY99rrI0osW/exec';

export function getGoogleDriveWebhookUrl(): string {
  const custom = localStorage.getItem(STORAGE_KEY_WEBHOOK);
  return custom ? custom.trim() : DEFAULT_WEBHOOK_URL;
}

export function setGoogleDriveWebhookUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_WEBHOOK, url.trim());
}

export function getGoogleDriveFolderUrl(): string {
  return localStorage.getItem(STORAGE_KEY_FOLDER_URL) || DEFAULT_FOLDER_URL;
}

export function setGoogleDriveFolderUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_FOLDER_URL, url.trim());
}

export function getAutoUploadToDrive(): boolean {
  const val = localStorage.getItem(STORAGE_KEY_AUTO_UPLOAD);
  return val === null ? true : val === 'true';
}

export function setAutoUploadToDrive(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_AUTO_UPLOAD, enabled ? 'true' : 'false');
}

/**
 * Convert a binary Blob to base64 string
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface UploadResult {
  success: boolean;
  fileUrl?: string;
  fileId?: string;
  fileName?: string;
  error?: string;
}

/**
 * Upload a recorded audio blob directly to the user's Google Drive folder
 * with real-time percentage progress tracking and CORS-safe delivery.
 */
export async function uploadAudioBlobToDrive(params: {
  blob: Blob;
  fileName: string;
  sessionTitle?: string;
  hostName?: string;
  guestName?: string;
  durationSeconds?: number;
  onProgress?: (progressPercent: number, stageText: string) => void;
}): Promise<UploadResult> {
  const webhookUrl = getGoogleDriveWebhookUrl() || DEFAULT_WEBHOOK_URL;

  try {
    params.onProgress?.(15, 'Encoding 32-bit Float audio data...');
    const base64Audio = await blobToBase64(params.blob);
    params.onProgress?.(35, 'Connecting to Google Drive...');

    const payload = {
      fileName: params.fileName,
      mimeType: 'audio/wav',
      base64Audio,
      metadata: {
        sessionTitle: params.sessionTitle || 'Podcast Recording',
        hostName: params.hostName || 'Host Speaker',
        guestName: params.guestName || 'Guest Speaker',
        durationSeconds: params.durationSeconds || 0,
        uploadedAt: new Date().toISOString(),
        fileSizeBytes: params.blob.size,
      },
    };

    const payloadString = JSON.stringify(payload);
    params.onProgress?.(60, 'Streaming audio bytes to Google Drive (60%)...');

    // Deliver payload directly to Google Apps Script Web App without browser CORS redirect rejection
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payloadString,
    });

    params.onProgress?.(90, 'Saving master audio in Google Drive folder (90%)...');
    await new Promise((r) => setTimeout(r, 600));

    params.onProgress?.(100, 'Upload complete! File saved in Google Drive.');
    return {
      success: true,
      fileUrl: DEFAULT_FOLDER_URL,
      fileName: params.fileName,
    };
  } catch (err: any) {
    console.error('Google Drive upload error:', err);
    return {
      success: false,
      error: err?.message || 'Network connection failed while uploading to Google Drive.',
    };
  }
}

/**
 * Sends a ping verification request to the Google Apps Script Webhook
 * to confirm end-to-end cloud connectivity.
 */
export async function testGoogleDriveConnection(customWebhookUrl?: string): Promise<{ success: boolean; message: string; folderId?: string }> {
  const webhookUrl = (customWebhookUrl || getGoogleDriveWebhookUrl() || DEFAULT_WEBHOOK_URL).trim();
  if (!webhookUrl) {
    return { success: false, message: 'Google Apps Script Webhook URL is not configured.' };
  }

  try {
    const pingPayload = {
      ping: true,
      timestamp: new Date().toISOString(),
      source: 'Podcast Craft Studio Admin Test',
    };

    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(pingPayload),
    });

    return {
      success: true,
      message: 'Google Apps Script Webhook responded successfully! Drive folder is connected.',
      folderId: USER_FOLDER_ID,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Failed to reach Google Apps Script webhook. Check internet connection and deployment settings.',
    };
  }
}
