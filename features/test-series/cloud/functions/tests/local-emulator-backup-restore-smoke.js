'use strict';

const admin = require('firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const expectedProjectId = 'demo-railway-mitra-cbt';
const expectedFirestoreHost = '127.0.0.1:8080';
const expectedAuthHost = '127.0.0.1:9099';
const uid = 'cbt-backup-restore-smoke-user';
const documentPath = 'testSeriesBackupRestoreDrill/synthetic-smoke-record';

if (projectId !== expectedProjectId) {
  throw new Error('Refusing backup/restore smoke test outside the exact demo project.');
}
if (firestoreHost !== expectedFirestoreHost || authHost !== expectedAuthHost) {
  throw new Error('Refusing backup/restore smoke test unless both SDKs target the exact loopback emulators.');
}

admin.initializeApp({ projectId }, 'cbt-backup-restore-smoke');
const db = admin.firestore();
const auth = admin.auth();

async function seed() {
  await auth.createUser({
    uid,
    email: 'cbt-backup-restore-smoke@example.invalid',
    displayName: 'Synthetic CBT Backup Restore Test'
  });
  await db.doc(documentPath).create({
    marker: 'railway-mitra-cbt-emulator-backup-restore',
    schemaVersion: 1,
    synthetic: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('Seeded synthetic Firestore document and Auth user.');
}

async function verify() {
  const snapshot = await db.doc(documentPath).get();
  if (!snapshot.exists) throw new Error('Restored Firestore smoke-test document is missing.');
  const data = snapshot.data();
  if (data.marker !== 'railway-mitra-cbt-emulator-backup-restore' ||
      data.schemaVersion !== 1 || data.synthetic !== true) {
    throw new Error('Restored Firestore smoke-test document does not match its expected values.');
  }
  const user = await auth.getUser(uid);
  if (user.uid !== uid || user.email !== 'cbt-backup-restore-smoke@example.invalid' || user.disabled) {
    throw new Error('Restored Auth smoke-test user does not match its expected values.');
  }
  console.log('Verified synthetic Firestore document and Auth user after import.');
  await db.doc(documentPath).delete();
  await auth.deleteUser(uid);
  console.log('Cleaned up synthetic smoke-test records.');
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'seed') return seed();
  if (mode === 'verify') return verify();
  throw new Error('Usage: node local-emulator-backup-restore-smoke.js <seed|verify>');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
