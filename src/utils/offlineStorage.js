// Offline storage utilities for caching jobs and queuing uploads

const CACHE_KEY_JOBS = 'crew_portal_cached_jobs';
const CACHE_KEY_UPLOADS = 'crew_portal_pending_uploads';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function buildScopedKey(baseKey, scope = {}) {
  const { companyId, userId } = scope || {};
  if (!companyId || !userId) return baseKey;
  return `${baseKey}-${companyId}-${userId}`;
}

export const offlineStorage = {
  // Jobs cache
  cacheJobs(jobs, scope = {}) {
    try {
      const cacheData = {
        jobs,
        timestamp: Date.now()
      };
      const scopedKey = buildScopedKey(CACHE_KEY_JOBS, scope);
      localStorage.setItem(scopedKey, JSON.stringify(cacheData));
    } catch (err) {
      console.warn('Failed to cache jobs:', err);
    }
  },

  getCachedJobs(scope = {}) {
    try {
      const scopedKey = buildScopedKey(CACHE_KEY_JOBS, scope);
      let cached = localStorage.getItem(scopedKey);
      // Backward compatibility: read legacy unscoped key one time if scoped cache is absent
      if (!cached) {
        cached = localStorage.getItem(CACHE_KEY_JOBS);
      }
      if (!cached) return null;

      const { jobs, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      // Return cached jobs if less than 1 hour old
      if (age < CACHE_EXPIRY_MS) {
        return jobs;
      }

      // Expired cache
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(CACHE_KEY_JOBS);
      return null;
    } catch (err) {
      console.warn('Failed to read cached jobs:', err);
      return null;
    }
  },

  clearJobsCache(scope = {}) {
    try {
      const scopedKey = buildScopedKey(CACHE_KEY_JOBS, scope);
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(CACHE_KEY_JOBS);
    } catch (err) {
      console.warn('Failed to clear jobs cache:', err);
    }
  },

  // Upload queue
  queueUpload(uploadData, scope = {}) {
    try {
      const queue = this.getUploadQueue(scope);
      queue.push({
        ...uploadData,
        id: Date.now().toString(),
        queuedAt: Date.now()
      });
      const scopedKey = buildScopedKey(CACHE_KEY_UPLOADS, scope);
      localStorage.setItem(scopedKey, JSON.stringify(queue));
      return true;
    } catch (err) {
      console.warn('Failed to queue upload:', err);
      return false;
    }
  },

  getUploadQueue(scope = {}) {
    try {
      const scopedKey = buildScopedKey(CACHE_KEY_UPLOADS, scope);
      const queue = localStorage.getItem(scopedKey) || localStorage.getItem(CACHE_KEY_UPLOADS);
      return queue ? JSON.parse(queue) : [];
    } catch (err) {
      console.warn('Failed to read upload queue:', err);
      return [];
    }
  },

  removeUploadFromQueue(uploadId, scope = {}) {
    try {
      const queue = this.getUploadQueue(scope);
      const filtered = queue.filter(u => u.id !== uploadId);
      const scopedKey = buildScopedKey(CACHE_KEY_UPLOADS, scope);
      localStorage.setItem(scopedKey, JSON.stringify(filtered));
    } catch (err) {
      console.warn('Failed to remove upload from queue:', err);
    }
  },

  clearUploadQueue(scope = {}) {
    try {
      const scopedKey = buildScopedKey(CACHE_KEY_UPLOADS, scope);
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(CACHE_KEY_UPLOADS);
    } catch (err) {
      console.warn('Failed to clear upload queue:', err);
    }
  },

  // Network status
  isOnline() {
    return navigator.onLine;
  },

  onOnlineStatusChange(callback) {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }
};
