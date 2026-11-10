/* Railway Mitra - Public App Search
 * Searches public app pages only. Admin folders, admin routes and admin links
 * are deliberately excluded and are never fetched or indexed.
 */
(() => {
  "use strict";

  const ADMIN_SEGMENT = /(^|\/)(admin|admin-panel|admin-workspace)(\/|$)/i;
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const safeUrl = (href) => {
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      if (ADMIN_SEGMENT.test(url.pathname)) return null;
      if (/\/admin(?:\.|-|\/|$)/i.test(url.pathname)) return null;
      if (!/\.html?$/i.test(url.pathname) && !url.pathname.endsWith("/")) return null;
      return url.href;
    } catch (_) { return null; }
  };

  const root = document.createElement("section");
  root.className = "rm-global-search";
  root.setAttribute("role", "search");
  root.innerHTML = `
    <div class="rm-search-wrap">
      <span class="rm-search-icon" aria-hidden="true">⌕</span>
      <input class="rm-search-input" type="search" autocomplete="off"
        placeholder="Search anything in Railway Mitra…"
        aria-label="Search public Railway Mitra features" />
      <button class="rm-search-clear" type="button" aria-label="Clear search" hidden>×</button>
    </div>
    <div class="rm-search-results" aria-live="polite" hidden></div>
  `;

  const header = document.querySelector(".app-header");
  const main = document.querySelector("main");
  if (!header || !main || document.querySelector(".rm-global-search")) return;
  main.parentNode.insertBefore(root, main);

  const input = root.querySelector("input");
  const clear = root.querySelector("button");
  const results = root.querySelector(".rm-search-results");
  const records = new Map();
  let timer;

  function addRecord(record) {
    if (!record.url || ADMIN_SEGMENT.test(new URL(record.url).pathname)) return;
    const previous = records.get(record.url);
    if (!previous || record.text.length > previous.text.length) records.set(record.url, record);
  }

  function parsePage(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript,template,iframe,form").forEach(n => n.remove());
    const title = clean(doc.querySelector("title")?.textContent) ||
      clean(doc.querySelector("h1")?.textContent) || "Railway Mitra";
    const headings = [...doc.querySelectorAll("h1,h2,h3,h4")].map(n => clean(n.textContent)).filter(Boolean);
    const bodyText = clean(doc.body?.innerText || doc.body?.textContent).slice(0, 12000);
    addRecord({ url, title, headings, text: clean([title, ...headings, bodyText].join(" ")) });
    const links = [...doc.querySelectorAll("a[href]")].map(a => safeUrl(a.getAttribute("href"))).filter(Boolean);
    return links;
  }

  async function buildIndex() {
    const queue = [...document.querySelectorAll("a[href]")].map(a => safeUrl(a.getAttribute("href"))).filter(Boolean);
    const visited = new Set([window.location.href]);
    addRecord({
      url: window.location.href,
      title: clean(document.querySelector("h1")?.textContent) || "Railway Mitra",
      headings: [...document.querySelectorAll("h1,h2,h3")].map(n => clean(n.textContent)),
      text: clean(document.body.innerText).slice(0, 12000)
    });

    let count = 0;
    while (queue.length && count < 100) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);
      if (ADMIN_SEGMENT.test(new URL(url).pathname)) continue;
      count++;
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok || !/text\/html/i.test(response.headers.get("content-type") || "")) continue;
        const links = parsePage(await response.text(), url);
        for (const link of links) if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      } catch (_) { /* Unavailable/offline pages are skipped safely. */ }
    }
  }

  function showMatches(query) {
    const words = clean(query).toLowerCase().split(" ").filter(Boolean);
    results.replaceChildren();
    if (!words.length) { results.hidden = true; return; }
    const matches = [...records.values()].map(item => {
      const haystack = item.text.toLowerCase();
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { ...item, score };
    }).filter(item => item.score > 0)
      .sort((a,b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 12);

    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "rm-search-empty";
      empty.textContent = "No matching public feature found. Try another keyword.";
      results.appendChild(empty);
    } else {
      matches.forEach(item => {
        const link = document.createElement("a");
        link.className = "rm-search-result";
        link.href = item.url;
        const heading = document.createElement("strong");
        heading.textContent = item.title;
        const detail = document.createElement("span");
        detail.textContent = item.headings.slice(0, 2).join(" • ") || "Open feature";
        link.append(heading, detail);
        results.appendChild(link);
      });
    }
    results.hidden = false;
  }

  input.addEventListener("input", () => {
    clear.hidden = !input.value;
    showMatches(input.value);
  });
  clear.addEventListener("click", () => {
    input.value = "";
    clear.hidden = true;
    results.hidden = true;
    input.focus();
  });
  document.addEventListener("click", event => {
    if (!root.contains(event.target)) results.hidden = true;
  });
  input.addEventListener("focus", () => { if (input.value) showMatches(input.value); });

  buildIndex().then(() => {
    root.dataset.ready = "true";
    if (input.value) showMatches(input.value);
  });
})();
