import { Capacitor } from '@capacitor/core';
import { Haptics as NativeHaptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** Vibration feedback: Capacitor Haptics on Android, navigator.vibrate in browsers. */
export class Haptics {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.native = Capacitor.isNativePlatform();
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  _impact(style, ms) {
    if (!this.enabled) return;
    if (this.native) NativeHaptics.impact({ style }).catch(() => {});
    else globalThis.navigator?.vibrate?.(ms);
  }

  light() {
    this._impact(ImpactStyle.Light, 10);
  }

  medium() {
    this._impact(ImpactStyle.Medium, 25);
  }

  heavy() {
    this._impact(ImpactStyle.Heavy, 60);
  }

  success() {
    if (!this.enabled) return;
    if (this.native) NativeHaptics.notification({ type: NotificationType.Success }).catch(() => {});
    else globalThis.navigator?.vibrate?.([20, 40, 20]);
  }
}
