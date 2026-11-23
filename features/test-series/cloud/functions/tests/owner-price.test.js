"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateOwnerPrice } = require("../owner-price");

test("accepts free tests and valid rupee prices", () => {
  for (const [input, expected] of [[0, 0], ["0", 0], ["0.00", 0], [1, 1], ["99.5", 99.5], ["499.50", 499.5], [100000, 100000]]) {
    assert.equal(validateOwnerPrice(input), expected);
  }
});

test("rejects malformed, over-precision and out-of-range owner prices", () => {
  for (const input of ["0.000", "1.005", "01", "01.00", "1e2", "-1", "-0.01", "100000.01", "", " 1", "1 ", null, undefined, {}, NaN, Infinity, -1, 100000.01]) {
    assert.throws(() => validateOwnerPrice(input));
  }
});
