/* Railway Mitra - main page PWA installer
   Visible Install App control with native prompt and browser-menu fallback. */
(function () {
    "use strict";

    let deferredInstallPrompt = null;

    function isAppInstalled() {
        return window.matchMedia("(display-mode: standalone)").matches ||
            window.matchMedia("(display-mode: fullscreen)").matches ||
            window.navigator.standalone === true;
    }

    function deviceHelp() {
        const ua = navigator.userAgent || "";
        if (/iphone|ipad|ipod/i.test(ua)) {
            return "iPhone/iPad: Open this page in Safari → tap Share → Add to Home Screen → Add.";
        }
        if (/android/i.test(ua)) {
            return "Android: Open the browser menu (⋮) → choose “Install app” or “Add to Home screen”.";
        }
        return "Open your browser menu or address-bar install icon and choose “Install Railway Mitra”.";
    }

    function init() {
        const welcome = document.querySelector(".welcome-section");
        if (!welcome || document.getElementById("rmHomeInstall")) return;

        const section = document.createElement("section");
        section.className = "rm-home-install";
        section.id = "rmHomeInstall";
        section.setAttribute("aria-label", "Install Railway Mitra");

        const main = document.createElement("div");
        main.className = "rm-home-install-main";

        const icon = document.createElement("span");
        icon.className = "rm-home-install-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "↓";

        const copy = document.createElement("div");
        copy.className = "rm-home-install-copy";

        const heading = document.createElement("h3");
        heading.textContent = "Install Railway Mitra";

        const description = document.createElement("p");
        description.textContent = "Add it to your home screen for quick access.";

        copy.append(heading, description);
        main.append(icon, copy);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "rm-home-install-action";
        button.id = "rmHomeInstallButton";
        button.textContent = "Install App";
        button.setAttribute("aria-describedby", "rmHomeInstallStatus rmHomeInstallHelp");

        const status = document.createElement("p");
        status.className = "rm-home-install-status";
        status.id = "rmHomeInstallStatus";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.textContent = "Install Railway Mitra on this device.";

        const help = document.createElement("p");
        help.className = "rm-home-install-help";
        help.id = "rmHomeInstallHelp";
        help.hidden = true;

        section.append(main, button, status, help);
        welcome.insertAdjacentElement("afterend", section);

        function showManualHelp() {
            help.textContent = deviceHelp();
            help.hidden = false;
            status.textContent = "Automatic install prompt is not available in this browser right now.";
        }

        if (isAppInstalled()) {
            section.remove();
            return;
        }

        button.addEventListener("click", async function () {
            if (!deferredInstallPrompt) {
                showManualHelp();
                return;
            }

            button.disabled = true;
            try {
                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                if (choice && choice.outcome === "accepted") {
                    status.textContent = "Installation accepted. Railway Mitra will be added to your home screen.";
                    button.textContent = "Installing…";
                } else {
                    status.textContent = "Installation was cancelled. You can try again or use the browser menu.";
                }
            } catch (error) {
                console.warn("Railway Mitra install prompt error:", error);
                showManualHelp();
            } finally {
                deferredInstallPrompt = null;
                button.disabled = false;
            }
        });

        window.addEventListener("beforeinstallprompt", function (event) {
            event.preventDefault();
            deferredInstallPrompt = event;
            button.disabled = false;
            button.textContent = "Install App";
            status.textContent = "Ready to install Railway Mitra.";
            help.hidden = true;
        });

        window.addEventListener("appinstalled", function () {
            deferredInstallPrompt = null;
            section.remove();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
