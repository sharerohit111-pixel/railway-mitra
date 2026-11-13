/**
 * Best-effort local recovery for answers that the server has not confirmed yet.
 * The server remains authoritative; this store never marks an answer as saved.
 */
export function readPendingAnswerDraft({ storage, key, questions }) {
  const answers = new Map();
  let discarded = 0;
  if (!storage || typeof storage.getItem !== "function") {
    return { answers, discarded, unavailable: true };
  }

  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return { answers, discarded, unavailable: true };
  }
  if (raw === null || raw === undefined || raw === "") {
    return { answers, discarded, unavailable: false };
  }

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    try { storage.removeItem(key); } catch (_) {}
    return { answers, discarded: 1, unavailable: false };
  }
  if (!Array.isArray(entries)) {
    try { storage.removeItem(key); } catch (_) {}
    return { answers, discarded: 1, unavailable: false };
  }

  const validQuestions = new Map(
    (Array.isArray(questions) ? questions : [])
      .filter(question => question && typeof question.id === "string" && Array.isArray(question.options))
      .map(question => [question.id, question])
  );

  for (const pair of entries) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      discarded++;
      continue;
    }
    const [questionId, value] = pair;
    const question = typeof questionId === "string" ? validQuestions.get(questionId) : null;
    // Only accept the exact string format written by this module. Number(null),
    // Number(false), and Number([]) all become zero and must not restore option A.
    if (!question || typeof value !== "string" || !/^(0|[1-9]\\d*)$/.test(value)) {
      discarded++;
      continue;
    }
    const optionIndex = Number(value);
    if (!Number.isSafeInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) {
      discarded++;
      continue;
    }
    answers.set(questionId, String(optionIndex));
  }

  if (!answers.size) {
    try { storage.removeItem(key); } catch (_) {}
  }
  return { answers, discarded, unavailable: false };
}

export function writePendingAnswerDraft({ storage, key, entries }) {
  if (!storage || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") return false;
  try {
    if (entries && entries.length) storage.setItem(key, JSON.stringify(entries));
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
