import { ElectronAPI } from '../../src/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
