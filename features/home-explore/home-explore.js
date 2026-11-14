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
})();
