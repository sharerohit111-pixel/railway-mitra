"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toValidDate } = require("../exam-time");

test("accepts valid Date, ISO string and Firestore Timestamp-like values", () => {
  const expected = new Date("2026-11-14T10:00:00.000Z");
  assert.equal(toValidDate(expected).toISOString(), expected.toISOString());
  assert.equal(toValidDate("2026-11-14T10:00:00.000Z").toISOString(), expected.toISOString());
  assert.equal(toValidDate({ toDate: () => expected }).toISOString(), expected.toISOString());
});

test("rejects malformed, empty and unsupported persisted timestamps", () => {
  for (const value of [null, undefined, "", "not-a-date", {}, { toDate: () => { throw new Error("bad timestamp"); } }]) {
    assert.equal(toValidDate(value), null);
  }
});
