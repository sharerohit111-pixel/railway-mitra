"use strict";

/**
 * Build a complete, bounded leaderboard projection.
 *
 * - Aggregate counts avoid the old 1000-document ceiling.
 * - The composite-indexed score query returns only the best 20 attempts.
 * - A student's personal rank reads only their best attempt, then counts all
 *   strictly higher scores, so ties share a competition rank.
 * - Public rows deliberately omit UID and attempt identifiers.
 *
 * The public top-20 list remains attempt-based for compatibility; a student
 * with multiple submissions can therefore have more than one row in that list.
 */
async function getTestLeaderboard({ db, uid, testId } = {}) {
  if (!db || typeof db.collection !== "function" ||
      typeof uid !== "string" || !uid ||
      typeof testId !== "string" || !testId) {
    throw new TypeError("A Firestore instance, student UID and test ID are required");
  }

  const results = db.collection("testSeriesResults");
  const forTest = results.where("testId", "==", testId);
  const [countSnapshot, topSnapshot, mineSnapshot] = await Promise.all([
    forTest.count().get(),
    forTest.orderBy("score", "desc").orderBy("submittedAt", "asc").limit(20).get(),
    forTest.where("uid", "==", uid)
      .orderBy("score", "desc")
      .orderBy("submittedAt", "asc")
      .limit(1)
      .get()
  ]);

  // The personal-best query is indexed and bounded; do not read every attempt
  // submitted by this student just to determine their best score.
  const mine = mineSnapshot.empty ? null : mineSnapshot.docs[0].data();
  if (mine && (typeof mine.score !== "number" || !Number.isFinite(mine.score))) {
    throw new Error("A student's leaderboard result contains an invalid numeric score");
  }

  let myRank = null;
  if (mine) {
    const higherSnapshot = await forTest
      .where("score", ">", mine.score)
      .orderBy("score", "desc")
      .orderBy("submittedAt", "asc")
      .count()
      .get();
    myRank = Number(higherSnapshot.data().count || 0) + 1;
  }

  let rank = 0;
  let previousScore = null;
  const top = topSnapshot.docs.map((doc, index) => {
    const score = doc.data().score;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new Error("A leaderboard result contains an invalid numeric score");
    }
    if (index === 0 || score !== previousScore) rank = index + 1;
    previousScore = score;
    return {
      rank,
      score,
      label: "Candidate " + String(rank).padStart(2, "0")
    };
  });

  return {
    testId,
    participantCount: Number(countSnapshot.data().count || 0),
    leaderboardComplete: true,
    myRank,
    myScore: mine ? mine.score : null,
    top
  };
}

module.exports = { getTestLeaderboard };
