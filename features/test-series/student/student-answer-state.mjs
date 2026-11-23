/**
 * Mutable answer state for one CBT paper.
 *
 * A null-prototype map keeps valid question IDs such as "__proto__",
 * "constructor" and "toString" as ordinary own answer keys.
 */
export function createStudentAnswerState(savedAnswers = {}) {
  if (savedAnswers === null || typeof savedAnswers !== "object" || Array.isArray(savedAnswers)) {
    throw new TypeError("Saved student answers must be an object");
  }

  const state = Object.create(null);
  for (const questionId of Reflect.ownKeys(savedAnswers)) {
    if (typeof questionId !== "string") {
      throw new TypeError("Saved student answer keys must be strings");
    }
    const descriptor = Object.getOwnPropertyDescriptor(savedAnswers, questionId);
    if (!descriptor || !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        typeof descriptor.value !== "string") {
      throw new TypeError("Saved student answers must be enumerable string data properties");
    }
    Object.defineProperty(state, questionId, {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return state;
}
