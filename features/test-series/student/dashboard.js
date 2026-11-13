import { getStudentCbtDashboard } from "../cloud/student-client.js";

// Keep one click listener per refresh button even if the dashboard is mounted again.
const refreshHandlers = new WeakMap();
const activeLoads = new WeakMap();

export async function initStudentDashboard({ app, root = document }) {
  const status = root.getElementById("rm-dashboard-status");
  const summary = root.getElementById("rm-dashboard-summary");
  const resultsNode = root.getElementById("rm-dashboard-results");
  const refresh = root.getElementById("rm-dashboard-refresh");
  if (!status || !summary || !resultsNode || !refresh) {
    throw new Error("Student dashboard markup is incomplete");
  }

  function load() {
    if (activeLoads.has(refresh)) return activeLoads.get(refresh);
    const task = (async () => {
    refresh.disabled = true;
    refresh.setAttribute("aria-busy", "true");
    status.textContent = "Loading your results…";
    summary.replaceChildren();
    summary.hidden = true;
    resultsNode.replaceChildren();
    try {
      const { results = [], resultCount = 0 } = await getStudentCbtDashboard(app);
      const total = results.reduce((sum, item) => sum + Number(item.totalQuestions || 0), 0);
      const correct = results.reduce((sum, item) => sum + Number(item.correct || 0), 0);
      const average = resultCount ? results.reduce((sum, item) => sum + Number(item.score || 0), 0) / resultCount : 0;
      const stats = [
        ["Results loaded (latest 100 max.)", resultCount],
        ["Questions attempted correctly", correct],
        ["Average score (loaded results)", average.toFixed(2)]
      ];
      stats.forEach(([label, value]) => {
        const card = root.createElement("div");
        card.className = "rm-dashboard-stat";
        const strong = root.createElement("strong");
        strong.textContent = String(value);
        const caption = root.createElement("span");
        caption.textContent = label;
        card.append(strong, caption);
        summary.append(card);
      });
      summary.hidden = false;
      if (!results.length) {
        status.textContent = "अभी आपके खाते में कोई जमा किया हुआ टेस्ट परिणाम नहीं है।";
      } else {
        status.textContent = "Showing your latest " + resultCount + " submitted result(s). This dashboard loads up to 100 recent results.";
        results.forEach(item => {
          const card = root.createElement("article");
          card.className = "rm-dashboard-result";
          const heading = root.createElement("h2");
          heading.textContent = item.testTitle || "Test";
          const score = root.createElement("p");
          score.className = "rm-dashboard-score";
          score.textContent = "Score: " + Number(item.score || 0);
          const detail = root.createElement("p");
          detail.textContent = "Correct: " + item.correct + " · Wrong: " + item.wrong + " · Unattempted: " + item.unattempted;
          const totalLine = root.createElement("p");
          totalLine.textContent = "Total questions: " + item.totalQuestions;
          const timingLine = root.createElement("p");
          timingLine.className = item.timedOut ? "rm-dashboard-timeout" : "rm-dashboard-submission";
          timingLine.textContent = item.timedOut ? "Time expired — submitted using saved answers" : "Submitted within the exam time";
          const dateLine = root.createElement("p");
          dateLine.textContent = item.submittedAt ? "Submitted: " + new Date(item.submittedAt).toLocaleString() : "Submission date unavailable";
          card.append(heading, score, detail, totalLine, timingLine, dateLine);
          resultsNode.append(card);
        });
      }
      return { results, resultCount, totalQuestions: total };
    } catch (error) {
      status.textContent = error.message || "Your results could not be loaded. Please retry.";
      return { results: [], error };
    } finally {
      refresh.disabled = false;
      refresh.setAttribute("aria-busy", "false");
    }
    })();
    activeLoads.set(refresh, task);
    return task.finally(() => {
      if (activeLoads.get(refresh) === task) activeLoads.delete(refresh);
    });
  }
  refreshHandlers.set(refresh, load);
  if (!refresh.dataset.rmDashboardRefreshBound) {
    refresh.addEventListener("click", () => refreshHandlers.get(refresh)?.());
    refresh.dataset.rmDashboardRefreshBound = "true";
  }
  return load();
}
