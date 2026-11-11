/* Railway Mitra Home Highlights — isolated data/render module. */
(() => {
  "use strict";

  const root = document.querySelector("[data-rm-home-highlights]");
  if (!root) return;

  // Tools verified in the current app repository.
  const toolItems = [
    "DA Calculator",
    "DA Arrear Calculator",
    "HRA Calculator",
    "TA Calculator",
    "NDA Calculator",
    "OTA Calculator",
    "KMA Calculator",
    "8th Pay Commission Salary Estimate",
    "8th Pay Commission Arrear Estimate",
    "Duty Roster & Allowance Diary",
    "Employee Profile",
    "Railway Rules",
    "India Map"
  ];

  function addLane(laneName, label, items, directionClass) {
    const lane = document.createElement("div");
    lane.className = "rm-home-highlights__lane " + directionClass;

    const laneLabel = document.createElement("span");
    laneLabel.className = "rm-home-highlights__label";
    laneLabel.textContent = label;

    const viewport = document.createElement("div");
    viewport.className = "rm-home-highlights__viewport";
    viewport.setAttribute("role", "group");
    viewport.setAttribute("aria-label", laneName);

    const track = document.createElement("div");
    track.className = "rm-home-highlights__track";

    for (let copy = 0; copy < 2; copy += 1) {
      const group = document.createElement("div");
      group.className = "rm-home-highlights__group";
      if (copy === 1) group.setAttribute("aria-hidden", "true");

      items.forEach((item) => {
        const chip = document.createElement("a");
        chip.className = "rm-home-highlights__item";
        chip.href = "features/home-highlights/details/index.html?topic=" + encodeURIComponent(
          item.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        );
        chip.textContent = item;
        if (copy === 1) chip.tabIndex = -1;
        group.appendChild(chip);
      });
      track.appendChild(group);
    }

    viewport.appendChild(track);
    lane.append(laneLabel, viewport);
    root.appendChild(lane);
  }



  // Direct links to real feature pages already present in the home dashboard.
  // These two extra lanes are navigation shortcuts; they do not replace any module.
  const upperFeatureItems = [
    ["Salary & Pay", "features/salary/index.html"],
    ["Income Tax", "features/income-tax/index.html"],
    ["Employee Benefits", "employee-benefits-calculators/index.html"],
    ["8th Pay Commission", "features/pay-commission-8th/index.html"],
    ["Allowances", "features/allowances/index.html"],
    ["Arrear Calculator", "features/arrears/index.html"],
    ["Duty Management", "features/duty/index.html"],
    ["Duty Roster & Allowance Diary", "features/duty-diary/index.html"]
  ];

  const lowerFeatureItems = [
    ["Leave Management", "features/leave/index.html"],
    ["NPS & Pension", "features/retirement/index.html"],
    ["Loan & Finance", "features/finance/index.html"],
    ["Railway Rules", "features/rules/index.html"],
    ["Engineering Tools", "features/engineering/index.html"],
    ["Documents & PDF", "features/documents/index.html"],
    ["Railway Updates", "features/updates/index.html"],
    ["Railway Map", "features/map/index.html"],
    ["Data Sources & Compliance", "features/compliance/index.html"],
    ["Employee Profile", "features/profile/index.html"]
  ];

  function createFeatureTicker(label, ariaLabel, items, className, direction) {
    const lane = document.createElement("section");
    lane.className = "rm-home-feature-ticker " + className;
    lane.setAttribute("aria-label", ariaLabel);

    const title = document.createElement("span");
    title.className = "rm-home-feature-ticker__label";
    title.textContent = label;

    const viewport = document.createElement("div");
    viewport.className = "rm-home-feature-ticker__viewport";

    const track = document.createElement("div");
    track.className = "rm-home-feature-ticker__track";
    track.dataset.direction = direction;

    for (let copy = 0; copy < 2; copy += 1) {
      const group = document.createElement("div");
      group.className = "rm-home-feature-ticker__group";
      if (copy === 1) group.setAttribute("aria-hidden", "true");

      items.forEach(([name, href]) => {
        const link = document.createElement("a");
        link.className = "rm-home-feature-ticker__item";
        link.href = href;
        link.textContent = name;
        link.setAttribute("aria-label", "Open " + name);
        if (copy === 1) link.tabIndex = -1;
        group.appendChild(link);
      });
      track.appendChild(group);
    }

    viewport.appendChild(track);
    lane.append(title, viewport);
    return lane;
  }

  const upperFeatureTicker = createFeatureTicker(
    "✦ QUICK ACCESS", "Quick access to Railway Mitra features",
    upperFeatureItems, "rm-home-feature-ticker--upper", "left"
  );
  const lowerFeatureTicker = createFeatureTicker(
    "✦ MORE", "More Railway Mitra features",
    lowerFeatureItems, "rm-home-feature-ticker--lower", "right"
  );

  // A separate single service ticker sits in the open gap above the Welcome panel.
  // It is intentionally independent from the remaining tools highlights.
  const serviceItems = [
    "Leave Rules",
    "Pass & PTO",
    "Medical Benefits",
    "Retirement Benefits",
    "Employee Welfare",
    "HRMS Tips"
  ];

  const serviceLane = document.createElement("section");
  serviceLane.className = "rm-home-service-ticker";
  serviceLane.setAttribute("aria-label", "Employee service guides");

  const serviceLabel = document.createElement("span");
  serviceLabel.className = "rm-home-service-ticker__label";
  serviceLabel.textContent = "✦ SERVICES";

  const serviceViewport = document.createElement("div");
  serviceViewport.className = "rm-home-service-ticker__viewport";

  const serviceTrack = document.createElement("div");
  serviceTrack.className = "rm-home-service-ticker__track";

  for (let copy = 0; copy < 2; copy += 1) {
    const group = document.createElement("div");
    group.className = "rm-home-service-ticker__group";
    if (copy === 1) group.setAttribute("aria-hidden", "true");

    serviceItems.forEach((item) => {
      const topicByLabel = { "Leave Rules": "leave-rules-guide", "Pass & PTO": "pass-pto-guide", "Medical Benefits": "medical-benefits", "Retirement Benefits": "retirement-benefits", "Employee Welfare": "employee-welfare", "HRMS Tips": "hrms-tips" };
      const slug = topicByLabel[item];
      const chip = document.createElement("a");
      chip.className = "rm-home-service-ticker__item";
      chip.href = "features/home-highlights/details/index.html?topic=" + encodeURIComponent(slug);
      chip.textContent = item;
      chip.setAttribute("aria-label", "Open " + item + " guide");
      if (copy === 1) chip.tabIndex = -1;
      group.appendChild(chip);
    });
    serviceTrack.appendChild(group);
  }

  serviceViewport.appendChild(serviceTrack);
  serviceLane.append(serviceLabel, serviceViewport);

  const welcome = root.closest(".welcome-section");
  if (welcome && welcome.parentNode) {
    // Insert the existing SERVICES lane first, then place the new upper lane before it.
    welcome.parentNode.insertBefore(serviceLane, welcome);
    welcome.parentNode.insertBefore(upperFeatureTicker, serviceLane);
  }

  const profileButton = welcome && welcome.querySelector(".profile-btn");
  if (profileButton && profileButton.parentNode) {
    profileButton.parentNode.insertBefore(lowerFeatureTicker, profileButton.nextSibling);
  }

  addLane("Employee tools and calculators", "🛠 TOOLS", toolItems, "rm-home-highlights__lane--tools");
})();
