"use strict";

// App Check is mandatory for deployed callable functions.
// The emulator bypass requires both Firebase's runtime marker and a demo
// project ID. A stray/misconfigured marker in a real project must fail closed.
const REGION = "asia-south1";
const DEMO_PROJECT_ID = /^demo-[a-z0-9][a-z0-9-]*$/;
const EMULATOR_SERVICE_NAME = new RegExp("^(?:" + REGION + "-)?rm[A-Z][A-Za-z0-9]*$");

function isIsolatedFunctionsEmulator(env) {
  // Firebase Functions Emulator runtimes expose the function name in K_SERVICE;
  // some CLI/runtime combinations prefix it with the configured region.
  // Accept only this codebase's rm-prefixed function names, revision "1", and
  // the absence of K_CONFIGURATION. Deployed Cloud Run revisions keep their
  // K_CONFIGURATION and non-synthetic revision identifiers, so App Check stays on.
  const emulatorSyntheticRevision =
    typeof env.K_SERVICE === "string" &&
    EMULATOR_SERVICE_NAME.test(env.K_SERVICE) &&
    env.K_REVISION === "1" &&
    !env.K_CONFIGURATION;
  const hasCloudRunRuntimeMarker =
    Boolean(env.K_CONFIGURATION) ||
    (Boolean(env.K_REVISION) && !emulatorSyntheticRevision) ||
    (Boolean(env.K_SERVICE) && !emulatorSyntheticRevision);

  return !hasCloudRunRuntimeMarker &&
    env.FUNCTIONS_EMULATOR === "true" &&
    typeof env.GCLOUD_PROJECT === "string" &&
    DEMO_PROJECT_ID.test(env.GCLOUD_PROJECT);
}

function getCallableOptions(env = process.env) {
  return Object.freeze({
    region: REGION,
    enforceAppCheck: !isIsolatedFunctionsEmulator(env)
  });
}

module.exports = { getCallableOptions, isIsolatedFunctionsEmulator };
