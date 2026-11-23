const COMPLETE_NOTE = "The count and Top 20 are based on submitted attempts, not unique students. A student with multiple attempts may appear more than once; your personal rank uses your best submitted attempt. Equal scores share competition rank; earlier submissions appear first within a tie.";
const PARTIAL_NOTE = "This is a partial result sample. The displayed count, Top 20 and personal rank may be incomplete.";

export function getLeaderboardPresentation(data = {}) {
  const count = data?.participantCount;
  const submissionCountText = Number.isSafeInteger(count) && count >= 0
    ? count + " submitted " + (count === 1 ? "attempt" : "attempts")
    : "Submitted attempt count unavailable";
  const complete = data?.leaderboardComplete === true;

  return {
    submissionCountText,
    rankUnavailableText: complete
      ? "You have no submitted attempt for this test yet."
      : "Your rank is unavailable because this leaderboard is a partial result sample.",
    note: complete ? COMPLETE_NOTE : PARTIAL_NOTE
  };
}
