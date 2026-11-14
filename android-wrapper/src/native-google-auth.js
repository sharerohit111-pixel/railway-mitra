import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

window.RailwayMitraNativeAuth = Object.freeze({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  async signInWithGoogle() {
    const result = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
      useCredentialManager: true
    });
    const idToken = result?.credential?.idToken;
    if (!idToken) {
      throw new Error('Google sign-in did not return an ID token.');
    }
    return idToken;
  }
});
