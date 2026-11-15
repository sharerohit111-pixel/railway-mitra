/* Railway Mitra — isolated Explore Features home module.
   Uses only existing feature routes; does not move, replace or modify existing cards. */
(() => {
  "use strict";
  const mount = () => {
    const privacy = document.querySelector(".privacy-section");
    if (!privacy || document.querySelector(".rm-feature-explorer")) return;

    const section = document.createElement("section");
    section.className = "rm-feature-explorer";
    section.setAttribute("aria-labelledby", "rmFeatureExplorerTitle");
    section.innerHTML = `
      <div class="rm-feature-explorer__heading">
        <div><div class="rm-feature-explorer__eyebrow">Discover more in Railway Mitra</div><h2 class="rm-feature-explorer__title" id="rmFeatureExplorerTitle">Explore <span>Features</span></h2></div>
        <span aria-hidden="true" style="font-size:27px">✦</span>
      </div>
      <p class="rm-feature-explorer__intro">Useful railway employee tools, references and everyday services — open any feature directly from here.</p>
      <div class="rm-feature-explorer__grid">
        <article class="rm-feature-explorer__card"><div class="rm-feature-explorer__card-top"><span class="rm-feature-explorer__icon" aria-hidden="true">💼</span><h3>Salary &amp; Benefits</h3></div><p>Pay, tax, pension and employee benefit tools.</p><div class="rm-feature-explorer__links">
          <a class="rm-feature-explorer__link" href="features/salary/index.html">Salary &amp; Pay</a><a class="rm-feature-explorer__link" href="features/income-tax/index.html">Income Tax</a><a class="rm-feature-explorer__link" href="employee-benefits-calculators/index.html">Employee Benefits</a><a class="rm-feature-explorer__link" href="features/retirement/index.html">NPS &amp; Pension</a>
        </div></article>
        <article class="rm-feature-explorer__card"><div class="rm-feature-explorer__card-top"><span class="rm-feature-explorer__icon" aria-hidden="true">🧾</span><h3>Pay Updates &amp; Arrears</h3></div><p>Explore pay commission, allowance and arrear resources.</p><div class="rm-feature-explorer__links">
          <a class="rm-feature-explorer__link" href="features/pay-commission-8th/index.html">8th Pay Commission</a><a class="rm-feature-explorer__link" href="features/allowances/index.html">Allowances</a><a class="rm-feature-explorer__link" href="features/arrears/index.html">Arrear Calculator</a><a class="rm-feature-explorer__link" href="features/nh-holidays/index.html">NH &amp; NHA</a>
        </div></article>
        <article class="rm-feature-explorer__card"><div class="rm-feature-explorer__card-top"><span class="rm-feature-explorer__icon" aria-hidden="true">📅</span><h3>Duty &amp; Personal Tools</h3></div><p>Keep duty records and personal notes together.</p><div class="rm-feature-explorer__links">
          <a class="rm-feature-explorer__link" href="features/duty-diary/index.html">Duty Roster &amp; Diary</a><a class="rm-feature-explorer__link" href="features/personal-diary/index.html">Personal Diary</a><a class="rm-feature-explorer__link" href="features/profile/index.html">Employee Profile</a>
        </div></article>
        <article class="rm-feature-explorer__card"><div class="rm-feature-explorer__card-top"><span class="rm-feature-explorer__icon" aria-hidden="true">📚</span><h3>Rules &amp; Manuals</h3></div><p>Quick access to railway rules and technical references.</p><div class="rm-feature-explorer__links">
          <a class="rm-feature-explorer__link" href="features/rules/index.html">Railway Rules</a><a class="rm-feature-explorer__link" href="features/p-way-manuals/index.html">P-Way Manuals</a><a class="rm-feature-explorer__link" href="features/p-way-quick-reference/index.html">P-Way Quick Reference</a>
        </div></article>
        <article class="rm-feature-explorer__card"><div class="rm-feature-explorer__card-top"><span class="rm-feature-explorer__icon" aria-hidden="true">📐</span><h3>Track Engineering</h3></div><p>Engineering parameters and railway track calculators.</p><div class="rm-feature-explorer__links">
          <a class="rm-feature-explorer__link" href="features/p-way-civil-engineering-tools/index.html">Engineering Calculators</a><a class="rm-feature-explorer__link" href="features/p-way-quick-reference/index.html">Track Parameters</a>
        </div></article>
        <article class="rm-feature-explorer__card"><div class="rm-feature-explorer__card-top"><span class="rm-feature-explorer__icon" aria-hidden="true">🧭</span><h3>More Services</h3></div><p>Stay informed and manage app preferences.</p><div class="rm-feature-explorer__links">
          <a class="rm-feature-explorer__link" href="features/updates/index.html">Railway Updates</a><a class="rm-feature-explorer__link" href="features/map/index.html">Railway Map</a><a class="rm-feature-explorer__link" href="features/compliance/index.html">Data &amp; Compliance</a><a class="rm-feature-explorer__link" href="features/settings/index.html">Settings</a>
        </div></article>
      </div>
      <p class="rm-feature-explorer__footer">More useful tools, references and employee services in one place.</p>
    `;
    privacy.insertAdjacentElement("afterend", section);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }


  // Show verified child tools directly beneath their dashboard folder cards.
  // The folder card remains a normal link; child shortcuts are separate sibling links.
  const mountDashboardShortcuts = () => {
    const grid = document.querySelector(".feature-grid");
    if (!grid || grid.querySelector(".rm-dashboard-shortcuts")) return;

    const shortcutMap = {
      "features/salary/index.html": [
        ["Monthly Salary", "features/salary/monthly-salary/"],
        ["Promotion & MACP", "features/salary/promotion-macp/"]
      ],
      "features/income-tax/index.html": [
        ["New Tax Regime", null], ["Old Tax Regime", null]
      ],
      "employee-benefits-calculators/index.html": [
        ["Gratuity", "employee-benefits-calculators/gratuity-calculator/index.html"],
        ["Leave Encashment", "employee-benefits-calculators/leave-encashment-calculator/index.html"],
        ["CEA", "employee-benefits-calculators/cea-calculator/index.html"],
        ["NPS vs UPS", "employee-benefits-calculators/nps-vs-ups-calculator/index.html"]
      ],
      "features/pay-commission-8th/index.html": [
        ["New Salary Estimate", null], ["Arrear Estimate", null]
      ],
      "features/nh-holidays/index.html": [
        ["2026–2028 Calendar", null], ["NHA Reference", null]
      ],
      "features/allowances/index.html": [
        ["DA", "features/allowances/da/index.html"],
        ["DA Arrear", "features/allowances/da-arrear/index.html"],
        ["HRA", "features/allowances/hra/index.html"],
        ["TA", "features/allowances/ta/index.html"],
        ["NDA", "features/allowances/nda/index.html"],
        ["OTA", "features/allowances/ota/index.html"],
        ["KMA", "features/allowances/kma/index.html"]
      ],
      "features/arrears/index.html": [
        ["DA Arrears", null], ["Other Arrears", null]
      ],
      "features/duty-diary/index.html": [
        ["Duty Roster", null], ["TA", null], ["NDA", null], ["OTA", null], ["KMA", null], ["Monthly Records", null]
      ],
      "features/personal-diary/index.html": [
        ["Personal Notes", null], ["Reminders", null], ["Search & Organize", null]
      ],
      "features/retirement/index.html": [
        ["NPS & Pension", null],
        ["NPS vs UPS Calculator", "employee-benefits-calculators/nps-vs-ups-calculator/index.html"]
      ],
      "features/rules/index.html": [
        ["Rules in English", "features/rules/en/index.html"],
        ["नियम हिंदी में", "features/rules/hi/index.html"]
      ],
      "features/p-way-manuals/index.html": [
        ["IRPWM", null], ["ACS", null], ["Track Safety Rules", null], ["Technical Manuals", null]
      ],
      "features/p-way-civil-engineering-tools/index.html": [
        ["Sleeper & Fittings", "features/p-way-civil-engineering-tools/sleeper-fastening-ballast-quantity-calculator/index.html"],
        ["SEJ Gap", "features/p-way-civil-engineering-tools/sej-gap-rail-expansion-calculator/index.html"],
        ["Weather Patrolling", "features/p-way-civil-engineering-tools/hot-cold-weather-patrolling-calculator/index.html"],
        ["Cant & Safe Speed", "features/p-way-civil-engineering-tools/cant-safe-speed-calculator/index.html"],
        ["Switch Fittings", "features/p-way-civil-engineering-tools/switch-fittings-calculator/index.html"],
        ["Crossing", "features/p-way-civil-engineering-tools/crossing-calculator/index.html"],
        ["Versine", "features/p-way-civil-engineering-tools/versine-calculator/index.html"]
      ],
      "features/p-way-quick-reference/index.html": [
        ["Track Gauge", null], ["SEJ", null], ["LWR", null], ["Turnout", null], ["Ballast", null], ["Rail Wear", null]
      ],
      "features/updates/index.html": [
        ["Railway Orders", null], ["Notifications", null], ["PDF Library", null]
      ],
      "features/map/index.html": [
        ["Interactive Railway Map", null]
      ],
      "features/compliance/index.html": [
        ["Source Register", null], ["Reuse Checklist", null]
      ],
      "features/settings/index.html": [
        ["App Preferences", null], ["Backup", null], ["Privacy", null]
      ]
    };

    grid.querySelectorAll(":scope > .rm-favorite-card").forEach(wrapper => {
      const card = wrapper.querySelector(":scope > .feature-card");
      if (!card) return;
      const key = (card.getAttribute("href") || "").replace(/^\.\//, "").split("?")[0];
      const items = shortcutMap[key];
      if (!items || !items.length) return;

      wrapper.classList.add("has-dashboard-shortcuts");
      const tray = document.createElement("div");
      tray.className = "rm-dashboard-shortcuts";
      tray.setAttribute("aria-label", "Quick links inside " + (card.querySelector("h3")?.textContent.trim() || "folder"));
      items.forEach(([label, href], index) => {
        const link = document.createElement(href ? "a" : "span");
        link.className = "rm-dashboard-shortcut" + (href ? "" : " is-label");
        if (href) {
          link.href = href;
          link.addEventListener("click", event => event.stopPropagation());
        }
        link.textContent = label;
        link.style.setProperty("--rm-chip-delay", (index * -0.43) + "s");
        tray.appendChild(link);
      });
      wrapper.appendChild(tray);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountDashboardShortcuts, { once: true });
  } else {
    mountDashboardShortcuts();
  }

  // Expanded individual calculator shortcuts. Original feature folders remain the source of truth.
  const mountCalculatorShelf = () => {
    const explorer = document.querySelector(".rm-feature-explorer");
    if (!explorer || document.querySelector(".rm-calculator-shelf")) return;

    const groups = [
      { title: "Track Engineering Calculators", note: "Individual P-Way engineering tools", icon: "🚦", items: [
        ["Sleeper, Fastening & Ballast Quantity", "🧱", "features/p-way-civil-engineering-tools/sleeper-fastening-ballast-quantity-calculator/index.html", "Estimate sleepers, fittings and ballast quantities."],
        ["SEJ Gap & Rail Expansion", "🛤️", "features/p-way-civil-engineering-tools/sej-gap-rail-expansion-calculator/index.html", "Estimate temperature-related SEJ gap change."],
        ["Hot/Cold Weather Patrolling", "🌡️", "features/p-way-civil-engineering-tools/hot-cold-weather-patrolling-calculator/index.html", "Check LWR temperature and patrolling references."],
        ["Cant & Safe Speed", "📏", "features/p-way-civil-engineering-tools/cant-safe-speed-calculator/index.html", "Calculate cant and theoretical safe speed."],
        ["Railway Switch Fittings", "🔀", "features/p-way-civil-engineering-tools/switch-fittings-calculator/index.html", "Look up switch fittings and dimensions."],
        ["Crossing Calculator", "🚦", "features/p-way-civil-engineering-tools/crossing-calculator/index.html", "Look up crossing fittings and components."],
        ["Versine Calculator", "📐", "features/p-way-civil-engineering-tools/versine-calculator/index.html", "Calculate curve versine from track inputs."]
      ]},
      { title: "Allowance Calculators", note: "Open each calculator directly", icon: "💠", items: [
        ["Dearness Allowance (DA)", "％", "features/allowances/da/index.html", "Calculate Dearness Allowance."],
        ["DA Arrear Calculator", "＋", "features/allowances/da-arrear/index.html", "Calculate pending DA arrears."],
        ["House Rent Allowance (HRA)", "🏠", "features/allowances/hra/index.html", "Calculate House Rent Allowance."],
        ["Transport Allowance (TA)", "🚉", "features/allowances/ta/index.html", "Calculate Transport Allowance."],
        ["Night Duty Allowance (NDA)", "🌙", "features/allowances/nda/index.html", "Calculate Night Duty Allowance."],
        ["Overtime Allowance (OTA)", "⏱️", "features/allowances/ota/index.html", "Calculate Overtime Allowance."],
        ["Kilometrage Allowance (KMA)", "🚴", "features/allowances/kma/index.html", "Calculate kilometre-based allowance."]
      ]},
      { title: "Salary & Employee Benefit Calculators", note: "Pay fixation, tax and retirement estimates", icon: "💰", items: [
        ["Monthly Salary Calculator", "🧾", "features/salary/monthly-salary/", "Estimate monthly salary, allowances and deductions."],
        ["Promotion & MACP Pay Fixation", "📈", "features/salary/promotion-macp/", "Estimate revised basic pay after promotion or MACP."],
        ["Retirement Gratuity", "🏦", "employee-benefits-calculators/gratuity-calculator/index.html", "Estimate retirement gratuity."],
        ["Leave Encashment", "🌴", "employee-benefits-calculators/leave-encashment-calculator/index.html", "Estimate leave encashment."],
        ["Children's Education Allowance", "🎓", "employee-benefits-calculators/cea-calculator/index.html", "Calculate CEA claims."],
        ["NPS vs UPS Calculator", "⚖️", "employee-benefits-calculators/nps-vs-ups-calculator/index.html", "Compare NPS and UPS estimates."],
        ["Income Tax Calculator", "🧮", "features/income-tax/index.html", "Explore old and new tax regime calculations."],
        ["8th Pay Commission Calculator", "📊", "features/pay-commission-8th/index.html", "Estimate revised pay and arrears."]
      ]}
    ];

    const shelf = document.createElement("section");
    shelf.className = "rm-calculator-shelf";
    shelf.id = "rmCalculatorShelf";
    shelf.setAttribute("aria-labelledby", "rmCalculatorShelfTitle");
    shelf.innerHTML = `
      <header class="rm-calculator-shelf__header">
        <div><span class="rm-calculator-shelf__eyebrow">More tools · One-tap access</span><h2 id="rmCalculatorShelfTitle">Explore <span>Every Calculator</span></h2><p>Individual shortcuts to tools already available inside Railway Mitra.</p></div>
        <button type="button" class="rm-calculator-shelf__rollback" id="rmClassicHomeBtn">Classic Home</button>
      </header>
      <div class="rm-calculator-shelf__groups"></div>
      <p class="rm-calculator-shelf__foot">These are Home Screen shortcuts only. Original folders, pages and calculator logic remain unchanged.</p>
    `;

    const groupsRoot = shelf.querySelector(".rm-calculator-shelf__groups");
    groups.forEach((group, groupIndex) => {
      const block = document.createElement("section");
      block.className = "rm-calculator-shelf__group";
      const heading = document.createElement("div");
      heading.className = "rm-calculator-shelf__group-heading";
      heading.innerHTML = `<span class="rm-calculator-shelf__group-icon" aria-hidden="true">${group.icon}</span><div><h3>${group.title}</h3><p>${group.note}</p></div><span class="rm-calculator-shelf__count">${group.items.length}</span>`;
      const grid = document.createElement("div");
      grid.className = "rm-calculator-shelf__grid";
      group.items.forEach((item, itemIndex) => {
        const link = document.createElement("a");
        link.className = "rm-calculator-shelf__tile";
        link.href = item[2];
        link.innerHTML = `<span class="rm-calculator-shelf__tile-icon" aria-hidden="true">${item[1]}</span><span class="rm-calculator-shelf__tile-copy"><strong></strong><small></small></span><span class="rm-calculator-shelf__arrow" aria-hidden="true">↗</span>`;
        link.querySelector("strong").textContent = item[0];
        link.querySelector("small").textContent = item[3];
        grid.appendChild(link);
      });
      block.append(heading, grid);
      groupsRoot.appendChild(block);
    });

    explorer.insertAdjacentElement("afterend", shelf);

    const restore = document.createElement("button");
    restore.type = "button";
    restore.id = "rmExpandedHomeRestore";
    restore.className = "rm-expanded-home-restore";
    restore.textContent = "Show all tools";
    restore.setAttribute("aria-controls", "rmCalculatorShelf");
    restore.hidden = true;
    document.body.appendChild(restore);

    const key = "rm_home_expanded_catalog_hidden_v1";
    const setClassic = (classic) => {
      shelf.hidden = classic;
      restore.hidden = !classic;
      try { localStorage.setItem(key, classic ? "yes" : "no"); } catch (_) {}
    };
    let classic = false;
    try { classic = localStorage.getItem(key) === "yes"; } catch (_) {}
    setClassic(classic);
    shelf.querySelector("#rmClassicHomeBtn").addEventListener("click", () => setClassic(true));
    restore.addEventListener("click", () => setClassic(false));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountCalculatorShelf, { once: true });
  } else {
    mountCalculatorShelf();
  }
})();
