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

export function getGoogleDriveWebhookUrl(): string {
  return localStorage.getItem(STORAGE_KEY_WEBHOOK) || '';
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
  return localStorage.getItem(STORAGE_KEY_AUTO_UPLOAD) === 'true';
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
 * with real-time percentage progress tracking.
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
  const webhookUrl = getGoogleDriveWebhookUrl();
  if (!webhookUrl) {
    return {
      success: false,
      error: 'Google Drive Webhook URL is not configured. Please enter your Google Apps Script Webhook URL in Cloud Storage Settings.',
    };
  }

  try {
    params.onProgress?.(5, 'Encoding WAV audio data...');
    const base64Audio = await blobToBase64(params.blob);
    params.onProgress?.(15, 'Preparing upload payload...');

    const payload = {
      fileName: params.fileName,
      mimeType: params.blob.type || 'audio/wav',
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

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', webhookUrl);
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');

      // Real network transmission progress (15% -> 85%)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const ratio = event.loaded / event.total;
          const pct = Math.round(15 + ratio * 70); // 15% to 85%
          const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
          const totalMb = (event.total / (1024 * 1024)).toFixed(1);
          params.onProgress?.(pct, `Uploading to Google Drive (${pct}% — ${loadedMb} / ${totalMb} MB)...`);
        }
      };

      xhr.onload = () => {
        params.onProgress?.(92, 'Finalizing Google Drive cloud file...');
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.status === 'success' || data.fileUrl) {
            params.onProgress?.(100, 'Upload complete! File saved in Google Drive.');
            resolve({
              success: true,
              fileUrl: data.fileUrl,
              fileId: data.fileId,
              fileName: data.fileName || params.fileName,
            });
          } else {
            resolve({
              success: false,
              error: data.message || 'Failed saving audio file to Google Drive folder.',
            });
          }
        } catch {
          // If response was not valid JSON, check HTTP status
          if (xhr.status >= 200 && xhr.status < 300) {
            params.onProgress?.(100, 'Upload complete!');
            resolve({
              success: true,
              fileName: params.fileName,
            });
          } else {
            resolve({
              success: false,
              error: `Google Apps Script returned HTTP ${xhr.status}: ${xhr.statusText}`,
            });
          }
        }
      };

      xhr.onerror = () => {
        resolve({
          success: false,
          error: 'Network connection failed while uploading to Google Drive.',
        });
      };

      xhr.ontimeout = () => {
        resolve({
          success: false,
          error: 'Google Drive upload request timed out.',
        });
      };

      params.onProgress?.(20, 'Connecting to Google Drive...');
      xhr.send(payloadString);
    });
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error during Google Drive upload.',
    };
  }
}
