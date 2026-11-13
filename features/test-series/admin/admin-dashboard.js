// UI wiring is initialized by the Test Series host after Firebase Auth is ready.
import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { signInOwnerGoogle, signInOwnerEmail, enrollOwnerPhoneMfa, hasPhoneMfa, signOut } from "./admin-auth.js";
import { validateOwnerTestDraft } from "./admin-test-validation.mjs";

export function initOwnerAdminDashboard(auth, functions) {
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
    // Never reveal the owner dashboard until the backend validates UID + OTP claim + App Check.
    const verify = httpsCallable(functions, "rmGetOwnerAdminSession");
    const authorization = await verify({});
    if (!authorization.data?.authorized) throw new Error("Owner authorization असफल।");
    login.hidden = true; setup.hidden = true; home.hidden = false;
    el("rm-admin-owner-email").textContent = authorization.data.email || user.email || "Owner";
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
  const testsPanel = el("rm-admin-tests-panel");
  const testsList = el("rm-admin-tests-list");
  async function refreshTests() {
    testsList.textContent = "Cloud से टेस्ट सूची लोड हो रही है…";
    try {
      const result = await httpsCallable(functions, "rmOwnerListTests")({});
      testsList.replaceChildren();
      freeTestSelect.replaceChildren();
      const freeEligible = result.data.tests.filter(test => test.status === "published" && Number(test.price) === 0);
      if (!freeEligible.length) freeTestSelect.add(new Option("कोई पात्र प्रकाशित ₹0 टेस्ट नहीं", ""));
      else freeEligible.forEach(test => freeTestSelect.add(new Option(test.title + " · " + test.testId, test.testId)));
      const currentFreeTestId = result.data.freeTestId || "";
      if (currentFreeTestId && !Array.from(freeTestSelect.options).some(option => option.value === currentFreeTestId)) {
        const currentOption = new Option("वर्तमान चयन (अब पात्र सूची में नहीं): " + currentFreeTestId, currentFreeTestId);
        currentOption.disabled = true;
        freeTestSelect.add(currentOption);
      }
      freeTestSelect.value = currentFreeTestId;
      const freeTestLocked = result.data.freeTestLocked === true;
      freeTestSelect.disabled = freeTestLocked;
      el("rm-free-test-save").disabled = freeTestLocked;
      if (freeTestLocked) status("पहला विद्यार्थी निःशुल्क प्रयास ले चुका है। अब निःशुल्क टेस्ट का चयन स्थायी रूप से लॉक है।");
      if (!result.data.tests.length) { testsList.textContent = "अभी कोई टेस्ट नहीं है।"; return; }
      result.data.tests.forEach(test => {
        const card = document.createElement("article");
        card.className = "rm-admin-test-row";
        const heading = document.createElement("b"); heading.textContent = test.title;
        const detail = document.createElement("small");
        detail.textContent = [test.mode, test.status, test.questionCount + " प्रश्न", "₹" + test.price].join(" · ");
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = test.status === "published" ? "Copy to Draft" : "Edit";
        edit.addEventListener("click", () => loadTestForEdit(test.testId, test.status === "published"));
        card.append(heading, detail, edit); testsList.append(card);
      });
    } catch (e) { testsList.textContent = e.message || "टेस्ट सूची लोड नहीं हुई।"; }
  }
  el("rm-admin-refresh-tests").addEventListener("click", refreshTests);
  const freeTestSelect = el("rm-free-test-select");
  el("rm-free-test-save").addEventListener("click", async () => {
    const testId = freeTestSelect.value;
    if (!testId) { status("पहले प्रकाशित और ₹0 मूल्य वाला टेस्ट चुनें।"); return; }
    const button = el("rm-free-test-save"); button.disabled = true;
    try {
      const result = await httpsCallable(functions, "rmOwnerSetFreeTest")({ testId });
      status("पहला निःशुल्क टेस्ट निर्धारित हुआ: " + result.data.testId);
      await refreshTests();
    } catch (e) { status(e.message || "निःशुल्क टेस्ट निर्धारित नहीं हुआ।"); }
    finally { button.disabled = false; }
  });
  const testForm = el("rm-admin-test-form");
  el("rm-question-import").addEventListener("click", async () => {
    const file = el("rm-question-file").files?.[0];
    if (!file) { status("पहले JSON या Excel file चुनें।"); return; }
    const button = el("rm-question-import"); button.disabled = true;
    try {
      let questions;
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext === "json") {
        const parsed = JSON.parse(await file.text());
        questions = Array.isArray(parsed) ? parsed : parsed.questions;
      } else if (["xlsx", "xls", "csv"].includes(ext)) {
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        questions = rows.map((row, index) => {
          const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
          let options = normalized.options;
          if (typeof options === "string" && options.trim().startsWith("[")) options = JSON.parse(options);
          if (!Array.isArray(options)) options = ["a", "b", "c", "d", "e", "f"].map(key => normalized["option" + key.toUpperCase()]).filter(v => v !== "");
          const rawIndex = normalized.correctindex ?? normalized.correct_index ?? normalized.answerindex;
          // A blank spreadsheet cell must not silently become option 0 (A).
          const correctIndex = rawIndex === undefined || rawIndex === null || String(rawIndex).trim() === "" ? NaN : Number(rawIndex);
          return { id: String(normalized.id || "q" + (index + 1)).trim(), text: String(normalized.text ?? normalized.question ?? "").trim(),
            options: options.map(value => String(value)), correctIndex };
        });
      } else throw new Error("केवल JSON, XLSX, XLS या CSV file समर्थित है।");
      if (!Array.isArray(questions) || !questions.length) throw new Error("File में प्रश्नों की Array नहीं मिली।");
      if (questions.length > 500) throw new Error("एक टेस्ट में अधिकतम 500 प्रश्न हो सकते हैं।");
      el("rm-test-questions").value = JSON.stringify(questions, null, 2);
      status(questions.length + " प्रश्न Import हुए। Save करने से पहले JSON जाँच लें।");
    } catch (e) { status("Import असफल: " + (e.message || "File format जाँचें।")); }
    finally { button.disabled = false; }
  });
  function toLocalDateTimeInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const pad = number => String(number).padStart(2, "0");
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
      "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }
  async function loadTestForEdit(testId, cloneAsDraft = false) {
    try {
      const result = await httpsCallable(functions, "rmOwnerGetTest")({ testId });
      const t = result.data;
      // Published tests are immutable on the server. Copy them into a new draft
      // instead of presenting an Edit action that the backend will reject.
      el("rm-test-id").value = cloneAsDraft ? "" : t.testId;
      el("rm-test-title").value = t.title;
      el("rm-test-mode").value = t.mode;
      el("rm-test-duration").value = t.durationMinutes;
      el("rm-test-price").value = t.price;
      el("rm-test-marks").value = t.marksPerQuestion;
      el("rm-test-negative").value = t.negativeMarks;
      el("rm-test-status").value = cloneAsDraft ? "draft" : t.status;
      // datetime-local inputs represent the user's local wall-clock time;
      // do not slice an ISO UTC string, which silently shifts scheduled exams.
      el("rm-test-start").value = toLocalDateTimeInput(t.scheduleStartAt);
      el("rm-test-end").value = toLocalDateTimeInput(t.scheduleEndAt);
      el("rm-test-questions").value = JSON.stringify(t.questions, null, 2);
      status(cloneAsDraft ? "Published test की नई Draft copy तैयार है। मूल प्रकाशित टेस्ट सुरक्षित रहेगा।" : "Test Edit mode: " + t.testId);
      testForm.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { status(e.message || "Test details नहीं मिले।"); }
  }
  el("rm-admin-test-cancel").addEventListener("click", () => { testForm.reset(); el("rm-test-id").value = ""; });
  testForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const questions = JSON.parse(el("rm-test-questions").value);
      const payload = validateOwnerTestDraft({
        title: el("rm-test-title").value,
        mode: el("rm-test-mode").value,
        durationMinutes: el("rm-test-duration").value,
        price: el("rm-test-price").value,
        marksPerQuestion: el("rm-test-marks").value,
        negativeMarks: el("rm-test-negative").value,
        status: el("rm-test-status").value,
        questions,
        scheduleStartAt: el("rm-test-start").value,
        scheduleEndAt: el("rm-test-end").value
      });
      const testId = el("rm-test-id").value;
      if (testId) payload.testId = testId;
      const saved = await httpsCallable(functions, "rmOwnerSaveTest")(payload);
      status("Test सेव हुआ: " + saved.data.testId);
      event.currentTarget.reset();
      el("rm-test-id").value = "";
      await refreshTests();
    } catch (e) { status(e.message || "Test सेव नहीं हुआ।"); }
    finally { button.disabled = false; }
  });
  document.querySelectorAll("[data-admin-module]").forEach(button => button.addEventListener("click", () => {
    const module = button.dataset.adminModule;
    testsPanel.hidden = module !== "tests";
    el("rm-admin-module-status").textContent = module === "tests"
      ? "Test Management खुला है।" : button.querySelector("b").textContent + " का cloud module अभी जोड़ा नहीं गया है।";
    if (module === "tests") refreshTests();
  }));
  return { destroy() { /* host owns route lifecycle */ } };
}
