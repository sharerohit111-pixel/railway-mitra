import { getCbtTestLeaderboard } from "../cloud/student-client.js";
import { getLeaderboardPresentation } from "./leaderboard-presentation.mjs";

export async function initStudentLeaderboard({ app, testId, root = document, isSessionActive = () => true }) {
  const sessionIsActive = () => {
    try { return typeof isSessionActive === "function" && isSessionActive() === true; }
    catch { return false; }
  };
  if (!sessionIsActive()) return { stale: true };
  const status = root.getElementById("rm-leaderboard-status");
  const mine = root.getElementById("rm-leaderboard-mine");
  const list = root.getElementById("rm-leaderboard-list");
  const note = root.getElementById("rm-leaderboard-note");
  if (!status || !mine || !list || !note) throw new Error("Leaderboard markup is incomplete");
  if (!testId) throw new Error("testId is required");

  if (!sessionIsActive()) return { stale: true };
  status.textContent = "Loading leaderboard…";
  mine.hidden = true;
  list.replaceChildren();
  note.textContent = "";
  try {
    const data = await getCbtTestLeaderboard(app, testId);
    // A logout, account switch, or view change may happen while the callable is pending.
    // Never let a previous student response repopulate the shared portal DOM.
    if (!sessionIsActive()) return { stale: true };
    const presentation = getLeaderboardPresentation(data);
    status.textContent = presentation.submissionCountText;
    if (data.myRank) {
      const heading = root.createElement("strong");
      heading.textContent = "Your rank: #" + data.myRank;
      const score = root.createElement("span");
      score.textContent = "Your score: " + data.myScore;
      mine.append(heading, score);
      mine.hidden = false;
    } else {
      mine.textContent = presentation.rankUnavailableText;
      mine.hidden = false;
    }
    (data.top || []).forEach(row => {
      const item = root.createElement("li");
      const label = root.createElement("span");
      label.textContent = "#" + row.rank + " · " + row.label;
      const score = root.createElement("strong");
      score.textContent = String(row.score);
      item.append(label, score);
      list.append(item);
    });
    note.textContent = presentation.note;
    return data;
  } catch (error) {
    if (!sessionIsActive()) return { stale: true };
    status.textContent = error.message || "Leaderboard could not be loaded.";
    return { error };
  }
}
