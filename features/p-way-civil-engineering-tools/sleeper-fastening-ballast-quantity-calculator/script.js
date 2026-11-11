let lang = "hi";

function toggleLang() {
  lang = lang === "hi" ? "en" : "hi";
  applyLang();
}

function applyManualDefaults() {
  const cat = document.getElementById("trackCategory").value;
  const density = document.getElementById("sleeperDensity");
  const cushion = document.getElementById("ballastCushion");

  if (cat === "new_main") {
    density.value = "1660";
    cushion.value = "2.28";
  } else if (cat === "new_yard") {
    density.value = "1540";
    cushion.value = "2.02";
  } else if (cat === "old_main") {
    density.value = "1540";
    cushion.value = "2.02";
  } else {
    density.value = "1310";
    cushion.value = "1.78";
  }

  if (document.getElementById("resultBox").style.display === "block") {
    calculateMaterials();
  }
}

function applyLang() {
  const en = lang === "en";
  const set = (id, hi, english) => {
    document.getElementById(id).textContent = en ? english : hi;
  };

  set("langBtn", "English", "हिंदी");
  set("mainTitle", "🧱 नया और पुराना ट्रैक मटेरियल कैलकुलेटर", "🧱 New & Old Track Material Calculator");
  set("subTitle", "IRPWM मैनुअल के अनुसार New Track और Old Track (Main Line व Yard) की सामग्री निकालें", "Estimate sleepers, fittings and ballast for new and existing track using the selected reference values.");
  set("trackCatLabel", "1. ट्रैक की स्थिति और श्रेणी चुनें (IRPWM Category):", "1. Select Track Condition & Category (reference category):");
  set("optNewMain", "🆕 नया ट्रैक – Main Line (New Line / CTR)", "🆕 New Track – Main Line (New Construction / CTR)");
  set("optNewYard", "🆕 नया ट्रैक – New Yard / Loop Line (25T)", "🆕 New Track – New Yard / Loop Line (25T)");
  set("optOldMain", "🛤️ पुराना ट्रैक – Existing Main / Branch Line", "🛤️ Old Track – Existing Main / Branch Line");
  set("optOldYard", "🏚️ पुराना ट्रैक – Existing Old Yard / Siding", "🏚️ Old Track – Existing Old Yard / Siding");
  set("lenLabel", "2. ट्रैक की लंबाई डालें (Track Length in Meters):", "2. Enter Track Length (in meters):");
  document.getElementById("trackLength").placeholder = en ? "e.g. 1000 (1000 for 1 km)" : "जैसे: 1000 (1 किमी के लिए 1000)";
  set("densityLabel", "3. स्लीपर डेंसिटी (Sleeper Density per km):", "3. Sleeper Density (per km):");
  set("opt1660", "1660 स्लीपर / किमी (Spacing ~60 cm)", "1660 Sleepers / km (Spacing ~60 cm)");
  set("opt1540", "1540 स्लीपर / किमी (Spacing ~65 cm)", "1540 Sleepers / km (Spacing ~65 cm)");
  set("opt1310", "1310 स्लीपर / किमी (Spacing ~76 cm)", "1310 Sleepers / km (Spacing ~76 cm)");
  set("cushionLabel", "4. गिट्टी कुशन की गहराई (Ballast Cushion - संदर्भ मान):", "4. Ballast Cushion Depth (reference value):");
  set("opt350", "350 mm कुशन (New High-Speed Main Line - ~2.52 m³/m)", "350 mm Cushion (New High-Speed Main Line - ~2.52 m³/m)");
  set("opt300", "300 mm कुशन (New Main Line Standard - ~2.28 m³/m)", "300 mm Cushion (New Main Line Standard - ~2.28 m³/m)");
  set("opt250", "250 mm कुशन (New Yard / Old Main - ~2.02 m³/m)", "250 mm Cushion (New Yard / Old Main - ~2.02 m³/m)");
  set("opt200", "200 mm कुशन (Old Branch / Old Yard - ~1.78 m³/m)", "200 mm Cushion (Old Branch / Old Yard - ~1.78 m³/m)");
  set("opt150", "150 mm कुशन (Old Yard / Siding - ~1.52 m³/m)", "150 mm Cushion (Old Yard / Siding - ~1.52 m³/m)");
  set("calcBtn", "सामग्री की गणना करें (Calculate)", "Calculate Track Materials");
  set("resSlpLabel", "कुल आवश्यक PSC स्लीपर (Total Sleepers):", "Total Required PSC Sleepers:");

  document.getElementById("rulesBox").innerHTML = en
    ? "<strong style='color:#38bdf8;'>📘 Track Material Reference Values:</strong><br>" +
      "• <b>New Main Line:</b> 1660 sleepers/km; selected cushion reference 300–350 mm.<br>" +
      "• <b>New Yard / Loop:</b> 1540–1660 sleepers/km; selected cushion reference 250 mm.<br>" +
      "• <b>Existing Main/Branch:</b> 1540 sleepers/km; selected cushion reference 200–250 mm.<br>" +
      "• <b>Old Yard / Siding:</b> 1310–1540 sleepers/km; selected cushion reference 150–200 mm.<br>" +
      "• <b>Per PSC sleeper assumed:</b> 4 ERC clips, 4 liners and 2 GRSP rubber pads.<br><br>" +
      "<b>Important:</b> These are estimating assumptions, not a substitute for approved drawings, current IRPWM provisions, site measurements or competent authority instructions. Verify ballast volume factors for the actual track section."
    : "<strong style='color:#38bdf8;'>📘 ट्रैक सामग्री के संदर्भ मान:</strong><br>" +
      "• <b>नया Main Line:</b> 1660 स्लीपर/किमी; चयनित कुशन संदर्भ 300–350 mm।<br>" +
      "• <b>नया Yard / Loop:</b> 1540–1660 स्लीपर/किमी; चयनित कुशन संदर्भ 250 mm।<br>" +
      "• <b>पुराना Main/Branch:</b> 1540 स्लीपर/किमी; चयनित कुशन संदर्भ 200–250 mm।<br>" +
      "• <b>पुराना Yard / Siding:</b> 1310–1540 स्लीपर/किमी; चयनित कुशन संदर्भ 150–200 mm।<br>" +
      "• <b>प्रति PSC स्लीपर मान लिया गया:</b> 4 ERC क्लिप, 4 लाइनर और 2 GRSP रबर पैड।<br><br>" +
      "<b>महत्वपूर्ण:</b> ये अनुमान हेतु दिए गए संदर्भ मान हैं, प्रमाणित सार्वभौमिक IRPWM मानक नहीं। वास्तविक मात्रा के लिए स्वीकृत ड्रॉइंग, लागू नवीनतम IRPWM, स्थल माप और सक्षम अधिकारी के निर्देश जाँचें। गिट्टी के प्रति मीटर आयतन गुणांक वास्तविक ट्रैक सेक्शन के अनुसार सत्यापित करें।";

  if (document.getElementById("resultBox").style.display === "block") {
    calculateMaterials();
  }
}

function calculateMaterials() {
  const cat = document.getElementById("trackCategory").value;
  const len = Number(document.getElementById("trackLength").value);
  const density = Number(document.getElementById("sleeperDensity").value);
  const ballastRate = Number(document.getElementById("ballastCushion").value);
  const en = lang === "en";

  if (!Number.isFinite(len) || len <= 0) {
    alert(en ? "Please enter a valid track length in meters!" : "कृपया मीटर में ट्रैक की सही लंबाई डालें!");
    return;
  }

  const names = {
    new_main: ["🆕 New Track – Main Line", "🆕 नया ट्रैक – Main Line", "Reference estimate: 1660 sleepers/km; selected ballast factor applies."],
    new_yard: ["🆕 New Track – New Yard / Loop", "🆕 नया ट्रैक – New Yard / Loop", "Reference estimate: 1540–1660 sleepers/km; verify the approved yard layout."],
    old_main: ["🛤️ Old Track – Existing Main/Branch", "🛤️ पुराना ट्रैक – Existing Main/Branch", "Reference estimate: 1540 sleepers/km; verify actual track condition."],
    old_yard: ["🏚️ Old Track – Existing Yard/Siding", "🏚️ पुराना ट्रैक – Existing Old Yard", "Reference estimate: 1310–1540 sleepers/km; verify actual siding layout."]
  };

  const selected = names[cat];
  document.getElementById("categoryBanner").textContent = en ? selected[0] : selected[1];
  document.getElementById("manualStandardNote").textContent = en ? selected[2] : "अनुमानित संदर्भ मान; वास्तविक सेक्शन और स्वीकृत ड्रॉइंग से मिलान करें।";

  const sleepers = Math.ceil((len / 1000) * density);
  const erc = sleepers * 4;
  const liners = sleepers * 4;
  const pads = sleepers * 2;
  const ballast = len * ballastRate;
  const spacing = 100000 / density;

  document.getElementById("sleeperOutput").textContent = en
    ? sleepers.toLocaleString() + " Nos."
    : sleepers.toLocaleString() + " नग (Nos.)";

  const cards = en
    ? [
        ["ERC (Pandrol Clips)", erc.toLocaleString() + " Nos."],
        ["GFN / Metal Liners", liners.toLocaleString() + " Nos."],
        ["Rubber Pads (GRSP)", pads.toLocaleString() + " Nos."],
        ["Approx. Sleeper Spacing", "~" + spacing.toFixed(1) + " cm"]
      ]
    : [
        ["ERC (पैंड्रोल क्लिप)", erc.toLocaleString() + " नग"],
        ["GFN / मेटल लाइनर", liners.toLocaleString() + " नग"],
        ["रबर पैड (GRSP)", pads.toLocaleString() + " नग"],
        ["अनुमानित स्लीपर दूरी", "~" + spacing.toFixed(1) + " cm"]
      ];

  document.getElementById("fittingsGrid").innerHTML = cards.map(function(item) {
    return "<div class='item-card'><div class='item-title'>" + item[0] +
      "</div><div class='item-val'>" + item[1] + "</div></div>";
  }).join("");

  document.getElementById("ballastOutput").innerHTML = en
    ? "🪨 Estimated Ballast Required: <b>" + ballast.toFixed(2) + " m³</b> (Cubic Meters)"
    : "🪨 अनुमानित गिट्टी (Ballast): <b>" + ballast.toFixed(2) + " घन मीटर (m³)</b>";

  document.getElementById("resultBox").style.display = "block";
}

window.onload = function() {
  applyManualDefaults();
  applyLang();
};