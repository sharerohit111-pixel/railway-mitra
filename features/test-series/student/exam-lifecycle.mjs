/**
 * Lifecycle fence for a single student's exam controller.
 * Once destroyed, delayed async continuations must not touch shared portal UI.
 */
export function createCbtExamLifecycle() {
  let active = true;
  return Object.freeze({
    isActive() {
      return active;
    },
    destroy() {
      active = false;
    }
  });
}
