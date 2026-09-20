/**
 * public/js/os/apps/browser/BrowserDownloads.js
 * Downloads manager and shelf controller for AdityyaOS Browser.
 * Writes downloaded artifacts exclusively to /home/user/Downloads/ in AdityyaFS.
 */

export class BrowserDownloads {
  /**
   * @param {Object} options
   * @param {import('../../api/FileSystemAPI.js').FileSystemAPI|Object} options.fs
   * @param {boolean} [options.isIncognito=false]
   * @param {Function} [options.onDownloadUpdate]
   */
  constructor({ fs, isIncognito = false, onDownloadUpdate = null }) {
    this.fs = fs?.fs ? fs.fs : fs;
    this.isIncognito = Boolean(isIncognito);
    this.onDownloadUpdate = onDownloadUpdate;
    this.downloadsDir = '/home/user/Downloads';
    this.metadataFile = '/home/user/.browser/downloads.json';

    this.downloads = [];
    this.init();
  }

  init() {
    this.ensureDirectory();
    if (!this.isIncognito) {
      this.load();
    }
  }

  ensureDirectory() {
    try {
      if (!this.fs.exists('/home')) this.fs.createDirectory('/home');
      if (!this.fs.exists('/home/user')) this.fs.createDirectory('/home/user');
      if (!this.fs.exists(this.downloadsDir)) this.fs.createDirectory(this.downloadsDir);
      if (!this.fs.exists('/home/user/.browser')) this.fs.createDirectory('/home/user/.browser');
    } catch {
      // Ignore if directory already exists
    }
  }

  load() {
    try {
      if (this.fs.exists(this.metadataFile)) {
        const raw = this.fs.readFile(this.metadataFile);
        const content = typeof raw === 'string' ? raw : (raw?.content || '[]');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          this.downloads = parsed;
        }
      }
    } catch (err) {
      console.warn('[BrowserDownloads] Could not load downloads metadata:', err);
      this.downloads = [];
    }
  }

  save() {
    if (this.isIncognito) return;

    try {
      this.ensureDirectory();
      this.fs.writeFile(this.metadataFile, JSON.stringify(this.downloads, null, 2));
    } catch (err) {
      console.warn('[BrowserDownloads] Failed to save downloads metadata to AdityyaFS:', err);
    }
  }

  getDownloads() {
    return [...this.downloads];
  }

  /**
   * Start and complete a file download to /home/user/Downloads.
   * @param {Object} item
   * @param {string} item.filename
   * @param {string} [item.url]
   * @param {string} [item.content]
   * @param {number} [item.size]
   * @param {string} [item.mimeType]
   * @returns {Promise<Object>}
   */
  async startDownload({ filename, url = '', content = '', size = null, mimeType = 'text/plain' }) {
    this.ensureDirectory();

    const cleanName = (filename || `download_${Date.now()}.txt`).replace(/[\\/:\*\?"<>\|]/g, '_');
    const targetPath = `${this.downloadsDir}/${cleanName}`;
    const fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const calculatedSize = size !== null ? size : fileContent.length;

    const downloadItem = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      filename: cleanName,
      url: url || 'blob:simulated',
      path: targetPath,
      size: calculatedSize,
      mimeType,
      timestamp: Date.now(),
      status: 'completed',
      progress: 100
    };

    // Write file to /home/user/Downloads/ in AdityyaFS
    try {
      await this.fs.writeFile(targetPath, fileContent);
    } catch (err) {
      console.error('[BrowserDownloads] Error writing downloaded file:', err);
      downloadItem.status = 'failed';
    }

    this.downloads.unshift(downloadItem);
    this.save();

    if (typeof this.onDownloadUpdate === 'function') {
      this.onDownloadUpdate(downloadItem);
    }

    return downloadItem;
  }

  removeDownload(id) {
    const idx = this.downloads.findIndex(d => d.id === id);
    if (idx !== -1) {
      this.downloads.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  clearDownloads() {
    this.downloads = [];
    this.save();
  }
}
