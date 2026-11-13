import { summarizeStudentActivity, studentActivityCsv, studentActivityPrintHtml } from "./student-activity.mjs";
import { testAnalyticsCsv, testAnalyticsPrintHtml, filterAndSortTestAnalytics } from "./result-analytics.mjs";
// UI wiring is initialized by the Test Series host after Firebase Auth is ready.
import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { watchOwnerSession } from "./owner-session.mjs";
import { signInOwnerGoogle, signInOwnerEmail, enrollOwnerPhoneMfa, hasPhoneMfa, signOut } from "./admin-auth.js";
import { validateOwnerTestDraft } from "./admin-test-validation.mjs";

export function initOwnerAdminDashboard(auth, functions) {
  const el = id => document.getElementById(id);
  const login = el("rm-admin-login"), setup = el("rm-admin-mfa-setup"), otpPanel = el("rm-admin-otp"), home = el("rm-admin-home");
  let pendingVerification = null;
  const status = message => { el("rm-owner-login-status").textContent = message; };
  const paymentsPanel = el("rm-admin-payments-panel");
  const paymentsList = el("rm-admin-payments-list");
  const paymentsStatus = el("rm-admin-payments-status");
  const paymentsMore = el("rm-admin-payments-more");
  let paymentsCursor = null;
  let paymentsGeneration = 0;
  const reconciliationList = el("rm-admin-reconciliation-list");
  const reconciliationStatus = el("rm-admin-reconciliation-status");
  const reconciliationMore = el("rm-admin-reconciliation-more");
  let reconciliationCursor = null;
  let reconciliationGeneration = 0;
  let testManagementGeneration = 0;
  let testEditGeneration = 0;
  function clearPaymentHistory() {
    paymentsGeneration += 1;
    paymentsCursor = null;
    paymentsList.replaceChildren();
    paymentsStatus.textContent = "";
    paymentsMore.hidden = true;
    paymentsMore.disabled = false;
    reconciliationGeneration += 1;
    reconciliationCursor = null;
    reconciliationList.replaceChildren();
    reconciliationStatus.textContent = "";
    reconciliationMore.hidden = true;
    reconciliationMore.disabled = false;
  }
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
  const verifyOwnerSession = httpsCallable(functions, "rmGetOwnerAdminSession");
  // Firebase may restore an existing Owner login after a page refresh. Every
  // restored session must pass the same server-side UID + phone-MFA + App Check
  // callable before the privileged dashboard is revealed.
  const stopOwnerSessionWatch = watchOwnerSession({
    subscribe: callback => onAuthStateChanged(auth, callback),
    hasPhoneMfa,
    verifyOwner: async () => (await verifyOwnerSession({})).data,
    signOut: () => signOut(auth),
    onSignedOut: () => {
      clearPaymentHistory();
      clearTestManagement();
      clearStudentActivity();
      clearAnalytics();
      clearQuestionBank();
      home.hidden = true;
      setup.hidden = true;
      login.hidden = false;
    },
    onMfaRequired: () => {
      clearPaymentHistory();
      clearTestManagement();
      clearStudentActivity();
      clearAnalytics();
      clearQuestionBank();
      home.hidden = true;
      login.hidden = true;
      setup.hidden = false;
    },
    onAuthorized: (user, authorization) => {
      login.hidden = true;
      setup.hidden = true;
      home.hidden = false;
      el("rm-admin-owner-email").textContent = authorization.email || user.email || "Owner";
      el("rm-admin-module-status").textContent = "Login सफल। वास्तविक डेटा और बदलाव तभी उपलब्ध होंगे जब server-side Owner authorization तथा cloud modules deploy होंगे।";
    },
    onError: error => status(error.message || "Owner authorization असफल।")
  });
  el("rm-owner-google").addEventListener("click", async () => {
    try { status("Google Login…"); await signInOwnerGoogle(auth, () => showOtp()); }
    catch (e) { status(e.message || "Login असफल।"); }
  });
  el("rm-owner-email-login").addEventListener("click", async () => {
    try { status("Email Login…"); await signInOwnerEmail(auth, el("rm-owner-email").value, el("rm-owner-password").value, () => showOtp()); }
    catch (e) { status(e.message || "Login असफल।"); }
  });
  el("rm-owner-enroll-otp").addEventListener("click", async () => {
    try {
      await enrollOwnerPhoneMfa(auth, el("rm-owner-phone").value.trim(), () => showOtp());
      status("OTP सुरक्षा सक्रिय। अब Logout करके दोबारा Login करें ताकि OTP challenge जाँचा जा सके।");
      await signOut(auth); setup.hidden = true; login.hidden = false;
    } catch (e) { status(e.message || "OTP enrollment असफल।"); }
  });
  el("rm-owner-logout").addEventListener("click", async () => { clearPaymentHistory(); await signOut(auth); home.hidden = true; login.hidden = false; });
  const testsPanel = el("rm-admin-tests-panel");
  const testsList = el("rm-admin-tests-list");
  const testsMore = el("rm-admin-tests-more");
  const testsSearch = el("rm-admin-test-search");
  const testsFolderFilter = el("rm-admin-test-folder-filter");
  let testsCursor = null;
  let testsRows = [];
  function renderTestRows() {
    const term = testsSearch.value.trim().toLocaleLowerCase();
    const folder = testsFolderFilter.value;
    const visible = testsRows.filter(test => {
      const searchable = [test.title, test.testId, test.category, test.folder].join(" ").toLocaleLowerCase();
      return (!term || searchable.includes(term)) && (!folder || (test.folder || "General") === folder);
    });
    testsList.replaceChildren();
    if (!visible.length) {
      testsList.textContent = testsRows.length ? "इस खोज / Folder में कोई टेस्ट नहीं मिला।" : "अभी कोई टेस्ट नहीं है।";
      return;
    }
    visible.forEach(test => {
      const card = document.createElement("article");
      card.className = "rm-admin-test-row";
      const heading = document.createElement("b"); heading.textContent = test.title;
      const detail = document.createElement("small");
      detail.textContent = [test.category || "General", test.folder || "General", test.mode, test.status, test.questionCount + " प्रश्न", "₹" + test.price].join(" · ");
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = test.status === "published" ? "Copy to Draft" : "Edit";
      edit.addEventListener("click", () => loadTestForEdit(test.testId, test.status === "published"));
      card.append(heading, detail, edit); testsList.append(card);
    });
  }
  function updateTestListFilters() {
    const selectedFolder = testsFolderFilter.value;
    const folders = [...new Set(testsRows.map(test => test.folder || "General"))].sort();
    testsFolderFilter.replaceChildren(new Option("सभी फ़ोल्डर", ""));
    folders.forEach(folder => testsFolderFilter.add(new Option(folder, folder)));
    testsFolderFilter.value = folders.includes(selectedFolder) ? selectedFolder : "";
    renderTestRows();
  }
  function updateFreeTestOptions(data) {
    freeTestSelect.replaceChildren();
    const freeEligible = testsRows.filter(test => test.status === "published" && Number(test.price) === 0);
    if (!freeEligible.length) freeTestSelect.add(new Option("लोड किए गए टेस्ट में कोई पात्र प्रकाशित ₹0 टेस्ट नहीं", ""));
    else freeEligible.forEach(test => freeTestSelect.add(new Option(test.title + " · " + test.testId, test.testId)));
    const currentFreeTestId = data.freeTestId || "";
    if (currentFreeTestId && !Array.from(freeTestSelect.options).some(option => option.value === currentFreeTestId)) {
      const currentOption = new Option("वर्तमान चयन (सूची में अभी लोड नहीं): " + currentFreeTestId, currentFreeTestId);
      currentOption.disabled = true;
      freeTestSelect.add(currentOption);
    }
    freeTestSelect.value = currentFreeTestId;
    const freeTestLocked = data.freeTestLocked === true;
    freeTestSelect.disabled = freeTestLocked;
    el("rm-free-test-save").disabled = freeTestLocked;
    if (freeTestLocked) status("पहला विद्यार्थी निःशुल्क प्रयास ले चुका है। अब निःशुल्क टेस्ट का चयन स्थायी रूप से लॉक है।");
  }
  function clearTestManagement() {
    testManagementGeneration += 1;
    testEditGeneration += 1;
    testsCursor = null;
    testsRows = [];
    testsMore.hidden = true;
    testsMore.disabled = true;
    testsSearch.value = "";
    testsFolderFilter.replaceChildren(new Option("सभी फ़ोल्डर", ""));
    testsList.replaceChildren();
    testsList.textContent = "Owner session समाप्त। दोबारा सुरक्षित Login करें।";
    freeTestSelect.replaceChildren(new Option("पहले टेस्ट सूची Refresh करें", ""));
    freeTestSelect.disabled = true;
    el("rm-free-test-save").disabled = true;
    testForm.reset();
    el("rm-test-id").value = "";
    el("rm-test-questions").value = "";
  }
  async function refreshTests({ append = false } = {}) {
    if (append && !testsCursor) return;
    const generation = ++testManagementGeneration;
    if (!append) {
      testsCursor = null;
      testsRows = [];
      testsMore.hidden = true;
      testsList.textContent = "Cloud से टेस्ट सूची लोड हो रही है…";
    } else {
      testsMore.disabled = true;
      testsMore.textContent = "लोड हो रहा है…";
    }
    try {
      const result = await httpsCallable(functions, "rmOwnerListTests")({
        cursor: append ? testsCursor : null,
        pageSize: 50
      });
      if (generation !== testManagementGeneration) return;
      const data = result.data || {};
      const page = Array.isArray(data.tests) ? data.tests : [];
      testsRows = append ? testsRows.concat(page) : page;
      testsCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
      updateFreeTestOptions(data);
      updateTestListFilters();
      testsMore.hidden = !testsCursor;
      testsMore.disabled = !testsCursor;
      testsMore.textContent = "Load More Tests";
      if (data.hasMore && !testsCursor) status("अगले टेस्ट पेज का Cursor उपलब्ध नहीं हुआ। सूची Refresh करें।");
    } catch (e) {
      if (generation === testManagementGeneration) {
        testsList.textContent = e.message || "टेस्ट सूची लोड नहीं हुई।";
        testsMore.hidden = !append;
        testsMore.disabled = false;
        testsMore.textContent = "Retry Load More";
      }
    }
  }
  testsMore.addEventListener("click", () => refreshTests({ append: true }));
  testsSearch.addEventListener("input", renderTestRows);
  testsFolderFilter.addEventListener("change", renderTestRows);
  async function refreshPayments({ append = false } = {}) {
    if (append && !paymentsCursor) return;
    const generation = ++paymentsGeneration;
    if (!append) {
      paymentsCursor = null;
      paymentsList.replaceChildren();
      paymentsStatus.textContent = "सत्यापित भुगतान लोड हो रहे हैं…";
    } else {
      paymentsMore.disabled = true;
    }
    try {
      const response = await httpsCallable(functions, "rmOwnerListPayments")({
        cursor: append ? paymentsCursor : null,
        pageSize: 25
      });
      if (generation !== paymentsGeneration) return;
      const data = response.data || {};
      const payments = Array.isArray(data.payments) ? data.payments : [];
      if (!append) paymentsList.replaceChildren();
      payments.forEach(payment => {
        const card = document.createElement("article");
        card.className = "rm-admin-payment-row";
        const heading = document.createElement("b");
        const amountLabel = Number.isSafeInteger(payment.amountPaise)
          ? "₹" + (payment.amountPaise / 100).toFixed(2)
          : "राशि की समीक्षा आवश्यक";
        heading.textContent = amountLabel + " · " + (payment.status === "captured" ? "Captured" : "Review required");
        const detail = document.createElement("small");
        const date = payment.recordedAt ? new Date(payment.recordedAt) : null;
        const dateLabel = date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "समय उपलब्ध नहीं";
        detail.textContent = [
          payment.testId ? "Test " + payment.testId : "Test unavailable",
          payment.studentUid ? "Student UID " + payment.studentUid : "Student unavailable",
          "Payment " + payment.paymentId,
          payment.orderId ? "Order " + payment.orderId : "Order unavailable",
          dateLabel
        ].join(" · ");
        card.append(heading, detail);
        paymentsList.append(card);
      });
      paymentsCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
      paymentsMore.hidden = !paymentsCursor;
      paymentsMore.disabled = false;
      if (!payments.length && !append) paymentsStatus.textContent = "अभी कोई captured payment दर्ज नहीं है।";
      else if (data.hasMore) paymentsStatus.textContent = "हाल के captured payments दिखाए गए हैं।";
      else paymentsStatus.textContent = "सभी उपलब्ध captured payments दिखाए गए हैं।";
    } catch (error) {
      if (generation !== paymentsGeneration) return;
      paymentsStatus.textContent = error.message || "Payment history लोड नहीं हुई।";
      paymentsMore.disabled = false;
    }
  }

  async function refreshPaymentReconciliation({ append = false } = {}) {
    if (append && !reconciliationCursor) return;
    const generation = ++reconciliationGeneration;
    if (!append) {
      reconciliationCursor = null;
      reconciliationList.replaceChildren();
      reconciliationStatus.textContent = "अस्पष्ट भुगतान अनुरोध लोड हो रहे हैं…";
    } else {
      reconciliationMore.disabled = true;
    }
    try {
      const response = await httpsCallable(functions, "rmOwnerListPaymentReconciliation")({
        cursor: append ? reconciliationCursor : null,
        pageSize: 25
      });
      if (generation !== reconciliationGeneration) return;
      const data = response.data || {};
      const requests = Array.isArray(data.requests) ? data.requests : [];
      requests.forEach(request => {
        const card = document.createElement("article");
        card.className = "rm-admin-payment-row";
        const heading = document.createElement("b");
        const amountLabel = Number.isSafeInteger(request.amountPaise)
          ? "₹" + (request.amountPaise / 100).toFixed(2)
          : "राशि की समीक्षा आवश्यक";
        const stateLabel = request.status === "creating" ? "Provider order लंबित" : "Outcome अस्पष्ट · जाँच आवश्यक";
        heading.textContent = amountLabel + " · " + stateLabel;
        const detail = document.createElement("small");
        const formatRequestTime = value => {
          const date = value ? new Date(value) : null;
          return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "समय उपलब्ध नहीं";
        };
        const createdLabel = "Created " + formatRequestTime(request.createdAt);
        const updatedLabel = "Last update " + formatRequestTime(request.updatedAt);
        detail.textContent = [
          request.testId ? "Test " + request.testId : "Test unavailable",
          request.studentUid ? "Student UID " + request.studentUid : "Student unavailable",
          request.failureCode ? "Reason " + request.failureCode : "Reason not recorded",
          request.providerOrderIdObserved ? "Provider Order " + request.providerOrderIdObserved : "Provider Order not confirmed",
          request.receiptRef ? "Razorpay Receipt " + request.receiptRef : "Receipt unavailable",
          "Reference " + (request.requestRecordId || "unavailable"),
          createdLabel,
          updatedLabel
        ].join(" · ");
        card.append(heading, detail);
        reconciliationList.append(card);
      });
      reconciliationCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
      reconciliationMore.hidden = !reconciliationCursor;
      reconciliationMore.disabled = false;
      const scanNote = data.scanLimited === true ? " प्रत्येक जाँच-चक्र में अधिकतम 500 हालिया अनुरोध स्कैन होते हैं।" : "";
      if (!requests.length && data.hasMore) {
        reconciliationStatus.textContent = "इस 500-अनुरोध जाँच-खंड में कोई अस्पष्ट अनुरोध नहीं मिला। आगे जाँचने के लिए Load More दबाएँ।" + scanNote;
      } else if (!requests.length && !append) {
        reconciliationStatus.textContent = "अभी किसी भुगतान अनुरोध को reconciliation की आवश्यकता नहीं है।" + scanNote;
      } else if (data.hasMore) {
        reconciliationStatus.textContent = "अस्पष्ट अनुरोध दिखाए गए हैं। आगे के रिकॉर्ड के लिए Load More दबाएँ; नया Checkout शुरू कराने से पहले प्रत्येक परिणाम की जाँच करें।" + scanNote;
      } else {
        reconciliationStatus.textContent = "सभी उपलब्ध अस्पष्ट भुगतान अनुरोध दिखाए गए हैं।" + scanNote;
      }
    } catch (error) {
      if (generation !== reconciliationGeneration) return;
      reconciliationStatus.textContent = error.message || "Payment reconciliation सूची लोड नहीं हुई।";
      reconciliationMore.disabled = false;
    }
  }

  el("rm-admin-refresh-tests").addEventListener("click", refreshTests);
  el("rm-admin-refresh-payments").addEventListener("click", () => refreshPayments());
  paymentsMore.addEventListener("click", () => refreshPayments({ append: true }));
  el("rm-admin-refresh-reconciliation").addEventListener("click", () => refreshPaymentReconciliation());
  reconciliationMore.addEventListener("click", () => refreshPaymentReconciliation({ append: true }));
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
            options: options.map(value => String(value)), correctIndex,
            ...(String(normalized.section ?? "").trim() ? { section: String(normalized.section).trim() } : {}),
            ...(String(normalized.explanation ?? "").trim() ? { explanation: String(normalized.explanation).trim() } : {}) };
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
    const generation = testManagementGeneration;
    const editGeneration = ++testEditGeneration;
    try {
      const result = await httpsCallable(functions, "rmOwnerGetTest")({ testId });
      if (generation !== testManagementGeneration || editGeneration !== testEditGeneration) return;
      const t = result.data;
      // Published tests are immutable on the server. Copy them into a new draft
      // instead of presenting an Edit action that the backend will reject.
      el("rm-test-id").value = cloneAsDraft ? "" : t.testId;
      el("rm-test-title").value = t.title;
      el("rm-test-category").value = t.category || "General";
      el("rm-test-folder").value = t.folder || "General";
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
      // Restore this test's section timing configuration when editing or cloning.
      // Otherwise the shared Question Bank section editor could overwrite it.
      questionSections.splice(0, questionSections.length, ...(Array.isArray(t.sections)
        ? t.sections.map(section => ({ name: section.name, timeLimitMinutes: Number(section.timeLimitMinutes || 0) }))
        : []));
      activeQuestionSection = "";
      renderQuestionSections();
      status(cloneAsDraft ? "Published test की नई Draft copy तैयार है। मूल प्रकाशित टेस्ट सुरक्षित रहेगा।" : "Test Edit mode: " + t.testId);
      testForm.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { if (generation === testManagementGeneration && editGeneration === testEditGeneration) status(e.message || "Test details नहीं मिले।"); }
  }
  el("rm-admin-test-cancel").addEventListener("click", () => {
    testEditGeneration += 1;
    testForm.reset();
    el("rm-test-id").value = "";
    questionSections.splice(0);
    activeQuestionSection = "";
    renderQuestionSections();
  });
  testForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const generation = testManagementGeneration;
    try {
      const questions = JSON.parse(el("rm-test-questions").value);
      const payload = validateOwnerTestDraft({
        title: el("rm-test-title").value,
        category: el("rm-test-category").value,
        folder: el("rm-test-folder").value,
        mode: el("rm-test-mode").value,
        durationMinutes: el("rm-test-duration").value,
        price: el("rm-test-price").value,
        marksPerQuestion: el("rm-test-marks").value,
        negativeMarks: el("rm-test-negative").value,
        status: el("rm-test-status").value,
        questions,
        sections: questionSections,
        scheduleStartAt: el("rm-test-start").value,
        scheduleEndAt: el("rm-test-end").value
      });
      const testId = el("rm-test-id").value;
      if (testId) payload.testId = testId;
      const saved = await httpsCallable(functions, "rmOwnerSaveTest")(payload);
      if (generation !== testManagementGeneration) return;
      status("Test सेव हुआ: " + saved.data.testId);
      event.currentTarget.reset();
      el("rm-test-id").value = "";
      questionSections.splice(0);
      activeQuestionSection = "";
      renderQuestionSections();
      await refreshTests();
    } catch (e) { status(e.message || "Test सेव नहीं हुआ।"); }
    finally { button.disabled = false; }
  });
  const studentsPanel = el("rm-admin-students-panel");
  const studentsList = el("rm-admin-students-list");
  const studentsStatus = el("rm-admin-students-status");
  const studentsMore = el("rm-admin-students-more");
  const studentsSearch = el("rm-admin-students-search");
  const studentSummaries = el("rm-admin-student-summaries");
  const studentsExport = el("rm-admin-export-students");
  const studentsPrint = el("rm-admin-print-students");
  let studentsCursor = null;
  let studentsGeneration = 0;
  let studentActivityRows = [];
  function renderStudentActivity() {
    const term = studentsSearch.value.trim().toLocaleLowerCase();
    const visibleRows = studentActivityRows.filter(activity => {
      if (!term) return true;
      return [activity.studentUid, activity.testId, activity.testTitle]
        .some(value => String(value || "").toLocaleLowerCase().includes(term));
    });
    studentSummaries.replaceChildren();
    summarizeStudentActivity(studentActivityRows, term).forEach(summary => {
      const card = document.createElement("article");
      card.className = "rm-admin-payment-row";
      const heading = document.createElement("b");
      heading.textContent = "विद्यार्थी " + summary.studentUid.slice(0, 10) + "…";
      const detail = document.createElement("small");
      detail.textContent = [summary.attempts + " प्रयास", summary.testCount + " अलग टेस्ट", "औसत अंक " + summary.averageScore, summary.averageCorrectPercent === null ? "प्रतिशत उपलब्ध नहीं" : "औसत सही " + summary.averageCorrectPercent + "%", "अंतिम गतिविधि " + (summary.lastSubmittedAt ? new Date(summary.lastSubmittedAt).toLocaleString() : "अज्ञात")].join(" · ");
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "इस विद्यार्थी के परिणाम देखें";
      open.addEventListener("click", () => { studentsSearch.value = summary.studentUid; renderStudentActivity(); });
      card.append(heading, detail, open);
      studentSummaries.append(card);
    });
    studentsList.replaceChildren();
    visibleRows.forEach(activity => {
      const card = document.createElement("article");
      card.className = "rm-admin-payment-row";
      const heading = document.createElement("b");
      heading.textContent = (activity.testTitle || activity.testId || "Test") + " · " + Number(activity.score || 0) + " अंक";
      const detail = document.createElement("small");
      const submitted = activity.submittedAt ? new Date(activity.submittedAt) : null;
      const submittedLabel = submitted && Number.isFinite(submitted.getTime()) ? submitted.toLocaleString() : "समय उपलब्ध नहीं";
      const uidLabel = activity.studentUid ? activity.studentUid.slice(0, 10) + "…" : "विद्यार्थी अज्ञात";
      detail.textContent = [uidLabel, "सही " + activity.correct, "गलत " + activity.wrong, "छोड़े " + activity.unattempted, "कुल " + activity.totalQuestions, activity.timedOut ? "समय समाप्त" : "जमा", submittedLabel].join(" · ");
      card.append(heading, detail);
      studentsList.append(card);
    });
    studentsExport.disabled = visibleRows.length === 0;
    studentsPrint.disabled = visibleRows.length === 0;
    studentsStatus.textContent = term
      ? visibleRows.length + " परिणाम मिले · कुल " + studentActivityRows.length + " लोड हुए"
      : studentActivityRows.length ? studentActivityRows.length + " परीक्षा परिणाम लोड हुए।" : "अभी कोई जमा परीक्षा परिणाम नहीं है।";
    if (term && !visibleRows.length) studentsStatus.textContent = "इस खोज से कोई परिणाम नहीं मिला। Load More से पुराने परिणाम भी खोज सकते हैं।";
  }
  studentsPrint.addEventListener("click", () => {
    const term = studentsSearch.value.trim().toLocaleLowerCase();
    const visibleRows = studentActivityRows.filter(activity => !term ||
      [activity.studentUid, activity.testId, activity.testTitle]
        .some(value => String(value || "").toLocaleLowerCase().includes(term)));
    if (!visibleRows.length) return;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      studentsStatus.textContent = "रिपोर्ट विंडो ब्राउज़र ने रोकी। इस साइट के लिए pop-ups अनुमति दें।";
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(studentActivityPrintHtml(visibleRows));
    reportWindow.document.close();
    const printReport = () => {
      reportWindow.focus();
      reportWindow.print();
    };
    if (reportWindow.document.readyState === "complete") printReport();
    else reportWindow.addEventListener("load", printReport, { once: true });
  });
  function clearStudentActivity() {
    studentsGeneration += 1;
    studentsCursor = null;
    studentActivityRows = [];
    studentsSearch.value = "";
    studentsList.replaceChildren();
    studentSummaries.replaceChildren();
    studentsStatus.textContent = "";
    studentsMore.hidden = true;
    studentsMore.disabled = false;
  }
  async function refreshStudentActivity({ append = false } = {}) {
    if (append && !studentsCursor) return;
    const generation = ++studentsGeneration;
    if (!append) {
      studentsCursor = null;
      studentActivityRows = [];
      studentsList.replaceChildren();
      studentSummaries.replaceChildren();
      studentsStatus.textContent = "विद्यार्थी परीक्षा गतिविधि लोड हो रही है…";
    } else studentsMore.disabled = true;
    try {
      const response = await httpsCallable(functions, "rmOwnerListStudentActivity")({ cursor: append ? studentsCursor : null, pageSize: 25 });
      if (generation !== studentsGeneration) return;
      const data = response.data || {};
      const rows = Array.isArray(data.activities) ? data.activities : [];
      studentActivityRows = append ? studentActivityRows.concat(rows) : rows;
      studentsCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
      studentsMore.hidden = !studentsCursor;
      studentsMore.disabled = false;
      renderStudentActivity();
    } catch (error) {
      if (generation !== studentsGeneration) return;
      studentsStatus.textContent = error.message || "विद्यार्थी गतिविधि लोड नहीं हुई।";
      studentsMore.disabled = false;
    }
  }
  studentsSearch.addEventListener("input", renderStudentActivity);
  studentsExport.addEventListener("click", () => {
    const term = studentsSearch.value.trim().toLocaleLowerCase();
    const rows = studentActivityRows.filter(activity => !term || [activity.studentUid, activity.testId, activity.testTitle].some(value => String(value || "").toLocaleLowerCase().includes(term)));
    if (!rows.length) return;
    const blob = new Blob(["\uFEFF", studentActivityCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "railway-mitra-student-results-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    studentsStatus.textContent = rows.length + " लोड हुए परिणाम CSV में निर्यात हुए।";
  });
  el("rm-admin-refresh-students").addEventListener("click", () => refreshStudentActivity());
  studentsMore.addEventListener("click", () => refreshStudentActivity({ append: true }));
  const questionBankPanel = el("rm-admin-question-bank-panel");
  const questionBankStatus = el("rm-admin-question-bank-status");
  const questionBankList = el("rm-admin-question-bank-list");
  const questionBankForm = el("rm-admin-question-bank-form");
  const questionBankMore = el("rm-qb-load-more");
  let questionBankGeneration = 0;
  let questionBankCursor = null;
  let questionBankFilters = { topic: "", chapter: "", folder: "" };
  let questionBankItems = [];
  const selectedQuestionBankIds = new Set();
  const questionSections = [];
  let activeQuestionSection = "";
  function updateQuestionBankSelectionStatus() {
    el("rm-qb-selection-status").textContent = selectedQuestionBankIds.size + " प्रश्न चयनित हैं।";
  }
  function questionBankItemAsTestQuestion(item) {
    return { id: "bank_" + item.itemId, text: item.question?.text || "",
      options: Array.isArray(item.question?.options) ? item.question.options : [],
      correctIndex: Number(item.correctIndex), explanation: item.question?.explanation || "",
      ...((activeQuestionSection || item.question?.section) ? { section: activeQuestionSection || item.question.section } : {}) };
  }
  function renderQuestionSections() {
    const list = el("rm-qb-sections-list"); list.replaceChildren();
    const select = document.createElement("select"); select.id = "rm-qb-active-section";
    select.add(new Option("बिना सेक्शन", ""));
    questionSections.forEach(section => select.add(new Option(section.name, section.name)));
    select.value = activeQuestionSection;
    select.addEventListener("change", () => { activeQuestionSection = select.value; });
    const label = document.createElement("label"); label.textContent = "प्रश्न जोड़ने का सक्रिय सेक्शन ";
    label.append(select); list.append(label);
    questionSections.forEach(section => {
      const row = document.createElement("div"); row.className = "rm-admin-payment-row";
      const title = document.createElement("b"); title.textContent = section.name;
      const count = document.createElement("small");
      count.textContent = "जुड़े प्रश्न: " + questionBankItems.filter(item => item.question?.section === section.name).length + " · समय: " + (section.timeLimitMinutes ? section.timeLimitMinutes + " मिनट" : "अलग सीमा नहीं");
      const time = document.createElement("input"); time.type = "number"; time.min = "0"; time.max = "240"; time.step = "1"; time.value = String(section.timeLimitMinutes); time.setAttribute("aria-label", section.name + " समय सीमा मिनट");
      time.addEventListener("change", () => {
        const value = Number(time.value);
        if (!Number.isInteger(value) || value < 0 || value > 240) { time.value = String(section.timeLimitMinutes); el("rm-qb-sections-status").textContent = "सेक्शन समय 0 से 240 मिनट के बीच रखें।"; return; }
        section.timeLimitMinutes = value;
        renderQuestionSections();
      });
      row.append(title, count, time); list.append(row);
    });
    el("rm-qb-sections-status").textContent = questionSections.length
      ? questionSections.length + " सेक्शन बने हैं। प्रश्न जोड़ने से पहले सक्रिय सेक्शन चुनें।"
      : "सेक्शन अभी नहीं बनाए गए हैं।";
  }
  el("rm-qb-create-section").addEventListener("click", () => {
    const name = el("rm-qb-section-name").value.trim();
    if (!name || name.length > 80) { el("rm-qb-sections-status").textContent = "सेक्शन का नाम 1 से 80 अक्षरों का होना चाहिए।"; return; }
    if (questionSections.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      el("rm-qb-sections-status").textContent = "यह सेक्शन पहले से मौजूद है।"; return;
    }
    const timeLimitMinutes = Number(el("rm-qb-section-time").value);
    if (!Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 0 || timeLimitMinutes > 240) { el("rm-qb-sections-status").textContent = "सेक्शन समय 0 से 240 मिनट के बीच रखें।"; return; }
    questionSections.push({ name, timeLimitMinutes }); activeQuestionSection = name;
    el("rm-qb-section-name").value = "";
    renderQuestionSections();
  });
  el("rm-qb-clear-sections").addEventListener("click", () => {
    questionSections.splice(0); activeQuestionSection = ""; renderQuestionSections();
  });
  renderQuestionSections();
  function addQuestionBankItemsToTest(items) {
    const target = el("rm-test-questions");
    let current;
    try { current = target.value.trim() ? JSON.parse(target.value) : []; }
    catch { questionBankStatus.textContent = "पहले Test Management में प्रश्न JSON ठीक करें।"; return; }
    if (!Array.isArray(current)) { questionBankStatus.textContent = "Test प्रश्न सूची Array होनी चाहिए।"; return; }
    const known = new Set(current.map(question => question.id));
    const additions = items.map(questionBankItemAsTestQuestion).filter(question => !known.has(question.id));
    if (!additions.length) { questionBankStatus.textContent = "चयनित प्रश्न पहले से इस टेस्ट में मौजूद हैं।"; return; }
    target.value = JSON.stringify(current.concat(additions), null, 2);
    questionBankStatus.textContent = additions.length + " प्रश्न Test Management के प्रश्न बॉक्स में जोड़ दिए गए। टेस्ट सुरक्षित करने के लिए Save Test दबाएँ।";
  }
  function resetQuestionBankForm() {
    questionBankForm.reset();
    el("rm-qb-item-id").value = "";
    el("rm-qb-question-section").value = "";
    el("rm-qb-save").textContent = "प्रश्न सुरक्षित करें";
    el("rm-qb-cancel-edit").hidden = true;
  }
  function clearQuestionBank() {
    questionBankGeneration += 1;
    questionBankCursor = null;
    questionBankItems = [];
    selectedQuestionBankIds.clear();
    updateQuestionBankSelectionStatus();
    questionBankList.replaceChildren();
    questionBankStatus.textContent = "";
    questionBankMore.hidden = true;
    questionBankMore.disabled = true;
    resetQuestionBankForm();
  }
  function renderQuestionBankItems(items, append) {
    if (!append) questionBankList.replaceChildren();
    items.forEach(item => {
      const card = document.createElement("article"); card.className = "rm-admin-payment-row";
      const selectLabel = document.createElement("label");
      const selectBox = document.createElement("input"); selectBox.type = "checkbox";
      selectBox.checked = selectedQuestionBankIds.has(item.itemId);
      selectBox.addEventListener("change", () => {
        if (selectBox.checked) selectedQuestionBankIds.add(item.itemId);
        else selectedQuestionBankIds.delete(item.itemId);
        updateQuestionBankSelectionStatus();
      });
      selectLabel.append(selectBox, document.createTextNode(" टेस्ट में जोड़ने हेतु चुनें"));
      const heading = document.createElement("b"); heading.textContent = item.question?.text || "प्रश्न";
      const detail = document.createElement("small");
      detail.textContent = [item.topic, item.chapter, item.folder, item.question?.section ? "सेक्शन: " + item.question.section : "", "विकल्प " + (item.question?.options?.length || 0), "सही उत्तर " + (Number(item.correctIndex) + 1)].filter(Boolean).join(" · ");
      const actions = document.createElement("div"); actions.className = "rm-admin-form-grid";
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        el("rm-qb-item-id").value = item.itemId;
        el("rm-qb-question-section").value = item.question?.section || "";
        el("rm-qb-topic").value = item.topic || "";
        el("rm-qb-chapter").value = item.chapter || "";
        el("rm-qb-folder").value = item.folder || "General";
        el("rm-qb-question").value = JSON.stringify({ ...item.question, correctIndex: item.correctIndex }, null, 2);
        el("rm-qb-save").textContent = "बदलाव सुरक्षित करें";
        el("rm-qb-cancel-edit").hidden = false;
        questionBankForm.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const addToTest = document.createElement("button"); addToTest.type = "button"; addToTest.textContent = "Add to Test";
      addToTest.addEventListener("click", () => {
        const target = el("rm-test-questions");
        let current;
        try { current = target.value.trim() ? JSON.parse(target.value) : []; }
        catch { questionBankStatus.textContent = "पहले Test Management में प्रश्न JSON ठीक करें।"; return; }
        if (!Array.isArray(current)) { questionBankStatus.textContent = "Test प्रश्न सूची Array होनी चाहिए।"; return; }
        const question = { id: "bank_" + item.itemId, text: item.question?.text || "",
          options: Array.isArray(item.question?.options) ? item.question.options : [],
          correctIndex: Number(item.correctIndex), explanation: item.question?.explanation || "",
          ...((activeQuestionSection || item.question?.section) ? { section: activeQuestionSection || item.question.section } : {}) };
        if (current.some(existing => existing.id === question.id)) { questionBankStatus.textContent = "यह प्रश्न इस टेस्ट में पहले से जोड़ा गया है।"; return; }
        current.push(question);
        target.value = JSON.stringify(current, null, 2);
        questionBankStatus.textContent = "प्रश्न Test Management के प्रश्न बॉक्स में जुड़ गया। टेस्ट सुरक्षित करने के लिए Save Test दबाएँ।";
      });
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!window.confirm("क्या यह प्रश्न स्थायी रूप से हटाना चाहते हैं?")) return;
        remove.disabled = true;
        try {
          await httpsCallable(functions, "rmOwnerDeleteQuestionBankItem")({ itemId: item.itemId });
          if (el("rm-qb-item-id").value === item.itemId) resetQuestionBankForm();
          questionBankStatus.textContent = "प्रश्न हटा दिया गया।";
          await refreshQuestionBank();
        } catch (error) { questionBankStatus.textContent = error.message || "प्रश्न हटाया नहीं जा सका।"; remove.disabled = false; }
      });
      actions.append(edit, addToTest, remove);
      card.append(selectLabel, heading, detail, actions); questionBankList.append(card);
    });
  }
  function updateQuestionBankFilterOptions(facets) {
    [["topic", "topics"], ["chapter", "chapters"], ["folder", "folders"]].forEach(([field, key]) => {
      const select = el("rm-qb-filter-" + field);
      const selected = questionBankFilters[field];
      select.replaceChildren(new Option(field === "topic" ? "सभी विषय" : field === "chapter" ? "सभी अध्याय" : "सभी फ़ोल्डर", ""));
      (Array.isArray(facets?.[key]) ? facets[key] : []).forEach(value => select.add(new Option(value, value)));
      select.value = selected;
      const bulkSelect = el("rm-qb-add-" + field);
      const bulkValue = bulkSelect.value;
      bulkSelect.replaceChildren(new Option(field === "topic" ? "विषय चुनें" : field === "chapter" ? "अध्याय चुनें" : "फ़ोल्डर चुनें", ""));
      (Array.isArray(facets?.[key]) ? facets[key] : []).forEach(value => bulkSelect.add(new Option(value, value)));
      bulkSelect.value = bulkValue;
    });
  }
  async function refreshQuestionBank({ append = false } = {}) {
    if (append && !questionBankCursor) return;
    const generation = ++questionBankGeneration;
    if (!append) {
      questionBankCursor = null;
      questionBankItems = [];
      questionBankList.replaceChildren();
      questionBankStatus.textContent = "प्रश्न बैंक लोड हो रहा है…";
    } else questionBankMore.disabled = true;
    try {
      const response = await httpsCallable(functions, "rmOwnerListQuestionBank")({
        pageSize: 25, cursor: append ? questionBankCursor : null, ...questionBankFilters,
        search: el("rm-qb-search").value.trim()
      });
      if (generation !== questionBankGeneration) return;
      const data = response.data || {};
      const items = Array.isArray(data.items) ? data.items : [];
      questionBankItems = append ? questionBankItems.concat(items) : items;
      renderQuestionBankItems(items, append);
      questionBankCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
      questionBankMore.hidden = !questionBankCursor;
      questionBankMore.disabled = false;
      updateQuestionBankFilterOptions(data.facets);
      questionBankStatus.textContent = questionBankItems.length + " प्रश्न दिखाए जा रहे हैं।" + (data.hasMore ? " और प्रश्न उपलब्ध हैं।" : " सभी मेल खाते प्रश्न दिखा दिए गए हैं।");
    } catch (error) {
      if (generation !== questionBankGeneration) return;
      questionBankStatus.textContent = error.message || "Question Bank लोड नहीं हुआ।";
      questionBankMore.disabled = false;
    }
  }
  questionBankForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = el("rm-qb-save"); submit.disabled = true;
    questionBankStatus.textContent = "प्रश्न सुरक्षित किया जा रहा है…";
    try {
      let question;
      try { question = JSON.parse(el("rm-qb-question").value); }
      catch { throw new Error("प्रश्न JSON सही प्रारूप में नहीं है।"); }
      const itemId = el("rm-qb-item-id").value;
      await httpsCallable(functions, "rmOwnerSaveQuestionBankItem")({
        ...(itemId ? { itemId } : {}), topic: el("rm-qb-topic").value,
        chapter: el("rm-qb-chapter").value, folder: el("rm-qb-folder").value, question
      });
      resetQuestionBankForm();
      questionBankStatus.textContent = itemId ? "प्रश्न में बदलाव सुरक्षित हो गया।" : "प्रश्न सुरक्षित हो गया।";
      await refreshQuestionBank();
    } catch (error) { questionBankStatus.textContent = error.message || "प्रश्न सुरक्षित नहीं हुआ।"; }
    finally { submit.disabled = false; }
  });
  el("rm-qb-cancel-edit").addEventListener("click", resetQuestionBankForm);
  el("rm-qb-add-scope").addEventListener("click", () => {
    const topic = el("rm-qb-add-topic").value;
    const chapter = el("rm-qb-add-chapter").value;
    const folder = el("rm-qb-add-folder").value;
    if (!topic && !chapter && !folder) {
      questionBankStatus.textContent = "पहले विषय, अध्याय या फ़ोल्डर चुनें।";
      return;
    }
    const selected = questionBankItems.filter(item =>
      (!topic || item.topic === topic) &&
      (!chapter || item.chapter === chapter) &&
      (!folder || item.folder === folder)
    );
    if (!selected.length) {
      questionBankStatus.textContent = "वर्तमान में लोड प्रश्नों में इस समूह का कोई प्रश्न नहीं मिला। फ़िल्टर लगाकर या Load More से प्रश्न लाएँ।";
      return;
    }
    addQuestionBankItemsToTest(selected);
  });
  el("rm-qb-select-visible").addEventListener("click", () => {
    questionBankItems.forEach(item => selectedQuestionBankIds.add(item.itemId));
    questionBankList.querySelectorAll("input[type=checkbox]").forEach(box => { box.checked = true; });
    updateQuestionBankSelectionStatus();
  });
  el("rm-qb-clear-selection").addEventListener("click", () => {
    selectedQuestionBankIds.clear();
    questionBankList.querySelectorAll("input[type=checkbox]").forEach(box => { box.checked = false; });
    updateQuestionBankSelectionStatus();
  });
  el("rm-qb-add-selected").addEventListener("click", () => {
    const selected = questionBankItems.filter(item => selectedQuestionBankIds.has(item.itemId));
    if (!selected.length) { questionBankStatus.textContent = "पहले प्रश्न चुनें।"; return; }
    addQuestionBankItemsToTest(selected);
  });
  el("rm-admin-refresh-question-bank").addEventListener("click", () => refreshQuestionBank());
  questionBankMore.addEventListener("click", () => refreshQuestionBank({ append: true }));
  el("rm-qb-apply-filters").addEventListener("click", () => {
    questionBankFilters = {
      topic: el("rm-qb-filter-topic").value,
      chapter: el("rm-qb-filter-chapter").value,
      folder: el("rm-qb-filter-folder").value
    };
    refreshQuestionBank();
  });
  el("rm-qb-search").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); refreshQuestionBank(); }
  });
  el("rm-qb-clear-filters").addEventListener("click", () => {
    questionBankFilters = { topic: "", chapter: "", folder: "" };
    el("rm-qb-search").value = "";
    ["topic", "chapter", "folder"].forEach(field => { el("rm-qb-filter-" + field).value = ""; });
    refreshQuestionBank();
  });
  el("rm-qb-bulk-import").addEventListener("click", async () => {
    const file = el("rm-qb-bulk-file").files?.[0];
    if (!file) { questionBankStatus.textContent = "पहले Excel, CSV या JSON file चुनें।"; return; }
    const button = el("rm-qb-bulk-import"); button.disabled = true;
    questionBankStatus.textContent = "File पढ़ी जा रही है…";
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let rows;
      if (ext === "json") {
        const parsed = JSON.parse(await file.text());
        rows = Array.isArray(parsed) ? parsed : parsed.items || parsed.questions;
      } else if (["xlsx", "xls", "csv"].includes(ext)) {
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      } else throw new Error("केवल XLSX, XLS, CSV या JSON file समर्थित है।");
      if (!Array.isArray(rows) || !rows.length) throw new Error("File में प्रश्न नहीं मिले।");
      if (rows.length > 100) throw new Error("एक बार में अधिकतम 100 प्रश्न आयात करें।");
      const items = rows.map(row => {
        const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]));
        let options = normalized.options;
        if (typeof options === "string" && options.trim().startsWith("[")) options = JSON.parse(options);
        if (!Array.isArray(options)) options = ["a", "b", "c", "d", "e", "f"].map(key => normalized["option" + key.toUpperCase()]).filter(value => value !== "");
        const rawIndex = normalized.correctindex ?? normalized.correct_index ?? normalized.answerindex;
        return {
          topic: String(normalized.topic || el("rm-qb-topic").value || "").trim(),
          chapter: String(normalized.chapter || el("rm-qb-chapter").value || "").trim(),
          folder: String(normalized.folder || el("rm-qb-folder").value || "General").trim(),
          question: { text: String(normalized.text ?? normalized.question ?? "").trim(),
            ...(String(normalized.section || "").trim() ? { section: String(normalized.section).trim() } : {}),
            options: Array.isArray(options) ? options.map(value => String(value)) : [],
            correctIndex: rawIndex === undefined || rawIndex === null || String(rawIndex).trim() === "" ? NaN : Number(rawIndex),
            explanation: String(normalized.explanation || "") }
        };
      });
      // Reject malformed rows in the browser before sending a bulk write.
      // Server validation remains authoritative; this gives the Owner a precise
      // row-level error instead of a generic callable failure.
      items.forEach((item, index) => {
        const question = item.question;
        if (!question.text) throw new Error("पंक्ति " + (index + 1) + ": प्रश्न का टेक्स्ट खाली है।");
        if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6 ||
            question.options.some(option => !String(option).trim())) {
          throw new Error("पंक्ति " + (index + 1) + ": 2 से 6 गैर-खाली विकल्प आवश्यक हैं।");
        }
        if (!Number.isInteger(question.correctIndex) ||
            question.correctIndex < 0 || question.correctIndex >= question.options.length) {
          throw new Error("पंक्ति " + (index + 1) + ": सही उत्तर का क्रमांक विकल्पों की सीमा में होना चाहिए।");
        }
        if (!item.topic || !item.chapter || !item.folder) {
          throw new Error("पंक्ति " + (index + 1) + ": विषय, अध्याय और फ़ोल्डर भरें।");
        }
      });
      const result = await httpsCallable(functions, "rmOwnerBulkSaveQuestionBank")({ items });
      questionBankStatus.textContent = result.data.saved + " प्रश्न सुरक्षित हुए।";
      el("rm-qb-bulk-file").value = "";
      await refreshQuestionBank();
    } catch (error) { questionBankStatus.textContent = error.message || "Bulk import पूरा नहीं हुआ।"; }
    finally { button.disabled = false; }
  });
  const analyticsPanel = el("rm-admin-analytics-panel");
  const analyticsStatus = el("rm-admin-analytics-status");
  const analyticsSummary = el("rm-admin-analytics-summary");
  const analyticsTests = el("rm-admin-analytics-tests");
  let analyticsGeneration = 0;
  let analyticsData = null;
  const analyticsCsvButton = el("rm-admin-export-test-analytics");
  const analyticsPrintButton = el("rm-admin-print-test-analytics");
  const analyticsSearch = el("rm-admin-analytics-search");
  const analyticsSort = el("rm-admin-analytics-sort");
  const analyticsFilterStatus = el("rm-admin-analytics-filter-status");
  function visibleAnalyticsData() {
    if (!analyticsData) return null;
    return { ...analyticsData, tests: filterAndSortTestAnalytics(analyticsData.tests, analyticsSearch.value, analyticsSort.value) };
  }
  function renderAnalyticsTests() {
    analyticsTests.replaceChildren();
    const visible = visibleAnalyticsData()?.tests || [];
    visible.forEach(item => {
      const row = document.createElement("article"); row.className = "rm-admin-payment-row";
      const heading = document.createElement("b"); heading.textContent = (item.title || item.testId || "Test") + " · " + item.attempts + " प्रयास";
      const detail = document.createElement("small");
      detail.textContent = ["औसत अंक " + item.averageScore, "औसत सही " + (item.averageCorrectPercent === null ? "—" : item.averageCorrectPercent + "%"), "समय समाप्त " + item.timedOut].join(" · ");
      row.append(heading, detail); analyticsTests.append(row);
    });
    const total = Array.isArray(analyticsData?.tests) ? analyticsData.tests.length : 0;
    analyticsFilterStatus.textContent = analyticsData ? visible.length + " / " + total + " टेस्ट दिखाए जा रहे हैं।" : "";
    analyticsCsvButton.disabled = visible.length === 0;
    analyticsPrintButton.disabled = visible.length === 0;
  }
  analyticsSearch.addEventListener("input", renderAnalyticsTests);
  analyticsSort.addEventListener("change", renderAnalyticsTests);
  function clearAnalytics() {
    analyticsGeneration += 1;
    analyticsSummary.replaceChildren();
    analyticsTests.replaceChildren();
    analyticsSearch.value = "";
    analyticsSort.value = "attempts";
    analyticsFilterStatus.textContent = "";
    analyticsStatus.textContent = "";
    analyticsData = null;
    analyticsCsvButton.disabled = true;
    analyticsPrintButton.disabled = true;
  }
  async function refreshAnalytics() {
    const generation = ++analyticsGeneration;
    analyticsStatus.textContent = "सर्वर से विश्लेषण लोड हो रहा है…";
    analyticsData = null;
    analyticsCsvButton.disabled = true;
    analyticsPrintButton.disabled = true;
    analyticsSummary.replaceChildren();
    analyticsTests.replaceChildren();
    analyticsSearch.value = "";
    analyticsSort.value = "attempts";
    analyticsFilterStatus.textContent = "";
    try {
      const response = await httpsCallable(functions, "rmOwnerGetResultAnalytics")({});
      if (generation !== analyticsGeneration) return;
      const data = response.data || {};
      analyticsData = data;
      analyticsCsvButton.disabled = !Array.isArray(data.tests) || data.tests.length === 0;
      analyticsPrintButton.disabled = !Array.isArray(data.tests) || data.tests.length === 0;
      const cards = [
        ["जमा परीक्षाएँ", data.sampledAttempts || 0],
        ["औसत अंक", data.averageScore ?? 0],
        ["औसत सही उत्तर %", data.averageCorrectPercent === null ? "—" : data.averageCorrectPercent + "%"],
        ["समय समाप्त", data.timedOut || 0]
      ];
      cards.forEach(([label, value]) => {
        const card = document.createElement("article");
        card.className = "rm-admin-payment-row";
        const heading = document.createElement("b"); heading.textContent = String(value);
        const detail = document.createElement("small"); detail.textContent = label;
        card.append(heading, detail); analyticsSummary.append(card);
      });
      renderAnalyticsTests();
      analyticsStatus.textContent = (data.window === "latest_500_submissions" ? "नवीनतम " : "") + data.sampledAttempts + " परिणामों का विश्लेषण।" + (data.hasMore ? " पुराने परिणाम इस सीमित रिपोर्ट में शामिल नहीं हैं।" : "");
    } catch (error) {
      if (generation !== analyticsGeneration) return;
      analyticsStatus.textContent = error.message || "विश्लेषण लोड नहीं हुआ।";
    }
  }
  analyticsCsvButton.addEventListener("click", () => {
    const reportData = visibleAnalyticsData();
    if (!reportData?.tests?.length) return;
    const blob = new Blob(["\uFEFF", testAnalyticsCsv(reportData)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "railway-mitra-test-wise-performance.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  });
  analyticsPrintButton.addEventListener("click", () => {
    const reportData = visibleAnalyticsData();
    if (!reportData?.tests?.length) return;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      analyticsStatus.textContent = "रिपोर्ट विंडो ब्राउज़र ने रोकी। इस साइट के लिए pop-ups अनुमति दें।";
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(testAnalyticsPrintHtml(reportData));
    reportWindow.document.close();
    const printReport = () => { reportWindow.focus(); reportWindow.print(); };
    if (reportWindow.document.readyState === "complete") printReport();
    else reportWindow.addEventListener("load", printReport, { once: true });
  });
  el("rm-admin-refresh-analytics").addEventListener("click", refreshAnalytics);
  document.querySelectorAll("[data-admin-module]").forEach(button => button.addEventListener("click", () => {
    const module = button.dataset.adminModule;
    testsPanel.hidden = module !== "tests";
    paymentsPanel.hidden = module !== "payments";
    studentsPanel.hidden = module !== "students";
    analyticsPanel.hidden = module !== "analytics";
    questionBankPanel.hidden = module !== "questions";
    el("rm-admin-module-status").textContent = module === "tests"
      ? "Test Management खुला है।"
      : module === "payments"
        ? "सत्यापित भुगतान और अस्पष्ट Razorpay Order परिणामों की सुरक्षित Owner-only सूची।"
        : module === "students" ? "केवल server-verified परीक्षा परिणाम का सारांश दिखाया जाता है।"
        : module === "analytics" ? "नवीनतम 500 जमा परिणामों का server-side विश्लेषण।"
        : module === "questions" ? "विषय, अध्याय और फ़ोल्डर के अनुसार प्रश्न बैंक।"
        : button.querySelector("b").textContent + " का cloud module अभी जोड़ा नहीं गया है।";
    if (module === "tests") refreshTests();
    if (module === "payments") { refreshPayments(); refreshPaymentReconciliation(); }
    if (module === "students") refreshStudentActivity();
    if (module === "analytics") refreshAnalytics();
    if (module === "questions") refreshQuestionBank();
  }));
  return { destroy() { stopOwnerSessionWatch(); } };
}
