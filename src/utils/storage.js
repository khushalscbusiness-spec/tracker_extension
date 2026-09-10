// src/utils/storage.js
export class StorageManager {
  constructor() {
    this.storage = chrome.storage.local;
  }

  async get(key) {
    return new Promise((resolve) => {
      this.storage.get(key, (result) => {
        resolve(result[key]);
      });
    });
  }

  async set(key, value) {
    return new Promise((resolve) => {
      this.storage.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  async remove(key) {
    return new Promise((resolve) => {
      this.storage.remove(key, () => {
        resolve();
      });
    });
  }

  async clear() {
    return new Promise((resolve) => {
      this.storage.clear(() => {
        resolve();
      });
    });
  }

  async getAuth() {
    const token = await this.get('access_token');
    return token ? { accessToken: token } : null;
  }

  async saveAuth(auth) {
    if (auth.accessToken) {
      await this.set('access_token', auth.accessToken);
    }
    if (auth.refreshToken) {
      await this.set('refresh_token', auth.refreshToken);
    }
    if (auth.user) {
      await this.set('user', auth.user);
    }
  }

  async clearAuth() {
    await this.remove('access_token');
    await this.remove('refresh_token');
    await this.remove('user');
  }

  async getExtensionState() {
    return {
      accessToken: await this.get('access_token'),
      user: await this.get('user'),
      lastDetectedJob: await this.get('last_detected_job'),
      lastActiveTab: await this.get('last_active_tab'),
      extensionVersion: await this.get('extension_version')
    };
  }
}

export const STORAGE = new StorageManager();