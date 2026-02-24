/**
 * Unified API surface for both Electron (via preload/contextBridge) and
 * browser (via the companion Express server at /api).
 *
 * In Electron, window.api is injected by the preload script.
 * In a plain browser session the preload never runs, so we fall back to the
 * fetch-based browserApi which talks to the Express server.
 */
import type { ElectronAPI } from '../electron.d';
import { browserApi } from './browserApi';

function getApi(): ElectronAPI {
  if (typeof window !== 'undefined' && (window as Window & { api?: ElectronAPI }).api) {
    return (window as Window & { api: ElectronAPI }).api;
  }
  return browserApi;
}

export const api: ElectronAPI = getApi();
