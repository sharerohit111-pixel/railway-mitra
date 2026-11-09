/* Isolated bilingual question renderer for GDCE paper records. */
(function (global) {
  "use strict";
  function safe(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function bilingual(value, lang) {
    if (!value) return "";
    var primary = value[lang] || "";
    var secondaryLang = lang === "hi" ? "en" : "hi";
    var secondary = value[secondaryLang] || "";
    return '<div class="gdce-language-primary">' + safe(primary) + '</div>' +
      (secondary ? '<div class="gdce-language-secondary">' + safe(secondary) + '</div>' : "");
  }
  function renderQuestion(question, lang) {
    if (!question || !Array.isArray(question.options)) return "";
    var options = question.options.map(function (option) {
      return '<li data-option="' + safe(option.key) + '">' +
        '<span class="gdce-option-key">' + safe(option.key) + '.</span>' +
        bilingual(option.text, lang) + '</li>';
    }).join("");
    var diagram = question.diagram && question.diagram.src
      ? '<figure class="gdce-question-diagram"><img src="' + safe(question.diagram.src) +
        '" alt="Question ' + safe(question.questionNumber) + ' source diagram"></figure>' : "";
    return '<article class="gdce-question" data-question-id="' + safe(question.questionId) + '">' +
      '<h3>Q.' + safe(question.questionNumber) + '</h3>' +
      '<div class="gdce-question-text">' + bilingual(question.questionText, lang) + '</div>' +
      diagram + '<ol class="gdce-options">' + options + '</ol></article>';
  }
  function renderSolution(question, lang) {
    if (!question || !question.solution) return "";
    var solution = question.solution;
    if (!(solution.en || solution.hi)) return '<p class="gdce-solution-pending">Solution will be added after verification. / सत्यापन के बाद समाधान जोड़ा जाएगा।</p>';
    return '<section class="gdce-solution"><h4>Solution / समाधान</h4>' +
      bilingual(solution, lang) + '</section>';
  }
  global.GDCEBilingualPaper = Object.freeze({ renderQuestion: renderQuestion, renderSolution: renderSolution });
})(window);
