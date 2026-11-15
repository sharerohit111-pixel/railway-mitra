"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getTestLeaderboard } = require("../leaderboard-query");

function makeDb(rows) {
  const reads = [];
  function makeQuery(filters = [], orders = [], max = null) {
    const query = {
      where(field, operator, value) {
        return makeQuery(filters.concat([{ field, operator, value }]), orders, max);
      },
      orderBy(field, direction = "asc") {
        return makeQuery(filters, orders.concat([{ field, direction }]), max);
      },
      limit(value) {
        return makeQuery(filters, orders, value);
      },
      async get() {
        reads.push({ kind: "documents", filters, orders, limit: max });
        let selected = rows.filter(row => filters.every(({ field, operator, value }) => {
          if (operator === "==") return row[field] === value;
          if (operator === ">") return row[field] > value;
          throw new Error("Unsupported mock operator: " + operator);
        }));
        selected.sort((a, b) => {
          for (const { field, direction } of orders) {
            if (a[field] === b[field]) continue;
            const result = a[field] < b[field] ? -1 : 1;
            return direction === "desc" ? -result : result;
          }
          return 0;
        });
        if (max !== null) selected = selected.slice(0, max);
        return {
          empty: selected.length === 0,
          size: selected.length,
          docs: selected.map((row, index) => ({
            id: "attempt-" + index,
            data: () => ({ ...row })
          }))
        };
      },
      count() {
        return {
          async get() {
            reads.push({ kind: "count", filters });
            const count = rows.filter(row => filters.every(({ field, operator, value }) => {
              if (operator === "==") return row[field] === value;
              if (operator === ">") return row[field] > value;
              throw new Error("Unsupported mock operator: " + operator);
            })).length;
            return { data: () => ({ count }) };
          }
        };
      }
    };
    return query;
  }
  return {
    reads,
    db: { collection(name) {
      assert.equal(name, "testSeriesResults");
      return makeQuery();
    } }
  };
}

test("leaderboard returns bounded top 20, tie ranks, and best-attempt personal rank", async () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    testId: "civil-je",
    uid: "student-" + index,
    score: 100 - index * 3,
    submittedAt: new Date(Date.UTC(2026, 0, index)).toISOString()
  }));
  // Two attempts by the requesting student: their best is 82, not the later 40.
  rows.push(
    { testId: "civil-je", uid: "me", score: 82, submittedAt: "2026-02-01T00:00:00.000Z" },
    { testId: "civil-je", uid: "me", score: 40, submittedAt: "2026-02-02T00:00:00.000Z" },
    { testId: "civil-je", uid: "another", score: 82, submittedAt: "2026-02-03T00:00:00.000Z" },
    { testId: "other-test", uid: "outsider", score: 999, submittedAt: "2026-02-04T00:00:00.000Z" }
  );
  const { db, reads } = makeDb(rows);
  const result = await getTestLeaderboard({ db, uid: "me", testId: "civil-je" });

  assert.equal(result.participantCount, 28);
  assert.equal(result.leaderboardComplete, true);
  assert.equal(result.myScore, 82);
  assert.equal(result.myRank, 7); // six strictly higher attempts; equal scores share rank.
  assert.equal(result.top.length, 20);
  assert.equal(result.top[0].rank, 1);
  assert.equal(result.top[6].score, 82);
  assert.equal(result.top[6].rank, 7);
  assert.equal(result.top[7].score, 82);
  assert.equal(result.top[7].rank, 7);
  assert.ok(result.top.every(row => !("uid" in row) && !("attemptId" in row)));
  const topRead = reads.find(read => read.kind === "documents" && read.limit === 20);
  assert.ok(topRead, "public leaderboard query must be capped at 20");
  const personalRead = reads.find(read => read.kind === "documents" &&
    read.filters.some(filter => filter.field === "uid"));
  assert.equal(personalRead.limit, 1, "personal-best query must read at most one attempt");
});

test("leaderboard returns a null personal rank when the student has no submitted attempt", async () => {
  const { db } = makeDb([
    { testId: "civil-je", uid: "someone-else", score: 10, submittedAt: "2026-01-01T00:00:00.000Z" }
  ]);
  const result = await getTestLeaderboard({ db, uid: "me", testId: "civil-je" });
  assert.equal(result.participantCount, 1);
  assert.equal(result.myRank, null);
  assert.equal(result.myScore, null);
  assert.equal(result.top.length, 1);
});

test("leaderboard rejects malformed scores rather than publishing an invalid rank", async () => {
  const { db } = makeDb([
    { testId: "civil-je", uid: "me", score: "100", submittedAt: "2026-01-01T00:00:00.000Z" }
  ]);
  await assert.rejects(
    getTestLeaderboard({ db, uid: "me", testId: "civil-je" }),
    /invalid numeric score/
  );
});

test("leaderboard requires a database, student UID, and test ID", async () => {
  await assert.rejects(getTestLeaderboard({ uid: "me", testId: "civil-je" }), /required/);
  const { db } = makeDb([]);
  await assert.rejects(getTestLeaderboard({ db, uid: "", testId: "civil-je" }), /required/);
  await assert.rejects(getTestLeaderboard({ db, uid: "me", testId: "" }), /required/);
});
