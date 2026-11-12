import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  getMultiFactorResolver, PhoneAuthProvider, PhoneMultiFactorGenerator,
  RecaptchaVerifier, multiFactor, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

let recaptcha = null;
function verifier(auth) {
  if (!recaptcha) recaptcha = new RecaptchaVerifier(auth, "rm-admin-recaptcha", { size: "invisible" });
  return recaptcha;
}
async function finishMfa(auth, error, requestOtp) {
  const resolver = getMultiFactorResolver(auth, error);
  const hint = resolver.hints.find(h => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("Owner account में Phone OTP MFA सेट नहीं है।");
  const provider = new PhoneAuthProvider(auth);
  const id = await provider.verifyPhoneNumber({ multiFactorHint: hint, session: resolver.session }, verifier(auth));
  const credential = PhoneAuthProvider.credential(id, await requestOtp());
  return resolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(credential));
}
export async function signInOwnerGoogle(auth, requestOtp) {
  try { return await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { if (e.code !== "auth/multi-factor-auth-required") throw e; return finishMfa(auth, e, requestOtp); }
}
export async function signInOwnerEmail(auth, email, password, requestOtp) {
  try { return await signInWithEmailAndPassword(auth, email.trim(), password); }
  catch (e) { if (e.code !== "auth/multi-factor-auth-required") throw e; return finishMfa(auth, e, requestOtp); }
}
export async function enrollOwnerPhoneMfa(auth, phoneNumber, requestOtp) {
  if (!auth.currentUser) throw new Error("पहले Owner अकाउंट से लॉगिन करें।");
  const session = await multiFactor(auth.currentUser).getSession();
  const provider = new PhoneAuthProvider(auth);
  const id = await provider.verifyPhoneNumber({ phoneNumber, session }, verifier(auth));
  const credential = PhoneAuthProvider.credential(id, await requestOtp());
  await multiFactor(auth.currentUser).enroll(PhoneMultiFactorGenerator.assertion(credential), "Railway Mitra Owner OTP");
}
export function hasPhoneMfa(user) {
  return !!user && multiFactor(user).enrolledFactors.some(f => f.factorId === PhoneMultiFactorGenerator.FACTOR_ID);
}
export { signOut };
