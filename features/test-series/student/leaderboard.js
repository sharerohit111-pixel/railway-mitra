import { getCbtTestLeaderboard } from "../cloud/student-client.js";
import "./leaderboard.css";

export async function initStudentLeaderboard({ app, testId, root = document }) {
  const status = root.getElementById("rm-leaderboard-status");
  const mine = root.getElementById("rm-leaderboard-mine");
  const list = root.getElementById("rm-leaderboard-list");
  const note = root.getElementById("rm-leaderboard-note");
  if (!status || !mine || !list || !note) throw new Error("Leaderboard markup is incomplete");
  if (!testId) throw new Error("testId is required");

  status.textContent = "Loading leaderboard…";
  mine.hidden = true;
  list.replaceChildren();
  note.textContent = "";
  try {
    const data = await getCbtTestLeaderboard(app, testId);
    status.textContent = data.participantCount + " submitted participant(s)";
    if (data.myRank) {
      const heading = root.createElement("strong");
      heading.textContent = "Your rank: #" + data.myRank;
      const score = root.createElement("span");
      score.textContent = "Your score: " + data.myScore;
      mine.append(heading, score);
      mine.hidden = false;
    } else {
      mine.textContent = "Your submitted result is not in the current leaderboard data.";
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
    if (!data.leaderboardComplete) {
      note.textContent = "Showing the first 1,000 result records only. The participant count and your rank may be incomplete until scalable rank aggregation is added.";
    } else {
      note.textContent = "Names and personal details are hidden. Equal scores share the same competition rank; earlier submission breaks ordering within a tie.";
    }
    return data;
  } catch (error) {
    status.textContent = error.message || "Leaderboard could not be loaded.";
    return { error };
  }
}
