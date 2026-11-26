import test from "node:test";
import assert from "node:assert/strict";
import { isValidTrainNumber as isValidFrontendTrainNumber } from "../train-identity.js";
import { isValidTrainNumber as isValidBackendTrainNumber } from "../../../appwrite/functions/train-movement-api/src/train-identity.js";

const validators = [
  ["frontend", isValidFrontendTrainNumber],
  ["backend", isValidBackendTrainNumber]
];

for (const [name, validate] of validators) {
  test(`${name}: accepts passenger train numbers with 4–6 digits`, () => {
    for (const value of ["12001", "1234", "123456"]) assert.equal(validate(value, "passenger"), true, value);
  });
  test(`${name}: rejects malformed passenger train numbers`, () => {
    for (const value of ["123", "1234567", "12A45", "12 45", ""]) {
      if (value === "") continue;
      assert.equal(validate(value, "passenger"), false, value);
    }
  });
  test(`${name}: accepts valid goods identifiers and normalizes case`, () => {
    for (const value of ["BOXN", "ABC-123", "1234567890", "boxn"]) assert.equal(validate(value, "goods"), true, value);
  });
  test(`${name}: rejects malformed goods identifiers and unknown types`, () => {
    for (const value of ["A", "ABCDEFGHIJK", "AB C"]) assert.equal(validate(value, "goods"), false, value);
    assert.equal(validate("12345", "unknown"), false);
  });
  test(`${name}: allows an omitted train number for ordinary reports`, () => {
    assert.equal(validate("", "passenger"), true);
    assert.equal(validate(null, "goods"), true);
  });
}
