import { listAvailableCbtTests, claimFreeCbtAttempt } from "../cloud/student-client.js";
import "./catalogue.css";

export async function initStudentTestCatalogue({ app, root = document, onStart }) {
  const status = root.getElementById("rm-catalogue-status");
  const list = root.getElementById("rm-catalogue-list");
  if (typeof onStart !== "function") throw new Error("onStart callback is required");
  status.textContent = "Loading published tests…";
  list.replaceChildren();
  try {
    const { tests = [] } = await listAvailableCbtTests(app);
    if (!tests.length) {
      status.textContent = "अभी कोई प्रकाशित परीक्षा उपलब्ध नहीं है।";
      return { tests: [] };
    }
    status.textContent = tests.length + " tests available";
    for (const test of tests) {
      const card = root.createElement("article");
      card.className = "rm-catalogue-card";
      const title = root.createElement("h2");
      title.textContent = test.title || "Untitled Test";
      const meta = root.createElement("div");
      meta.className = "rm-catalogue-meta";
      const details = [
        test.mode === "scheduled" ? "Scheduled" : "Mock Test",
        (test.durationMinutes || 0) + " min",
        (test.questionCount || 0) + " questions",
        test.accessType === "free_trial" ? "Free first attempt" : test.accessType === "paid" ? "₹" + test.price : "Access unavailable"
      ];
      if (test.mode === "scheduled" && test.scheduleStartAt) details.push("Starts " + new Date(test.scheduleStartAt).toLocaleString());
      details.forEach(value => { const tag = root.createElement("span"); tag.textContent = value; meta.append(tag); });
      const button = root.createElement("button");
      button.type = "button";
      button.textContent = test.accessType === "free_trial" ? "Start Free Test" : test.accessType === "paid" ? "Payment / Access Coming Soon" : "Not Available";
      button.disabled = test.accessType !== "free_trial";
      button.addEventListener("click", async () => {
        button.disabled = true;
        status.textContent = "Preparing your free attempt…";
        try {
          let claim;
          try { claim = await claimFreeCbtAttempt(app); }
          catch (error) {
            if (!String(error.code || "").includes("already-exists")) throw error;
            // The one-time claim already exists. Start/resume the timed exam only
            // after the student presses Start on the exam screen.
            claim = { alreadyClaimed: true };
          }
          await onStart({ test, session: claim });
        } catch (error) {
          status.textContent = error.message || "Test could not be started.";
          button.disabled = false;
        }
      });
      card.append(title, meta, button);
      list.append(card);
    }
    return { tests };
  } catch (error) {
    status.textContent = error.message || "Tests could not be loaded. Please retry.";
    return { tests: [], error };
  }
}
