"use strict";

/**
 * Serialize Owner sign-in and phone-MFA enrollment operations that may remain
 * pending while the browser waits for the second-factor OTP prompt.
 */
export function createOwnerAuthOperationGate() {
  let pending = false;

  return Object.freeze({
    isPending() {
      return pending;
    },
    run(operation) {
      if (typeof operation !== "function") {
        throw new TypeError("An Owner authentication operation is required");
      }
      if (pending) {
        throw new Error("An Owner authentication step is already in progress.");
      }

      pending = true;
      let result;
      try {
        result = operation();
      } catch (error) {
        pending = false;
        throw error;
      }
      return Promise.resolve(result).finally(() => {
        pending = false;
      });
    }
  });
}
