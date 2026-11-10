/* Railway Mitra - Share App
   Isolated share feature. Uses native share sheet where available,
   with a copy-link fallback. */
(function () {
    "use strict";

    const APP_URL = "https://sharerohit111-pixel.github.io/railway-mitra/";
    const SHARE_TITLE = "Railway Mitra";
    const SHARE_TEXT = "Railway Mitra – Your Railway Digital Companion. Salary, allowances, railway tools and useful employee services in one place.";

    function showMessage(message) {
        let toast = document.getElementById("rmShareToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "rmShareToast";
            toast.className = "rm-share-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("is-visible");
        window.clearTimeout(showMessage.timer);
        showMessage.timer = window.setTimeout(function () {
            toast.classList.remove("is-visible");
        }, 2600);
    }

    async function copyLink() {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(APP_URL);
            } else {
                const field = document.createElement("textarea");
                field.value = APP_URL;
                field.setAttribute("readonly", "");
                field.style.position = "fixed";
                field.style.opacity = "0";
                document.body.appendChild(field);
                field.select();
                const copied = document.execCommand("copy");
                field.remove();
                if (!copied) throw new Error("Copy command unavailable");
            }
            showMessage("App link copied. Share it with your friends!");
        } catch (error) {
            window.prompt("Copy the Railway Mitra app link:", APP_URL);
        }
    }

    async function shareApp() {
        const shareData = {
            title: SHARE_TITLE,
            text: SHARE_TEXT,
            url: APP_URL
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                if (error && error.name !== "AbortError") {
                    await copyLink();
                }
            }
        } else {
            await copyLink();
        }
    }

    function init() {
        const header = document.querySelector(".app-header");
        const menuButton = document.getElementById("menuBtn");
        if (!header || !menuButton || document.getElementById("rmShareBtn")) return;

        const button = document.createElement("button");
        button.type = "button";
        button.id = "rmShareBtn";
        button.className = "rm-share-btn";
        button.setAttribute("aria-label", "Share Railway Mitra app");
        button.title = "Share Railway Mitra";
        button.innerHTML = '<span aria-hidden="true">↗</span><span class="rm-share-label">Share App</span>';
        button.addEventListener("click", shareApp);
        menuButton.parentNode.insertBefore(button, menuButton);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
