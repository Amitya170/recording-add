/**
 * AutoSaveRecoveryStore — IndexedDB Emergency Session Backup & Crash Recovery Engine.
 * Automatically saves audio PCM buffers every 5 seconds during active recording.
 * If the browser crashes, re-opening the Studio detects unsaved recovery data
 * and offers 1-click restoration.
 */

const DB_NAME = 'PodcastStudioRecoveryDB';
const DB_VERSION = 1;
const RECOVERY_STORE = 'session_backups';

export interface BackupSessionData {
  id: string;
  hostName: string;
  guestName: string;
  elapsedMs: number;
  updatedAt: string;
  sampleRate: number;
  pcmDataA?: Float32Array;
  pcmDataB?: Float32Array;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) {
        db.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAutoSaveBackup(data: BackupSessionData): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECOVERY_STORE, 'readwrite');
      const store = tx.objectStore(RECOVERY_STORE);
      const request = store.put(data);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error auto-saving recovery data:', err);
    return false;
  }
}

export async function getPendingRecoverySession(): Promise<BackupSessionData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECOVERY_STORE, 'readonly');
      const store = tx.objectStore(RECOVERY_STORE);
      const request = store.get('active_session_backup');

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error fetching recovery data:', err);
    return null;
  }
}

export async function clearRecoverySession(): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECOVERY_STORE, 'readwrite');
      const store = tx.objectStore(RECOVERY_STORE);
      const request = store.delete('active_session_backup');

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error clearing recovery data:', err);
    return false;
  }
}
