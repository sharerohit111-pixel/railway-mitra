"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assertFreeTestSelectionAllowed } = require("../free-test-selection");

test("allows the initial free-test selection before any student claim", () => {
  assert.deepEqual(assertFreeTestSelectionAllowed({
    currentConfig: null,
    requestedTestId: "free_test_1"
  }), { changed: true });
});

test("allows idempotently re-selecting the same free test after claims", () => {
  assert.deepEqual(assertFreeTestSelectionAllowed({
    currentConfig: { enabled: true, testId: "free_test_1", hasClaims: true },
    requestedTestId: "free_test_1"
  }), { changed: false });
});

test("prevents changing the configured free test after the first claim", () => {
  assert.throws(() => assertFreeTestSelectionAllowed({
    currentConfig: { enabled: true, testId: "free_test_1", hasClaims: true },
    requestedTestId: "free_test_2"
  }), /cannot be changed after a student has claimed/);
});

test("detects legacy claim documents when the new lock marker is absent", () => {
  assert.throws(() => assertFreeTestSelectionAllowed({
    currentConfig: { enabled: true, testId: "free_test_1" },
    legacyClaimExists: true,
    requestedTestId: "free_test_2"
  }), /cannot be changed after a student has claimed/);
});

test("rejects a corrupt claim marker even when the requested test matches the current selection", () => {
  assert.throws(() => assertFreeTestSelectionAllowed({
    currentConfig: { enabled: true, testId: "free_test_1", hasClaims: "false" },
    requestedTestId: "free_test_1"
  }), /claim state is inconsistent/);
});

test("rejects a corrupt claim marker instead of assuming the selection is unlocked", () => {
  assert.throws(() => assertFreeTestSelectionAllowed({
    currentConfig: { enabled: true, testId: "free_test_1", hasClaims: "false" },
    requestedTestId: "free_test_2"
  }), /claim state is inconsistent/);
});

test("rejects malformed test identifiers", () => {
  assert.throws(() => assertFreeTestSelectionAllowed({
    currentConfig: null,
    requestedTestId: "../other"
  }), /valid free test ID/);
});
