"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { rupeesToPaise } = require("../payment-price");

test("converts whole and fractional rupee prices to exact integer paise", () => {
  assert.equal(rupeesToPaise(499), 49900);
  assert.equal(rupeesToPaise("499.5"), 49950);
  assert.equal(rupeesToPaise("0.01"), 1);
  assert.equal(rupeesToPaise(100000), 10000000);
});

test("rejects zero, negative, malformed, excessive precision and out-of-range prices", () => {
  for (const value of [0, "0.00", -1, "-1", "1.001", "1.239", "01.00", "1e2", NaN, Infinity, null, {}, 100000.01]) {
    assert.throws(() => rupeesToPaise(value));
  }
});

test("does not silently round binary floating-point or excess decimal prices", () => {
  assert.throws(() => rupeesToPaise(1.005));
  assert.equal(rupeesToPaise(1.25), 125);
});
