/* Railway Mitra — compact adaptive header action.
   Before installation: blinking PWA install CTA.
   After installation: What's New shortcut in the same header slot. */
(function () {
  "use strict";

  let deferredInstallPrompt = null;
  let toastTimer = null;
  let installedInThisSession = false;

  function isRunningInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true;
  }

  function deviceHelp() {
    const ua = navigator.userAgent || "";
    if (/iphone|ipad|ipod/i.test(ua)) {
      return "To install on iPhone/iPad: open this page in Safari → Share → Add to Home Screen → Add.";
    }
    if (/android/i.test(ua)) {
      return "If the install prompt does not open, use the browser menu (⋮) → Install app or Add to Home screen.";
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
    }, 5600);
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
      button.hidden = available < 70;
      button.classList.toggle("is-compact", available < 118);

      if (button.classList.contains("is-installed")) {
        button.textContent = available < 118 ? "Updates" : "What's New";
      } else if (!button.classList.contains("is-installing")) {
        button.textContent = available < 118 ? "Install" : "Install App";
      }
    }

    function showInstalledAction() {
      button.disabled = false;
      button.classList.remove("is-installing", "is-install-pulse");
      button.classList.add("is-installed");
      button.setAttribute("aria-label", "What's New — open Railway Updates");
      button.title = "See latest Railway updates and announcements";
      updateSlotPosition();
    }

    function showInstallAction() {
      button.disabled = false;
      button.classList.remove("is-installed", "is-installing");
      button.classList.add("is-install-pulse");
      button.setAttribute("aria-label", "Install Railway Mitra");
      button.title = "Install Railway Mitra on this device";
      updateSlotPosition();
    }

    function markInstalled() {
      installedInThisSession = true;
      deferredInstallPrompt = null;
      showInstalledAction();
    }

    header.appendChild(button);
    updateSlotPosition();
    window.addEventListener("resize", updateSlotPosition, { passive: true });
    window.addEventListener("orientationchange", updateSlotPosition, { passive: true });

    if (isRunningInstalled()) {
      showInstalledAction();
    } else {
      showInstallAction();
    }

    button.addEventListener("click", async function () {
      if (installedInThisSession || button.classList.contains("is-installed") || isRunningInstalled()) {
        window.location.href = "features/updates/index.html";
        return;
      }

      if (!deferredInstallPrompt) {
        showHelpToast(deviceHelp());
        return;
      }

      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      button.disabled = true;
      button.classList.remove("is-install-pulse");
      button.classList.add("is-installing");
      button.textContent = "Opening…";

      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") {
          button.textContent = "Installing…";
          showHelpToast("Install request accepted. This button will change to What's New when installation completes.");
        } else {
          showInstallAction();
          showHelpToast("Installation cancelled. You can try again whenever you're ready.");
        }
      } catch (error) {
        console.warn("Railway Mitra install prompt error:", error);
        showInstallAction();
        showHelpToast(deviceHelp());
      } finally {
        button.disabled = false;
        if (!button.classList.contains("is-installed")) button.classList.remove("is-installing");
      }
    });

    window.addEventListener("beforeinstallprompt", function (event) {
      if (isRunningInstalled() || installedInThisSession) return;
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
