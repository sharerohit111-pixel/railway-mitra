import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  EmailAuthProvider, linkWithPopup, linkWithCredential,
  getMultiFactorResolver, PhoneAuthProvider, PhoneMultiFactorGenerator,
  RecaptchaVerifier, multiFactor, signOut
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { linkOwnerProvider } from "./owner-provider-linking.mjs";
import { clearOwnerRecaptchaVerifier, getOwnerRecaptchaVerifier } from "./owner-recaptcha.mjs";
import { runOwnerPhoneMfaEnrollment } from "./owner-mfa-session.mjs";

function verifier(auth) {
  return getOwnerRecaptchaVerifier(
    auth,
    "rm-admin-recaptcha",
    (instance, containerId) => new RecaptchaVerifier(instance, containerId, { size: "invisible" })
  );
}
async function finishMfa(auth, error, requestOtp) {
  const resolver = getMultiFactorResolver(auth, error);
  const hint = resolver.hints.find(h => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("Owner account में Phone OTP MFA सेट नहीं है।");
  const provider = new PhoneAuthProvider(auth);
  try {
    const id = await provider.verifyPhoneNumber({ multiFactorHint: hint, session: resolver.session }, verifier(auth));
    const credential = PhoneAuthProvider.credential(id, await requestOtp());
    return await resolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(credential));
  } finally {
    clearOwnerRecaptchaVerifier(auth);
  }
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
  return runOwnerPhoneMfaEnrollment({
    auth,
    getSession: user => multiFactor(user).getSession(),
    sendPhoneChallenge: session => new PhoneAuthProvider(auth).verifyPhoneNumber(
      { phoneNumber, session },
      verifier(auth)
    ),
    requestOtp,
    createCredential: (verificationId, otp) => PhoneAuthProvider.credential(verificationId, otp),
    enrollFactor: (user, credential) => multiFactor(user).enroll(
      PhoneMultiFactorGenerator.assertion(credential),
      "Railway Mitra Owner OTP"
    ),
    clearVerifier: () => clearOwnerRecaptchaVerifier(auth)
  });
}
export function hasPhoneMfa(user) {
  return !!user && multiFactor(user).enrolledFactors.some(f => f.factorId === PhoneMultiFactorGenerator.FACTOR_ID);
}

export async function linkOwnerGoogleProvider(auth) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("पहले Owner अकाउंट से लॉगिन करें।");
  const provider = new GoogleAuthProvider();
  return linkOwnerProvider({
    currentUser,
    providerId: "google.com",
    link: user => linkWithPopup(user, provider)
  });
}
export async function linkOwnerEmailProvider(auth, email, password) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("पहले Owner अकाउंट से लॉगिन करें।");
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail || !String(password || "")) {
    throw new Error("Email और Password दोनों दर्ज करें।");
  }
  const credential = EmailAuthProvider.credential(normalizedEmail, password);
  return linkOwnerProvider({
    currentUser,
    providerId: "password",
    link: user => linkWithCredential(user, credential)
  });
}

export { signOut };
