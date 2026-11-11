/* Railway Mitra Home Highlights — isolated data/render module. */
(() => {
  "use strict";

  const root = document.querySelector("[data-rm-home-highlights]");
  if (!root) return;

  // Only list destinations/categories verified in the current app's exam module.
  const examItems = [
    "LDCE JE P-Way",
    "LDCE JE Works",
    "LDCE JE Other Departments",
    "LDCE JE Civil Engineering",
    "LDCE JE Electrical Engineering",
    "LDCE JE Mechanical Engineering",
    "LDCE Other Departmental Posts",
    "GDCE JE Civil",
    "GDCE JE Electrical",
    "GDCE JE Mechanical",
    "GDCE Train Manager",
    "Mock Tests",
    "Previous Year Papers",
    "Practice Sets"
  ];

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


  // A separate single service ticker sits in the open gap above the Welcome panel.
  // It is intentionally independent: the existing EXAMS and TOOLS lanes stay unchanged.
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
      const slug = item.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
    welcome.parentNode.insertBefore(serviceLane, welcome);
  }

  addLane("Departmental exam features", "🎓 EXAMS", examItems, "rm-home-highlights__lane--exams");
  addLane("Employee tools and calculators", "🛠 TOOLS", toolItems, "rm-home-highlights__lane--tools");
})();
