/**
 * IndexedDB-based transcript cache for offline PWA support.
 * Stores transcripts keyed by videoId so users can search/browse
 * previously loaded meetings without network access.
 */

const DB_NAME = 'community-highlighter';
const DB_VERSION = 1;
const STORE_NAME = 'transcripts';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save a transcript to IndexedDB.
 * @param {string} videoId
 * @param {Array} transcript - Array of {start, duration, text} segments
 * @param {object} meta - Optional metadata (title, summary, etc.)
 */
export async function cacheTranscript(videoId, transcript, meta = {}) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      videoId,
      transcript,
      title: meta.title || '',
      summary: meta.summary || '',
      timestamp: Date.now(),
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[transcriptCache] Failed to cache:', e);
  }
}

/**
 * Retrieve a cached transcript by videoId.
 * @param {string} videoId
 * @returns {object|null} - {videoId, transcript, title, summary, timestamp} or null
 */
export async function getCachedTranscript(videoId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(videoId);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('[transcriptCache] Failed to read:', e);
    return null;
  }
}

/**
 * List all cached transcripts (for offline browsing).
 * @returns {Array} - [{videoId, title, timestamp}, ...]
 */
export async function listCachedTranscripts() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(
        (req.result || []).map(r => ({
          videoId: r.videoId,
          title: r.title,
          timestamp: r.timestamp,
          segmentCount: r.transcript?.length || 0,
        }))
      );
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

/**
 * Delete a cached transcript.
 * @param {string} videoId
 */
export async function deleteCachedTranscript(videoId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(videoId);
  } catch (e) {
    console.warn('[transcriptCache] Failed to delete:', e);
  }
}
