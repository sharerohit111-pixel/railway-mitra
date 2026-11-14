"use strict";

// App Check is mandatory for deployed callable functions.
// The local Functions Emulator cannot mint production App Check attestations,
// so only its explicit runtime marker disables enforcement.
const REGION = "asia-south1";

function getCallableOptions(env = process.env) {
  return Object.freeze({
    region: REGION,
    enforceAppCheck: env.FUNCTIONS_EMULATOR !== "true"
  });
}

module.exports = { getCallableOptions };
