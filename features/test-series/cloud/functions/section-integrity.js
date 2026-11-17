function fail(message) {
  throw new Error(message);
}

function hasControlCharacters(value) {
  return typeof value === "string" && Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function normalizeSectionLabel(value, allowEmpty = false) {
  if (typeof value !== "string" || hasControlCharacters(value)) {
    fail("Invalid exam section label");
  }
  const name = value.trim();
  if ((!allowEmpty && !name) || name.length > 80) {
    fail("Invalid exam section label");
  }
  return name;
}

/**
 * Validate the persisted test section configuration against its question paper.
 * Returns canonical section entries with counts derived from the actual paper.
 * This is deliberately read-only; callers decide how to surface the failure.
 */
function getExamSectionConfig(test, questions) {
  if (!test || typeof test !== "object" || Array.isArray(test)) {
    fail("Exam metadata is invalid");
  }
  if (!Array.isArray(questions)) {
    fail("Exam question paper is invalid");
  }
  if (test.sections !== undefined && !Array.isArray(test.sections)) {
    fail("Exam section configuration is invalid");
  }

  const sections = new Map();
  for (const [index, section] of (test.sections || []).entries()) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      fail("Invalid exam section at index " + index);
    }
    const name = normalizeSectionLabel(section.name);
    const timeLimitMinutes = Number(section.timeLimitMinutes ?? 0);
    if (!Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 0 || timeLimitMinutes > 240) {
      fail("Invalid exam section at index " + index);
    }
    const key = name.toLocaleLowerCase();
    if (sections.has(key)) {
      fail("Duplicate exam section name");
    }
    sections.set(key, { name, timeLimitMinutes, questionCount: 0 });
  }

  for (const [index, question] of questions.entries()) {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      fail("Invalid exam question at index " + index);
    }
    if (question.section === undefined || question.section === null) continue;
    if (typeof question.section !== "string") {
      fail("Question section must be text");
    }
    const name = normalizeSectionLabel(question.section);
    if (question.section !== name) {
      fail("Invalid question section at index " + index);
    }
    const config = sections.get(name.toLocaleLowerCase());
    if (!config || config.name !== name) {
      fail("Question section does not match the canonical exam section");
    }
    config.questionCount++;
  }

  return [...sections.values()];
}

module.exports = { getExamSectionConfig, normalizeSectionLabel };
