/**
 * CloudAudioStore — IndexedDB Binary Audio Storage Engine.
 * Persists raw multi-track WAV audio blobs for session IDs in local browser database,
 * allowing Admin Panel to export true recorded audio stems.
 */

const DB_NAME = 'PodcastStudioAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audio_blobs';

export interface StoredAudioPayload {
  sessionId: string;
  stereoBlob: Blob;
  speakerABlob?: Blob;
  speakerBBlob?: Blob;
  createdAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSessionAudioBlobs(
  sessionId: string,
  stereoBlob: Blob,
  speakerABlob?: Blob,
  speakerBBlob?: Blob
): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const payload: StoredAudioPayload = {
        sessionId,
        stereoBlob,
        speakerABlob,
        speakerBBlob,
        createdAt: new Date().toISOString(),
      };

      const request = store.put(payload);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error saving audio blob to IndexedDB:', err);
    return false;
  }
}

export async function getSessionAudioBlobs(sessionId: string): Promise<StoredAudioPayload | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(sessionId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error reading audio blob from IndexedDB:', err);
    return null;
  }
}

export async function deleteSessionAudioBlobs(sessionId: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(sessionId);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error deleting audio blob from IndexedDB:', err);
    return false;
  }
}

export async function clearAllAudioBlobs(): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error clearing audio blobs from IndexedDB:', err);
    return false;
  }
}
