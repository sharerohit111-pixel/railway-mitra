const test = require("node:test");
const assert = require("node:assert/strict");
const { getExamSectionConfig } = require("../section-integrity");

test("returns section counts derived from the question paper and preserves Hindi names", () => {
  const sections = getExamSectionConfig({
    sections: [
      { name: "Technical Ability", timeLimitMinutes: 20, questionCount: 99 },
      { name: "सामान्य ज्ञान", timeLimitMinutes: 0 }
    ]
  }, [
    { id: "q1", section: "Technical Ability" },
    { id: "q2", section: "Technical Ability" },
    { id: "q3", section: "सामान्य ज्ञान" },
    { id: "q4" }
  ]);
  assert.deepEqual(sections, [
    { name: "Technical Ability", timeLimitMinutes: 20, questionCount: 2 },
    { name: "सामान्य ज्ञान", timeLimitMinutes: 0, questionCount: 1 }
  ]);
});

test("accepts an unsectioned paper with no section configuration", () => {
  assert.deepEqual(getExamSectionConfig({}, [{ id: "q1" }]), []);
  assert.deepEqual(getExamSectionConfig({ sections: [] }, [{ id: "q1", section: null }]), []);
});

test("rejects a question whose section has no configured section", () => {
  assert.throws(
    () => getExamSectionConfig({ sections: [] }, [{ id: "q1", section: "Technical Ability" }]),
    /does not match/
  );
});

test("rejects non-canonical section spelling instead of silently creating a second section", () => {
  assert.throws(
    () => getExamSectionConfig(
      { sections: [{ name: "Technical Ability", timeLimitMinutes: 5 }] },
      [{ id: "q1", section: "technical ability" }]
    ),
    /canonical/
  );
});

test("rejects duplicate section names regardless of case", () => {
  assert.throws(
    () => getExamSectionConfig({
      sections: [
        { name: "Technical Ability", timeLimitMinutes: 5 },
        { name: "technical ability", timeLimitMinutes: 10 }
      ]
    }, [{ id: "q1", section: "Technical Ability" }]),
    /Duplicate/
  );
});

test("rejects malformed section configuration and time limits", () => {
  for (const sections of [
    "Technical Ability",
    [null],
    [{ name: "", timeLimitMinutes: 0 }],
    [{ name: "A".repeat(81), timeLimitMinutes: 0 }],
    [{ name: "Technical\nAbility", timeLimitMinutes: 0 }],
    [{ name: "Technical Ability", timeLimitMinutes: -1 }],
    [{ name: "Technical Ability", timeLimitMinutes: 241 }],
    [{ name: "Technical Ability", timeLimitMinutes: 1.5 }]
  ]) {
    assert.throws(() => getExamSectionConfig({ sections }, [{ id: "q1" }]));
  }
});

test("rejects malformed question section values", () => {
  for (const section of [42, "", "   ", "Technical\nAbility", "x".repeat(81)]) {
    assert.throws(
      () => getExamSectionConfig(
        { sections: [{ name: "Technical Ability", timeLimitMinutes: 0 }] },
        [{ id: "q1", section }]
      )
    );
  }
});

test("rejects malformed exam and question collections", () => {
  assert.throws(() => getExamSectionConfig(null, []), /metadata/);
  assert.throws(() => getExamSectionConfig({}, {}), /question paper/);
  assert.throws(() => getExamSectionConfig({}, [null]), /question/);
});
