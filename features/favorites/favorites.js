/* Railway Mitra dashboard favourites — isolated navigation enhancement. */
(() => {
  "use strict";
  const STORAGE_KEY = "railwayMitra.dashboardFavorites.v1";
  const grid = document.querySelector(".feature-grid");
  if (!grid) return;

  let favorites = new Set();
  let showOnlyFavorites = false;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) favorites = new Set(saved.filter(x => typeof x === "string"));
  } catch (error) {
    console.warn("Dashboard favourites could not be read:", error);
  }

  const cards = Array.from(grid.querySelectorAll(":scope > .feature-card"));
  const wrappers = [];

  cards.forEach((card, index) => {
    const href = card.getAttribute("href") || "";
    const key = href.split("?")[0].replace(/^\.\.\//, "");
    const wrapper = document.createElement("div");
    wrapper.className = "rm-favorite-card";
    wrapper.dataset.favoriteKey = key;
    wrapper.dataset.originalOrder = String(index);
    card.parentNode.insertBefore(wrapper, card);
    wrapper.appendChild(card);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "rm-favorite-toggle";
    button.setAttribute("aria-label", "Add " + (card.querySelector("h3")?.textContent.trim() || "folder") + " to favourites");
    button.title = "Add to favourites";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const name = card.querySelector("h3")?.textContent.trim() || "folder";
      if (favorites.has(key)) favorites.delete(key);
      else favorites.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favorites)));
      } catch (error) {
        console.error("Could not save favourites:", error);
      }
      updateCard(wrapper, button, name);
      sortAndFilter();
    });
    wrapper.appendChild(button);
    wrappers.push({ wrapper, card, button, key });
    updateCard(wrapper, button, card.querySelector("h3")?.textContent.trim() || "folder");
  });

  const section = grid.closest(".dashboard-section");
  const heading = section?.querySelector("h2");
  if (heading) {
    const toolbar = document.createElement("div");
    toolbar.className = "rm-favorites-toolbar";
    const label = document.createElement("span");
    label.className = "rm-favorites-count";
    label.setAttribute("aria-live", "polite");
    const filter = document.createElement("button");
    filter.type = "button";
    filter.className = "rm-favorites-filter";
    filter.textContent = "★ Show favourites";
    filter.setAttribute("aria-pressed", "false");
    filter.addEventListener("click", () => {
      showOnlyFavorites = !showOnlyFavorites;
      filter.setAttribute("aria-pressed", String(showOnlyFavorites));
      filter.classList.toggle("active", showOnlyFavorites);
      filter.textContent = showOnlyFavorites ? "★ Show all folders" : "★ Show favourites";
      sortAndFilter();
    });
    toolbar.append(label, filter);
    heading.insertAdjacentElement("afterend", toolbar);
    toolbar.dataset.labelId = "rm-favorites-count";
  }

  function updateCard(wrapper, button, name) {
    const active = favorites.has(wrapper.dataset.favoriteKey);
    wrapper.classList.toggle("is-favorite", active);
    button.classList.toggle("is-active", active);
    button.textContent = active ? "★" : "☆";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", (active ? "Remove " : "Add ") + name + (active ? " from" : " to") + " favourites");
    button.title = active ? "Remove from favourites" : "Add to favourites";
  }

  function sortAndFilter() {
    const sorted = wrappers.slice().sort((a, b) => {
      const favDiff = Number(favorites.has(b.key)) - Number(favorites.has(a.key));
      return favDiff || Number(a.wrapper.dataset.originalOrder) - Number(b.wrapper.dataset.originalOrder);
    });
    sorted.forEach(item => {
      const isFavorite = favorites.has(item.key);
      item.wrapper.hidden = showOnlyFavorites && !isFavorite;
      grid.appendChild(item.wrapper);
    });
    const count = section?.querySelector(".rm-favorites-count");
    if (count) count.textContent = favorites.size + " favourite folder(s)";
  }

  sortAndFilter();
})();