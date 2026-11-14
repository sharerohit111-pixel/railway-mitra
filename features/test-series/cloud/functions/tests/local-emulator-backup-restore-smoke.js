'use strict';

const admin = require('firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const uid = 'cbt-backup-restore-smoke-user';
const documentPath = 'testSeriesBackupRestoreDrill/synthetic-smoke-record';

if (!projectId || !projectId.startsWith('demo-')) {
  throw new Error('Refusing backup/restore smoke test without a demo-* project ID.');
}
if (!firestoreHost || !authHost) {
  throw new Error('Auth and Firestore Emulator hosts must both be configured.');
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const auth = admin.auth();

async function seed() {
  await db.doc(documentPath).set({
    marker: 'railway-mitra-cbt-emulator-backup-restore',
    schemaVersion: 1,
    synthetic: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  try {
    await auth.createUser({
      uid,
      email: 'cbt-backup-restore-smoke@example.invalid',
      displayName: 'Synthetic CBT Backup Restore Test'
    });
  } catch (error) {
    if (error.code !== 'auth/uid-already-exists') throw error;
  }
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
  if (user.email !== 'cbt-backup-restore-smoke@example.invalid') {
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
