/* Railway Mitra — compact adaptive header action.
   Before installation: offers PWA installation.
   After installation: becomes a shortcut to Railway Updates. */
(function () {
  "use strict";

  let deferredInstallPrompt = null;
  let toastTimer = null;

  const INSTALLED_KEY = "rm_pwa_installed_v1";

  function isAppInstalled() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true;
    let remembered = false;
    try { remembered = localStorage.getItem(INSTALLED_KEY) === "yes"; } catch (_) {}
    return standalone || remembered;
  }

  function deviceHelp() {
    const ua = navigator.userAgent || "";
    if (/iphone|ipad|ipod/i.test(ua)) {
      return "To install: open Safari Share → Add to Home Screen → Add.";
    }
    if (/android/i.test(ua)) {
      return "To install: open the browser menu (⋮) → Install app or Add to Home screen.";
    }
    return "Use your browser's install icon or menu and choose Install Railway Mitra.";
  }

  function showHelpToast(message) {
    let toast = document.getElementById("rmInstallToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "rmInstallToast";
      toast.className = "rm-header-install-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 5200);
  }

  function init() {
    const header = document.querySelector(".app-header");
    const refresh = header && header.querySelector(".rm-header-refresh");
    const founder = header && header.querySelector(".rm-founder-credit");
    if (!header || !refresh || !founder || document.getElementById("rmHeaderInstallAction")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "rmHeaderInstallAction";
    button.className = "rm-header-install-action";
    button.setAttribute("aria-live", "polite");
    button.setAttribute("aria-label", "Install Railway Mitra");

    function updateSlotPosition() {
      const headerRect = header.getBoundingClientRect();
      const refreshRect = refresh.getBoundingClientRect();
      const founderRect = founder.getBoundingClientRect();
      const left = Math.max(0, refreshRect.right - headerRect.left + 8);
      const right = Math.max(left, founderRect.left - headerRect.left - 8);
      const available = Math.max(0, right - left);
      button.style.left = left + "px";
      button.style.width = available + "px";
      button.hidden = available < 54;
      button.classList.toggle("is-compact", available < 94);
    }

    function showInstalledAction() {
      button.hidden = false;
      button.disabled = false;
      button.classList.remove("is-installing");
      button.classList.add("is-installed");
      button.textContent = button.clientWidth < 94 ? "Updates" : "What's New";
      button.setAttribute("aria-label", "What's New — open Railway Updates");
      button.title = "See latest Railway updates and announcements";
      updateSlotPosition();
    }

    function showInstallAction() {
      button.classList.remove("is-installed", "is-installing");
      button.textContent = button.clientWidth < 94 ? "Install" : "Install App";
      button.setAttribute("aria-label", "Install Railway Mitra");
      button.title = "Install Railway Mitra on this device";
      updateSlotPosition();
    }

    function markInstalled() {
      try { localStorage.setItem(INSTALLED_KEY, "yes"); } catch (_) {}
      deferredInstallPrompt = null;
      showInstalledAction();
    }

    header.appendChild(button);
    updateSlotPosition();
    window.addEventListener("resize", updateSlotPosition, { passive: true });
    window.addEventListener("orientationchange", updateSlotPosition, { passive: true });

    if (isAppInstalled()) {
      showInstalledAction();
    } else {
      showInstallAction();
    }

    button.addEventListener("click", async function () {
      if (isAppInstalled() || button.classList.contains("is-installed")) {
        window.location.href = "features/updates/index.html";
        return;
      }

      if (!deferredInstallPrompt) {
        showHelpToast(deviceHelp());
        return;
      }

      button.disabled = true;
      button.classList.add("is-installing");
      button.textContent = "Opening…";
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === "accepted") {
          button.textContent = "Installing…";
          showHelpToast("Installation accepted. The button will change to What's New after installation.");
        } else {
          showHelpToast("Installation cancelled. You can install Railway Mitra later from the browser menu.");
          showInstallAction();
        }
      } catch (error) {
        console.warn("Railway Mitra install prompt error:", error);
        showHelpToast(deviceHelp());
        showInstallAction();
      } finally {
        deferredInstallPrompt = null;
        button.disabled = false;
      }
    });

    window.addEventListener("beforeinstallprompt", function (event) {
      if (isAppInstalled()) return;
      event.preventDefault();
      deferredInstallPrompt = event;
      showInstallAction();
    });

    window.addEventListener("appinstalled", markInstalled);

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    if (standaloneQuery.addEventListener) {
      standaloneQuery.addEventListener("change", function (event) {
        if (event.matches) markInstalled();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
