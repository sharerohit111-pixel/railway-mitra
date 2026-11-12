// Point Admin SDK clients and custom-token signing at local emulators before initialization.
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp: initializeClientApp } = require("firebase/app");
const { getAuth: getClientAuth, connectAuthEmulator, signInWithCustomToken } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const REGION = "asia-south1";
const BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;
let app, db, uid, clientApp, clientAuth, functions;
const testId = "emulator-cbt-test";

async function callable(name, data = {}) {
  const invoke = httpsCallable(functions, name);
  const response = await invoke(data);
  return response.data;
}
  const customToken = await getAuth(app).createCustomToken(uid);
  await signInWithCustomToken(clientAuth, customToken);
