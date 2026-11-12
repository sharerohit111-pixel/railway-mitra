// UI wiring is initialized by the Test Series host after Firebase Auth is ready.
import { signInOwnerGoogle, signInOwnerEmail, enrollOwnerPhoneMfa, hasPhoneMfa, signOut } from "./admin-auth.js";

export function initOwnerAdminDashboard(auth) {
  const el = id => document.getElementById(id);
  const login = el("rm-admin-login"), setup = el("rm-admin-mfa-setup"), otpPanel = el("rm-admin-otp"), home = el("rm-admin-home");
  let pendingVerification = null;
  const status = message => { el("rm-owner-login-status").textContent = message; };
  const showOtp = verificationId => new Promise((resolve, reject) => {
    pendingVerification = { verificationId, resolve, reject };
    otpPanel.hidden = false;
    el("rm-owner-otp").value = "";
    el("rm-owner-otp").focus();
  });
  el("rm-owner-otp-confirm").addEventListener("click", () => {
    const code = el("rm-owner-otp").value.trim();
    if (!pendingVerification || !/^\d{6}$/.test(code)) { status("कृपया 6 अंकों का OTP दर्ज करें।"); return; }
    const p = pendingVerification; pendingVerification = null; otpPanel.hidden = true; p.resolve(code);
  });
  async function afterLogin(result) {
    const user = result.user || auth.currentUser;
    if (!hasPhoneMfa(user)) { login.hidden = true; setup.hidden = false; return; }
    // The callable server-side Owner UID + MFA check is mandatory before enabling real admin data.
    login.hidden = true; setup.hidden = true; home.hidden = false;
    el("rm-admin-owner-email").textContent = user.email || "Owner";
    el("rm-admin-module-status").textContent = "Login सफल। वास्तविक डेटा और बदलाव तभी उपलब्ध होंगे जब server-side Owner authorization तथा cloud modules deploy होंगे।";
  }
  el("rm-owner-google").addEventListener("click", async () => {
    try { status("Google Login…"); await afterLogin(await signInOwnerGoogle(auth, () => showOtp())); }
    catch (e) { status(e.message || "Login असफल।"); }
  });
  el("rm-owner-email-login").addEventListener("click", async () => {
    try { status("Email Login…"); await afterLogin(await signInOwnerEmail(auth, el("rm-owner-email").value, el("rm-owner-password").value, () => showOtp())); }
    catch (e) { status(e.message || "Login असफल।"); }
  });
  el("rm-owner-enroll-otp").addEventListener("click", async () => {
    try {
      await enrollOwnerPhoneMfa(auth, el("rm-owner-phone").value.trim(), () => showOtp());
      status("OTP सुरक्षा सक्रिय। अब Logout करके दोबारा Login करें ताकि OTP challenge जाँचा जा सके।");
      await signOut(auth); setup.hidden = true; login.hidden = false;
    } catch (e) { status(e.message || "OTP enrollment असफल।"); }
  });
  el("rm-owner-logout").addEventListener("click", async () => { await signOut(auth); home.hidden = true; login.hidden = false; });
  document.querySelectorAll("[data-admin-module]").forEach(button => button.addEventListener("click", () => {
    el("rm-admin-module-status").textContent = button.querySelector("b").textContent + " का cloud module अभी जोड़ा नहीं गया है।";
  }));
  return { destroy() { /* host owns route lifecycle */ } };
}
