/* Railway Mitra — isolated live updates ticker; reads only verified notices. */
(() => {
  "use strict";
  const grid = document.querySelector(".feature-grid");
  if (!grid || grid.querySelector("[data-rm-live-updates]")) return;

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "features/home-live-updates/live-updates.css?v=1";
  document.head.appendChild(style);

  const section = document.createElement("section");
  section.className = "rm-live-updates";
  section.dataset.rmLiveUpdates = "";
  section.setAttribute("aria-label", "Latest verified Railway updates");
  section.innerHTML = '<span class="rm-live-updates__label"><i class="rm-live-updates__dot" aria-hidden="true"></i><span>🔔 LATEST UPDATES</span></span><div class="rm-live-updates__viewport"><div class="rm-live-updates__track" aria-live="off"></div></div>';

  const cards = Array.from(grid.children).filter(el => el.classList.contains("feature-card"));
  const anchor = cards[4] || cards[cards.length - 1];
  if (anchor) anchor.insertAdjacentElement("afterend", section);
  else grid.appendChild(section);
  section.style.gridColumn = "1 / -1";

  const track = section.querySelector(".rm-live-updates__track");
  const labelText = section.querySelector(".rm-live-updates__label span");
  let latestNotices = [];
  function currentLanguage() {
    try {
      return window.RailwayMitraLanguage && window.RailwayMitraLanguage.get() === "en" ? "en" : "hi";
    } catch (_) {
      return "hi";
    }
  }

  function showEmpty(message) {
    track.replaceChildren();
    const group = document.createElement("div");
    group.className = "rm-live-updates__group";
    const text = document.createElement("span");
    text.className = "rm-live-updates__empty";
    text.textContent = message;
    group.appendChild(text);
    track.appendChild(group);
    track.style.animation = "none";
  }

  function render(notices) {
    const lang = currentLanguage();
    if (labelText) labelText.textContent = lang === "hi" ? "🔔 नवीनतम अपडेट" : "🔔 LATEST UPDATES";
    const seenSources = new Set();
    const latest = notices
      .filter(n => {
        if (!n || n.verified !== true || typeof n.sourceUrl !== "string" ||
            !/^https:\/\//i.test(n.sourceUrl) || typeof n.publishedAt !== "string") return false;
        // Treat URL-encoded and literal semicolons as the same official PDF.
        const canonicalSource = n.sourceUrl.replace(/%3B/ig, ";").replace(/#.*$/, "").toLowerCase();
        if (seenSources.has(canonicalSource)) return false;
        seenSources.add(canonicalSource);
        return true;
      })
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
        const hindiTitle = n.titleHi && n.titleHi !== "रेलवे बोर्ड की आधिकारिक सूचना" ? n.titleHi : "";
        link.textContent = (lang === "hi" ? (hindiTitle || n.titleEn) : n.titleEn) || hindiTitle || "Railway notice";
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
  }

  fetch("features/updates/notices.json", { cache: "no-store" })
    .then(response => { if (!response.ok) throw new Error("Feed unavailable"); return response.json(); })
    .then(payload => {
      latestNotices = Array.isArray(payload && payload.notices) ? payload.notices : [];
      render(latestNotices);
    })
    .catch(error => {
      console.warn("Railway Mitra live updates ticker:", error);
      const lang = currentLanguage();
      if (labelText) labelText.textContent = lang === "hi" ? "🔔 नवीनतम अपडेट" : "🔔 LATEST UPDATES";
      showEmpty(lang === "hi" ? "अपडेट लोड नहीं हो सके" : "Updates could not be loaded");
    });

  document.addEventListener("click", event => {
    if (event.target && event.target.closest("#rmLanguageToggle") && latestNotices.length) {
      window.setTimeout(() => render(latestNotices), 0);
    }
  });
})();
