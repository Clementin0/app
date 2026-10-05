import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNative = () => Capacitor.isNativePlatform();

/** Android hardware back button (native only). */
export function onBackButton(handler) {
  if (!isNative()) return;
  App.addListener('backButton', handler).catch(() => {});
}

/** App sent to background / brought back (native lifecycle + page visibility). */
export function onAppStateChange(handler) {
  if (isNative()) {
    App.addListener('appStateChange', ({ isActive }) => handler(isActive)).catch(() => {});
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => handler(document.visibilityState === 'visible'));
  }
}

export function exitApp() {
  if (isNative()) App.exitApp().catch(() => {});
}
