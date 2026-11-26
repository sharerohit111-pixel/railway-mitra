import test from "node:test";
import assert from "node:assert/strict";
import { ALERT_TARGET_TRAIN_NUMBER, isAlertTargetTrain } from "../src/train-identity.js";

test("only passenger train 14704 is eligible for the Lalgarh-Phalodi alert", () => {
  assert.equal(ALERT_TARGET_TRAIN_NUMBER, "14704");
  assert.equal(isAlertTargetTrain("14704", "passenger"), true);
  assert.equal(isAlertTargetTrain(" 14704 ", "passenger"), true);
});

test("other train numbers and goods reports are never alert eligible", () => {
  assert.equal(isAlertTargetTrain("14703", "passenger"), false);
  assert.equal(isAlertTargetTrain("14705", "passenger"), false);
  assert.equal(isAlertTargetTrain("14704", "goods"), false);
  assert.equal(isAlertTargetTrain("", "passenger"), false);
});
