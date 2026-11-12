/* Railway Mitra — isolated header refresh control. */
(function () {
  "use strict";

  function initHeaderRefresh() {
    const header = document.querySelector(".app-header");
    if (!header || header.querySelector(".rm-header-refresh")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "rm-header-refresh";
    button.setAttribute("aria-label", "Refresh Railway Mitra");
    button.setAttribute("title", "Refresh app");
    button.innerHTML = '<span class="rm-header-refresh__icon" aria-hidden="true">↻</span>';

    button.addEventListener("click", function () {
      if (button.disabled) return;
      button.disabled = true;
      button.classList.add("is-refreshing");
      button.setAttribute("aria-label", "Refreshing Railway Mitra");
      window.location.reload();
    });

    header.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderRefresh, { once: true });
  } else {
    initHeaderRefresh();
  }
})();
