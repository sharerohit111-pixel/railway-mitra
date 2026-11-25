/* Railway Mitra — isolated New Updates header shortcut.
   Reuses a legacy Train shortcut when present; otherwise adds a compact shortcut.
   The existing Where Is Your Train banner and train-tracking feature remain untouched. */
(() => {
  "use strict";

  const init = () => {
    const header = document.querySelector(".app-header");
    if (!header || header.querySelector(".rm-header-updates")) return;

    const legacyTrain = Array.from(document.querySelectorAll(".app-header a, .app-header button"))
      .find((element) => {
        if (element.id === "menuBtn" || element.classList.contains("rm-header-refresh")) return false;
        const label = (element.textContent || "").replace(/\\s+/g, " ").trim();
        const href = element.getAttribute("href") || "";
        return /^(train|where is your train)$/i.test(label) ||
          /features\\/where-is-your-train(?:\\/index\\.html)?/i.test(href);
      });

    const link = legacyTrain || document.createElement("a");
    link.className = "rm-header-updates";
    link.href = "features/updates/index.html";
    link.setAttribute("aria-label", "Open New Updates");
    link.setAttribute("title", "New Updates — Railway news and notices");
    link.setAttribute("data-rm-header-updates", "");
    link.innerHTML = '<span class="rm-header-updates__icon" aria-hidden="true">📰</span><span class="rm-header-updates__label">New Updates</span>';

    if (!legacyTrain) header.appendChild(link);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
