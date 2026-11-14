import { listAvailableCbtTests, claimFreeCbtAttempt, startCbtExam } from "../cloud/student-client.js";
import { startStudentTestCheckout } from "./payment-checkout.js";
import {
  requirePaymentSessionStorage,
  hasPaymentBeenSubmitted,
  markPaymentSubmitted,
  clearPaymentSubmitted
} from "./payment-request-session.mjs";

// Keep payment-submitted state across catalogue refreshes and page reloads in this tab.
const pendingPaymentChecks = new Set();

export async function initStudentTestCatalogue({ app, studentUid, root = document, onStart }) {
  const status = root.getElementById("rm-catalogue-status");
  const list = root.getElementById("rm-catalogue-list");
  if (typeof onStart !== "function") throw new Error("onStart callback is required");
  if (typeof studentUid !== "string" || !studentUid) throw new Error("A verified student account is required");

  status.textContent = "Loading published tests…";
  list.replaceChildren();
  let storage = null;
  try { storage = requirePaymentSessionStorage(root); } catch { /* Checkout remains unavailable without session storage. */ }

  let cursor = null;
  let hasMore = false;
  let loading = false;
  const seen = new Set();
  let loadButton = null;

  async function loadPage({ append = false } = {}) {
    if (loading) return;
    loading = true;
    if (!append) {
      status.textContent = "Loading published tests…";
      list.replaceChildren();
      seen.clear();
      cursor = null;
    }
    if (loadButton) loadButton.disabled = true;
    try {
      const page = await listAvailableCbtTests(app, { pageSize: 50, cursor });
      const tests = page.tests || [];
      cursor = page.nextCursor || null;
      hasMore = Boolean(page.hasMore);

      if (!append && !tests.length) {
        status.textContent = "अभी कोई प्रकाशित परीक्षा उपलब्ध नहीं है।";
        return;
      }

      for (const test of tests) {
        if (seen.has(test.testId)) continue;
        seen.add(test.testId);
        const card = root.createElement("article");
        card.className = "rm-catalogue-card";
        const title = root.createElement("h2");
        title.textContent = test.title || "Untitled Test";
        const meta = root.createElement("div");
        meta.className = "rm-catalogue-meta";
        const details = [
          test.category || "General",
          test.folder || "General",
          test.mode === "scheduled" ? "Scheduled" : "Mock Test",
          (test.durationMinutes || 0) + " min",
          (test.questionCount || 0) + " questions",
          test.accessType === "free_trial" ? "Free first attempt" : test.accessType === "paid" ? "₹" + test.price : test.accessType === "unlocked" ? "Purchased - Unlocked" : "Access unavailable"
        ];
        if (test.mode === "scheduled" && test.scheduleStartAt) details.push("Starts " + new Date(test.scheduleStartAt).toLocaleString());
        details.forEach(value => { const tag = root.createElement("span"); tag.textContent = value; meta.append(tag); });

        const button = root.createElement("button");
        button.type = "button";
        const paymentStateKey = studentUid + ":" + test.testId;
        const paymentSubmitted = pendingPaymentChecks.has(paymentStateKey) || hasPaymentBeenSubmitted(storage, studentUid, test.testId);
        if (paymentSubmitted) pendingPaymentChecks.add(paymentStateKey);
        button.textContent = paymentSubmitted ? "Check Payment Status" : test.accessType === "free_trial" ? "Start Free Test" : test.accessType === "paid" ? "Pay & Unlock Test" : test.accessType === "unlocked" ? "Start Test" : "Not Available";
        button.disabled = paymentSubmitted ? false : test.accessType !== "free_trial" && test.accessType !== "paid" && test.accessType !== "unlocked";
        button.addEventListener("click", async () => {
          if (pendingPaymentChecks.has(paymentStateKey) || hasPaymentBeenSubmitted(storage, studentUid, test.testId)) {
            button.disabled = true;
            status.textContent = "Checking server-verified payment status…";
            let checkCursor = null, latestTest = null, pagesChecked = 0;
            do {
              const page = await listAvailableCbtTests(app, { pageSize: 100, cursor: checkCursor });
              latestTest = (page.tests || []).find(item => item.testId === test.testId) || latestTest;
              checkCursor = page.nextCursor || null;
              pagesChecked++;
              if (latestTest || !page.hasMore || pagesChecked >= 100) break;
            } while (true);
            if (latestTest?.accessType === "unlocked") {
              pendingPaymentChecks.delete(paymentStateKey);
              clearPaymentSubmitted(storage, studentUid, test.testId);
              status.textContent = "Payment verified. Your test is unlocked.";
              await loadPage({ append: false });
            } else {
              status.textContent = "Payment is not verified yet. Please wait for confirmation, then check again. Do not pay again.";
              button.disabled = false;
            }
            return;
          }
          button.disabled = true;
          status.textContent = test.accessType === "paid" ? "Opening secure payment…" : test.accessType === "unlocked" ? "Starting your purchased test…" : "Preparing your free attempt…";
          try {
            if (test.accessType === "unlocked") {
              const session = await startCbtExam(app, test.testId);
              await onStart({ test, session });
              return;
            }
            if (test.accessType === "paid") {
              await startStudentTestCheckout({
                app, test, studentUid, root,
                onStatus: message => { status.textContent = message; }
              });
              markPaymentSubmitted(storage, studentUid, test.testId);
              pendingPaymentChecks.add(paymentStateKey);
              button.textContent = "Check Payment Status";
              button.disabled = false;
              return;
            }
            let claim;
            try { claim = await claimFreeCbtAttempt(app); }
            catch (error) {
              if (!String(error.code || "").includes("already-exists")) throw error;
              claim = { alreadyClaimed: true };
            }
            await onStart({ test, session: claim });
          } catch (error) {
            status.textContent = error.message || "Test could not be started.";
            button.disabled = false;
          }
        });
        card.dataset.testId = test.testId;
        card.dataset.accessType = test.accessType;
        card.append(title, meta, button);
        list.append(card);
      }

      status.textContent = seen.size + " tests loaded" + (hasMore ? " · more available" : "");
      if (loadButton) loadButton.remove();
      loadButton = null;
      if (hasMore) {
        loadButton = root.createElement("button");
        loadButton.type = "button";
        loadButton.className = "rm-catalogue-load-more";
        loadButton.textContent = "Load more tests";
        loadButton.addEventListener("click", () => loadPage({ append: true }));
        list.append(loadButton);
      }
      return { tests, nextCursor: cursor, hasMore };
    } catch (error) {
      status.textContent = error.message || "Tests could not be loaded. Please retry.";
      return { tests: [], error };
    } finally {
      loading = false;
      if (loadButton) loadButton.disabled = false;
    }
  }

  return loadPage();
}
