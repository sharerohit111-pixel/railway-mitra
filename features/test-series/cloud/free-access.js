// Railway Mitra Test Series — isolated cloud access client.
// Requires Firebase Authentication and a deployed callable function.
// No localStorage unlocks and no client-side admin passwords.
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

export async function claimFirstFreeAttempt(firebaseApp, auth) {
  if (!auth.currentUser) throw new Error("कृपया पहले लॉगिन करें।");
  const fn = httpsCallable(getFunctions(firebaseApp, "asia-south1"), "rmClaimFreeAttempt");
  const result = await fn({});
  return result.data; // { attemptId, testId, status }
}
