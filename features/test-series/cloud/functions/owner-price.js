"use strict";

/** Validate owner-entered rupee prices, including the explicit free-test value zero. */
function validateOwnerPrice(rawPrice) {
  if ((typeof rawPrice !== "number" && typeof rawPrice !== "string") ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(rawPrice))) {
    throw new TypeError("Test price must be a valid amount with at most two decimal places");
  }
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    throw new RangeError("Test price must be between 0 and 100000 rupees");
  }
  return price;
}

module.exports = { validateOwnerPrice };
