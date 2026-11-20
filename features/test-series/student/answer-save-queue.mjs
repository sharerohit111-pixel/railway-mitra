"use strict";

const noop = () => {};

/**
 * Serialize one exam controller's answer writes while preserving the newest
 * pending value for each question. The server remains the source of truth.
 */
export function createStudentAnswerSaveQueue({
  saveAnswer,
  isActive = () => true,
  isUiActive = () => true,
  onPending = noop,
  onSaved = noop,
  onError = noop
} = {}) {
  if (typeof saveAnswer !== "function") throw new TypeError("An answer-save function is required");
  if (typeof isActive !== "function") throw new TypeError("An activity check is required");
  if (typeof isUiActive !== "function") throw new TypeError("A UI activity check is required");
  for (const callback of [onPending, onSaved, onError]) {
    if (typeof callback !== "function") throw new TypeError("Answer-save callbacks must be functions");
  }

  const pendingAnswers = new Map();
  // Track each distinct queued selection, not just its value. A student can
  // select A -> B -> A while the first A is still in flight; that old A
  // acknowledgement must not clear the newer A that is still waiting to save.
  const pendingVersions = new Map();
  const inFlightSaves = new Map();
  let nextWriteVersion = 0;
  let saving = Promise.resolve();
  let retrying = null;

  function isCurrent() {
    try {
      return isActive() === true;
    } catch {
      return false;
    }
  }

  function notify(callback, ...args) {
    let uiActive = false;
    try {
      uiActive = isUiActive() === true;
    } catch {
      uiActive = false;
    }
    if (!uiActive) return;
    try {
      callback(...args);
    } catch {
      // UI/storage callbacks must not change the outcome of a server save.
    }
  }

  function queueSave(questionId, value) {
    if (typeof questionId !== "string" || !questionId || typeof value !== "string") {
      return Promise.reject(new TypeError("A question ID and string answer are required"));
    }
    if (!isCurrent()) return Promise.resolve();

    const active = inFlightSaves.get(questionId);
    // Coalesce only when the in-flight write is still the latest selection.
    // For A -> B -> A, the final A is a new write even while the first A
    // remains in flight; otherwise the queued B could overwrite the latest A.
    if (active && active.value === value &&
        pendingAnswers.get(questionId) === value &&
        pendingVersions.get(questionId) === active.version) return active.promise;

    const entry = { value, version: ++nextWriteVersion, promise: null };
    pendingAnswers.set(questionId, value);
    pendingVersions.set(questionId, entry.version);
    notify(onPending, new Map(pendingAnswers), questionId, value);

    const operation = saving.catch(() => {}).then(() => {
      if (!isCurrent()) return { skipped: true };
      return Promise.resolve(saveAnswer(questionId, value)).then(result => {
        if (!result || typeof result !== "object" || result.saved !== true) {
          const error = new Error("Server did not confirm that the answer was saved");
          error.code = "answer_save_unconfirmed";
          throw error;
        }
        return { skipped: false, result };
      });
    });

    entry.promise = operation.then(outcome => {
      // A controller destroyed before this queued write starts must not be
      // mistaken for a successful server acknowledgement.
      if (outcome.skipped) return;
      if (pendingAnswers.get(questionId) === value &&
          pendingVersions.get(questionId) === entry.version) {
        pendingAnswers.delete(questionId);
        pendingVersions.delete(questionId);
      }
      if (!isCurrent()) return;
      notify(onSaved, new Map(pendingAnswers), questionId, value);
    }).catch(error => {
      if (isCurrent()) notify(onError, error, new Map(pendingAnswers), questionId, value);
      throw error;
    }).finally(() => {
      if (inFlightSaves.get(questionId) === entry) inFlightSaves.delete(questionId);
    });

    saving = entry.promise;
    inFlightSaves.set(questionId, entry);
    return entry.promise;
  }

  async function retryPending() {
    if (retrying) return retrying;
    retrying = (async () => {
      // Drain until the latest pending snapshot is acknowledged. A student can
      // change an answer while an earlier retry is in flight; that newer value
      // is already queued behind the old write and must be awaited as well.
      while (isCurrent()) {
        const entries = [...pendingAnswers.entries()].map(([questionId, value]) =>
          [questionId, value, pendingVersions.get(questionId)]);
        if (!entries.length) return;
        for (const [questionId, value, version] of entries) {
          if (!isCurrent()) return;
          // A newer selection supersedes this snapshot, even if it happens to
          // have the same answer value as the older write.
          if (pendingAnswers.get(questionId) !== value ||
              pendingVersions.get(questionId) !== version) continue;
          await queueSave(questionId, value);
        }
      }
    })();
    try {
      return await retrying;
    } finally {
      retrying = null;
    }
  }

  return Object.freeze({
    pendingAnswers,
    queueSave,
    retryPending,
    waitForSaves: () => saving,
    hasInFlightSaves: () => inFlightSaves.size > 0
  });
}
