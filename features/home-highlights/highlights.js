/* Railway Mitra Home Highlights — isolated data/render module. */
(() => {
  "use strict";

  const root = document.querySelector("[data-rm-home-highlights]");
  if (!root) return;

  // Only list destinations/categories verified in the current app's exam module.
  const examItems = [
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
        const chip = document.createElement("span");
        chip.className = "rm-home-highlights__item";
        chip.textContent = item;
        group.appendChild(chip);
      });
      track.appendChild(group);
    }

    viewport.appendChild(track);
    lane.append(laneLabel, viewport);
    root.appendChild(lane);
  }

  addLane("Departmental exam features", "🎓 EXAMS", examItems, "rm-home-highlights__lane--exams");
  addLane("Employee tools and calculators", "🛠 TOOLS", toolItems, "rm-home-highlights__lane--tools");
})();
