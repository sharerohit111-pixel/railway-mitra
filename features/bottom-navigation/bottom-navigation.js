/* Railway Mitra — Bottom Navigation (isolated module)
   Help & Support is connected. Feedback remains a reserved slot for its own module. */

(function () {
  "use strict";

  function initBottomNavigation() {
    if (document.querySelector(".rm-bottom-nav")) return;

    const nav = document.createElement("nav");
    nav.className = "rm-bottom-nav";
    nav.setAttribute("aria-label", "Primary navigation");

    const icon = (paths) =>
      '<svg class="rm-bottom-nav__icon" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

    const items = [
      {
        className: "rm-bottom-nav__item--pway",
        label: "P-Way",
        title: "Open P-Way & Civil Engineering Tools",
        href: "features/p-way-civil-engineering-tools/index.html",
        paths: '<path d="M3 19h18M5 19l3-8 4 8 4-8 3 8"/><path d="M4 7h16M7 4l-3 3 3 3M17 4l3 3-3 3"/>'
      },
      {
        className: "",
        label: "Help & Support",
        title: "Open Help & Support",
        href: "features/help-support/index.html",
        paths: '<path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/><path d="M17 19a5 5 0 0 1-5 3h-1"/>',
        reserved: true
      },
      {
        className: "rm-bottom-nav__item--home",
        label: "Home",
        title: "Home",
        paths: '<path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/>',
        home: true
      },
      {
        className: "rm-bottom-nav__item--reserved",
        label: "Later",
        title: "Navigation slot reserved for a future feature",
        paths: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
        reserved: true
      },
      {
        className: "rm-bottom-nav__item--feedback",
        label: "Feedback",
        title: "Open Feedback for Us",
        href: "features/feedback/index.html",
        paths: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2v-7.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="m12 7 1.1 2.2 2.4.3-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4-1.8-1.7 2.4-.3Z"/>',
        reserved: true
      }
    ];

    items.forEach(function (item) {
      const control = document.createElement(item.home || item.href ? "a" : "button");
      control.className = "rm-bottom-nav__item " + item.className;
      control.title = item.title;
      control.setAttribute("aria-label", item.title);

      if (item.home) {
        control.href = "./";
        control.setAttribute("aria-current", "page");
      } else if (item.href) {
        control.href = item.href;
      } else {
        control.type = "button";
        control.disabled = true;
        control.setAttribute("aria-disabled", "true");
      }

      control.innerHTML = icon(item.paths) +
        '<span class="rm-bottom-nav__label"></span>';
      control.querySelector(".rm-bottom-nav__label").textContent = item.label;
      nav.appendChild(control);
    });

    document.body.appendChild(nav);
    document.body.classList.add("rm-has-bottom-nav");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBottomNavigation, { once: true });
  } else {
    initBottomNavigation();
  }
})();
