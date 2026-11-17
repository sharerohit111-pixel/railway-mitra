/* Railway Mitra — floating back-to-top control, isolated from app navigation. */
(() => {
  "use strict";
  if (document.getElementById("rmScrollTop")) return;
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "features/scroll-to-top/scroll-to-top.css?v=1";
  document.head.appendChild(style);

  const button = document.createElement("button");
  button.type = "button";
  button.id = "rmScrollTop";
  button.className = "rm-scroll-top";
  button.setAttribute("aria-label", "Back to top");
  button.title = "Go to top";
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
  document.body.appendChild(button);

  const update = () => button.classList.toggle("is-visible", window.scrollY > 280);
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("pageshow", update);
  update();
  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  });
})();
