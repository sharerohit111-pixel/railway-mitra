(() => {
  const message = document.querySelector("[data-rm-exam-coming-message]");
  if (!message) return;
  const lines = [
    "LDCE, GDCE एवं अन्य प्रतियोगी परीक्षाओं के Online Test और Mock Test Practice Sets जल्द आने वाले हैं!",
    "Online Tests and Mock Test Practice Sets for LDCE, GDCE and other competitive exams are coming soon!"
  ];
  let index = 0;
  window.setInterval(() => {
    message.classList.add("is-changing");
    window.setTimeout(() => {
      index = (index + 1) % lines.length;
      message.textContent = lines[index];
      message.classList.remove("is-changing");
    }, 360);
  }, 4200);
})();
