/* Railway Mitra — isolated live updates ticker. */
(() => {
  "use strict";
  const grid = document.querySelector(".feature-grid");
  if (!grid || grid.querySelector("[data-rm-live-updates]")) return;

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "features/home-live-updates/live-updates.css?v=3";
  document.head.appendChild(style);

  const section = document.createElement("section");
  section.className = "rm-live-updates";
  section.dataset.rmLiveUpdates = "";
  section.setAttribute("aria-label", "Latest verified Railway updates");
  section.innerHTML = '<span class="rm-live-updates__label"><i class="rm-live-updates__dot" aria-hidden="true"></i><span>🔔 LATEST UPDATES</span></span><div class="rm-live-updates__viewport"><div class="rm-live-updates__track" aria-live="off"></div></div>';

  const cards = Array.from(grid.children).filter(el => el.classList.contains("feature-card"));
  const anchor = cards[2] || cards[cards.length - 1];
  if (anchor) anchor.insertAdjacentElement("afterend", section);
  else grid.appendChild(section);
  section.style.gridColumn = "1 / -1";

  const track = section.querySelector(".rm-live-updates__track");
  const lang = (() => { try { return localStorage.getItem("railwayMitraLanguage") === "hi" ? "hi" : "en"; } catch (_) { return "en"; } })();
  let tickerAnimation = null;

  function stopTicker() {
    if (tickerAnimation) tickerAnimation.cancel();
    tickerAnimation = null;
  }

  function startTicker() {
    stopTicker();
    const firstGroup = track.querySelector(".rm-live-updates__group");
    if (!firstGroup || !track.querySelectorAll(".rm-live-updates__group").length) return;
    const distance = Math.ceil(firstGroup.getBoundingClientRect().width);
    if (distance < 20) {
      requestAnimationFrame(startTicker);
      return;
    }
    // Use the Web Animations API with an exact measured loop distance.
    // This avoids CSS keyframe/viewport-width differences on Android WebView/PWA.
    track.style.setProperty("animation", "none", "important");
    if (typeof track.animate === "function") {
      const duration = Math.max(12000, Math.round(distance / 38 * 1000));
      tickerAnimation = track.animate(
        [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(-" + distance + "px,0,0)" }],
        { duration, iterations: Infinity, easing: "linear" }
      );
    } else {
      track.style.setProperty("animation", "rm-live-scroll 34s linear infinite", "important");
    }
  }

  function showEmpty(message) {
    stopTicker();
    track.replaceChildren();
    const group = document.createElement("div");
    group.className = "rm-live-updates__group";
    const text = document.createElement("span");
    text.className = "rm-live-updates__empty";
    text.textContent = message;
    group.appendChild(text);
    track.appendChild(group);
    track.style.setProperty("animation", "none", "important");
  }

  function render(notices) {
    const latest = notices
      .filter(n => n && n.verified === true && typeof n.sourceUrl === "string" && /^https:\/\//i.test(n.sourceUrl) && typeof n.publishedAt === "string")
      .sort((a,b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 8);
    if (!latest.length) { showEmpty(lang === "hi" ? "अभी कोई सत्यापित नया अपडेट उपलब्ध नहीं है" : "No verified updates available right now"); return; }

    track.replaceChildren();
    for (let copy = 0; copy < 2; copy += 1) {
      const group = document.createElement("div");
      group.className = "rm-live-updates__group";
      if (copy === 1) group.setAttribute("aria-hidden", "true");
      latest.forEach(n => {
        const link = document.createElement("a");
        link.className = "rm-live-updates__item";
        link.href = n.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = (lang === "hi" ? n.titleHi : n.titleEn) || n.titleEn || n.titleHi || "Railway notice";
        if (copy === 1) link.tabIndex = -1;
        group.appendChild(link);
        const separator = document.createElement("span");
        separator.className = "rm-live-updates__separator";
        separator.textContent = "✦";
        separator.setAttribute("aria-hidden", "true");
        group.appendChild(separator);
      });
      track.appendChild(group);
    }
    requestAnimationFrame(startTicker);
  }

  section.addEventListener("pointerenter", () => tickerAnimation && tickerAnimation.pause());
  section.addEventListener("pointerleave", () => tickerAnimation && tickerAnimation.play());
  section.addEventListener("focusin", () => tickerAnimation && tickerAnimation.pause());
  section.addEventListener("focusout", () => tickerAnimation && tickerAnimation.play());
  window.addEventListener("resize", () => { if (track.querySelectorAll(".rm-live-updates__group").length) startTicker(); }, { passive: true });

  fetch("features/updates/notices.json", { cache: "no-store" })
    .then(response => { if (!response.ok) throw new Error("Feed unavailable"); return response.json(); })
    .then(payload => render(Array.isArray(payload && payload.notices) ? payload.notices : []))
    .catch(error => { console.warn("Railway Mitra live updates ticker:", error); showEmpty(lang === "hi" ? "अपडेट लोड नहीं हो सके" : "Updates could not be loaded"); });
})();
