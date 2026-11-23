"use strict";

/**
 * Convert a rupee-denominated price to integer paise without rounding.
 * Accepts numeric or decimal-string values with at most two decimal places.
 */
function rupeesToPaise(value, { maxRupees = 100000 } = {}) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new TypeError("Price must be a number or decimal string");
  }
  const text = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
    throw new RangeError("Price must have at most two decimal places");
  }
  const [rupees, fraction = ""] = text.split(".");
  const amount = Number(rupees) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(amount) || amount <= 0 ||
      Number(rupees) > maxRupees || amount > maxRupees * 100) {
    throw new RangeError("Price is outside the supported range");
  }
  return amount;
}

module.exports = { rupeesToPaise };
