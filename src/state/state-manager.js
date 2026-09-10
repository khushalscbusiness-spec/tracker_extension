// src/state/state-manager.js
import { STORAGE } from '../utils/storage.js';

export class StateManager {
  constructor() {
    this.state = {
      job: null,
      status: null,
      activeTabId: null,
      isAuthenticated: false
    };
    this.listeners = [];
  }

  async getState() {
    return this.state;
  }

  async setJob(job) {
    this.state.job = job;
    await STORAGE.set('last_detected_job', job);
    this.notifyListeners();
  }

  async setJobStatus(status) {
    this.state.status = status;
    this.notifyListeners();
  }

  async clearJob() {
    this.state.job = null;
    this.state.status = null;
    await STORAGE.remove('last_detected_job');
    this.notifyListeners();
  }

  async setActiveTab(tabId) {
    this.state.activeTabId = tabId;
    await STORAGE.set('last_active_tab', tabId);
  }

  async setAuthenticated(authenticated) {
    this.state.isAuthenticated = authenticated;
    this.notifyListeners();
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.state);
      } catch (e) {
        console.error('[StateManager] Listener error:', e);
      }
    });
  }

  async restore() {
    const state = await STORAGE.getExtensionState();
    if (state.last_detected_job) {
      this.state.job = state.last_detected_job;
    }
    if (state.last_active_tab) {
      this.state.activeTabId = state.last_active_tab;
    }
    if (state.access_token) {
      this.state.isAuthenticated = true;
    }
    this.notifyListeners();
  }

  getCurrentJob() {
    return this.state.job;
  }

  getJobStatus() {
    return this.state.status;
  }

  isJobTracked() {
    return this.state.status?.tracked || false;
  }

  isAuthenticated() {
    return this.state.isAuthenticated;
  }
}

export const STATE_MANAGER = new StateManager();