import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

// This bridge only acknowledges a healthy native web bundle. Automatic delivery
// remains disabled until the owner's Capgo app/channel is configured and tested.
if (Capacitor.isNativePlatform()) {
  // Wait until the staged page and its synchronous assets have loaded before
  // acknowledging readiness, so a broken initial page is less likely to be
  // marked healthy prematurely.
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      CapacitorUpdater.notifyAppReady().catch((error) => {
        console.warn('[Railway Mitra] Updater readiness acknowledgement failed:', error);
      });
    }, 1500);
  }, { once: true });
}

window.RailwayMitraUpdater = Object.freeze({
  isNative: () => Capacitor.isNativePlatform(),
  async getCurrentBundle() {
    if (!Capacitor.isNativePlatform()) return { status: 'web' };
    return CapacitorUpdater.current();
  },
  async resetToLastSuccessful() {
    if (!Capacitor.isNativePlatform()) return false;
    await CapacitorUpdater.reset({ toLastSuccessful: true });
    return true;
  }
});
