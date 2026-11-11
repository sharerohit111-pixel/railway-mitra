document.addEventListener("DOMContentLoaded", function() {
  var lang = 'hi';

  var langBtn = document.getElementById("langBtn");
  var trackCategory = document.getElementById("trackCategory");
  var calcBtn = document.getElementById("calcBtn");

  if (langBtn) {
    langBtn.addEventListener("click", function() {
      lang = (lang === 'hi') ? 'en' : 'hi';
      applyLang();
    });
  }

  if (trackCategory) {
    trackCategory.addEventListener("change", function() {
      var cat = this.value;
      var densitySelect = document.getElementById("sleeperDensity");
      var cushionSelect = document.getElementById("ballastCushion");

      if (cat === "new_main") {
        densitySelect.value = "1660";
        cushionSelect.value = "2.28";
      } else if (cat === "new_yard") {
        densitySelect.value = "1540";
        cushionSelect.value = "2.02";
      } else if (cat === "old_main") {
        densitySelect.value = "1540";
        cushionSelect.value = "2.02";
      } else if (cat === "old_yard") {
        densitySelect.value = "1310";
        cushionSelect.value = "1.78";
      }
    });
  }

  if (calcBtn) {
    calcBtn.addEventListener("click", function() {
      calculateMaterials();
    });
  }

  function applyLang() {
    var isEn = (lang === 'en');
    document.getElementById("langBtn").innerText = isEn ? "हिंदी" : "English";
    document.getElementById("mainTitle").innerText = isEn ? "🧱 New & Old Track Material Calculator" : "🧱 नया और पुराना ट्रैक मटेरियल कैलकुलेटर";
    document.getElementById("subTitle").innerText = isEn ? "Estimate Sleepers, Fittings & Ballast for New & Old Tracks as per IRPWM" : "IRPWM मैनुअल के अनुसार New Track और Old Track (Main Line व Yard) की सामग्री निकालें";

    document.getElementById("trackCatLabel").innerText = isEn ? "1. Select Track Condition & Category (IRPWM):" : "1. ट्रैक की स्थिति और श्रेणी चुनें (IRPWM Category):";
    document.getElementById("optNewMain").innerText = isEn ? "🆕 New Track – Main Line (New Construction / CTR)" : "🆕 नया ट्रैक – Main Line (New Line / CTR)";
    document.getElementById("optNewYard").innerText = isEn ? "🆕 New Track – New Yard / Loop Line (25T)" : "🆕 नया ट्रैक – New Yard / Loop Line (25T)";
    document.getElementById("optOldMain").innerText = isEn ? "🛤️ Old Track – Existing Main / Branch Line" : "🛤️ पुराना ट्रैक – Existing Main / Branch Line";
    document.getElementById("optOldYard").innerText = isEn ? "🏚️ Old Track – Existing Old Yard / Siding" : "🏚️ पुराना ट्रैक – Existing Old Yard / Siding";

    document.getElementById("lenLabel").innerText = isEn ? "2. Enter Track Length (in Meters):" : "2. ट्रैक की लंबाई डालें (Track Length in Meters):";
    document.getElementById("trackLength").placeholder = isEn ? "e.g. 1000 (1000 for 1 km)" : "जैसे: 1000 (1 किमी के लिए 1000)";

    document.getElementById("densityLabel").innerText = isEn ? "3. Sleeper Density (per km):" : "3. स्लीपर डेंसिटी (Sleeper Density per km):";
    document.getElementById("opt1660").innerText = isEn ? "1660 Sleepers / km (Spacing ~60 cm)" : "1660 स्लीपर / किमी (Spacing ~60 cm)";
    document.getElementById("opt1540").innerText = isEn ? "1540 Sleepers / km (Spacing ~65 cm)" : "1540 स्लीपर / किमी (Spacing ~65 cm)";
    document.getElementById("opt1310").innerText = isEn ? "1310 Sleepers / km (Spacing ~76 cm)" : "1310 स्लीपर / किमी (Spacing ~76 cm)";

    document.getElementById("cushionLabel").innerText = isEn ? "4. Ballast Cushion Depth (IRPWM):" : "4. गिट्टी कुशन की गहराई (Ballast Cushion - IRPWM):";
    document.getElementById("opt350").innerText = isEn ? "350 mm Cushion (New High-Speed Main - ~2.52 m³/m)" : "350 mm कुशन (New High-Speed Main Line - ~2.52 m³/m)";
    document.getElementById("opt300").innerText = isEn ? "300 mm Cushion (New Main Line Std - ~2.28 m³/m)" : "300 mm कुशन (New Main Line Standard - ~2.28 m³/m)";
    document.getElementById("opt250").innerText = isEn ? "250 mm Cushion (New Yard / Old Main - ~2.02 m³/m)" : "250 mm कुशन (New Yard / Old Main - ~2.02 m³/m)";
    document.getElementById("opt200").innerText = isEn ? "200 mm Cushion (Old Branch / Old Yard - ~1.78 m³/m)" : "200 mm कुशन (Old Branch / Old Yard - ~1.78 m³/m)";
    document.getElementById("opt150").innerText = isEn ? "150 mm Cushion (Old Yard / Siding - ~1.52 m³/m)" : "150 mm कुशन (Old Yard / Siding - ~1.52 m³/m)";

    document.getElementById("calcBtn").innerText = isEn ? "Calculate Track Materials" : "सामग्री की गणना करें (Calculate)";
    document.getElementById("resSlpLabel").innerText = isEn ? "Total Required Sleepers:" : "कुल आवश्यक PSC स्लीपर (Total Sleepers):";

    document.getElementById("rulesBox").innerHTML = isEn ?
      '<strong style="color:#38bdf8;">📘 IRPWM New Track vs Old Track Standards:</strong><br>' +
      '• <b>New Track (Main Line):</b> 60kg Rail, 1660 PSC sleepers/km, <b>300–350 mm</b> ballast cushion.<br>' +
      '• <b>New Yard / Loop:</b> 1540–1660 PSC sleepers/km, <b>250 mm</b> ballast cushion (25T axle load).<br>' +
      '• <b>Old Track (Existing Main/Branch):</b> 1540 sleepers/km, <b>200–250 mm</b> cushion.<br>' +
      '• <b>Old Yard / Siding:</b> 1310–1540 sleepers/km, <b>150–200 mm</b> cushion.<br>' +
      '• <b>Fittings per PSC Sleeper:</b> 4 ERC Clips, 4 Liners, and 2 Rubber Pads (GRSP).' :
      '<strong style="color:#38bdf8;">📘 IRPWM नया ट्रैक बनाम पुराना ट्रैक मानक:</strong><br>' +
      '• <b>नया ट्रैक (New Main Line):</b> 60kg रेल, 1660 PSC स्लीपर/किमी, <b>300–350 mm</b> गिट्टी कुशन।<br>' +
      '• <b>नया यार्ड / लूप (New Yard):</b> 1540–1660 PSC स्लीपर/किमी, <b>250 mm</b> कुशन (25T एक्सल लोड)।<br>' +
      '• <b>पुराना ट्रैक (Old Main/Branch):</b> 1540 स्लीपर/किमी, <b>200–250 mm</b> गिट्टी कुशन।<br>' +
      '• <b>पुराना यार्ड / साइडिंग (Old Yard):</b> 1310–1540 PSC स्लीपर/किमी, <b>150–200 mm</b> गिट्टी कुशन।<br>' +
      '• <b>प्रति PSC स्लीपर फिटिंग्स:</b> 4 ERC क्लिप, 4 लाइनर और 2 रबर पैड (GRSP)।';

    if (document.getElementById("resultBox").style.display === "block") {
      calculateMaterials();
    }
  }

  function calculateMaterials() {
    var cat = document.getElementById("trackCategory").value;
    var len = parseFloat(document.getElementById("trackLength").value);
    var density = parseFloat(document.getElementById("sleeperDensity").value);
    var ballastRate = parseFloat(document.getElementById("ballastCushion").value);
    var isEn = (lang === 'en');

    if (!len || len <= 0) {
      alert(isEn ? "Please enter a valid track length in meters!" : "कृपया मीटर में ट्रैक की सही लंबाई डालें!");
      return;
    }

    var catName = "";
    var manualNote = "";

    if (cat === "new_main") {
      catName = isEn ? "🆕 New Track – Main Line" : "🆕 नया ट्रैक – Main Line";
      manualNote = isEn ? "IRPWM Standard: 60kg Rail, 1660 Sleepers/km, Min 300mm (350mm for 160 km/h) cushion." : "IRPWM मानक: 60kg रेल, 1660 स्लीपर/किमी, न्यूनतम 300mm (160 km/h हेतु 350mm) कुशन।";
    } else if (cat === "new_yard") {
      catName = isEn ? "🆕 New Track – New Yard / Loop" : "🆕 नया ट्रैक – New Yard / Loop";
      manualNote = isEn ? "IRPWM Standard: 1540–1660 PSC Sleepers/km, Min 250mm ballast cushion." : "IRPWM मानक: 1540–1660 PSC स्लीपर/किमी, न्यूनतम 250mm गिट्टी कुशन।";
    } else if (cat === "old_main") {
      catName = isEn ? "🛤️ Old Track – Existing Main/Branch" : "🛤️ पुराना ट्रैक – Existing Main/Branch";
      manualNote = isEn ? "IRPWM Existing Track: 1540 Sleepers/km, 200–250mm ballast cushion." : "IRPWM पुराना ट्रैक मानक: 1540 स्लीपर/किमी, 200–250mm गिट्टी कुशन।";
    } else {
      catName = isEn ? "🏚️ Old Track – Existing Yard/Siding" : "🏚️ पुराना ट्रैक – Existing Old Yard";
      manualNote = isEn ? "IRPWM Old Yard/Siding: 1310–1540 Sleepers/km, 150–200mm ballast cushion." : "IRPWM पुराना यार्ड मानक: 1310–1540 स्लीपर/किमी, 150–200mm गिट्टी कुशन।";
    }

    document.getElementById("categoryBanner").innerText = catName;
    document.getElementById("manualStandardNote").innerText = manualNote;

    var totalSleepers = Math.ceil((len / 1000) * density);
    var totalERC = totalSleepers * 4;
    var totalLiners = totalSleepers * 4;
    var totalPads = totalSleepers * 2;
    var totalBallast = len * ballastRate;

    document.getElementById("sleeperOutput").innerText = isEn ? (totalSleepers.toLocaleString() + " Nos.") : (totalSleepers.toLocaleString() + " नग (Nos.)");

    document.getElementById("fittingsGrid").innerHTML = isEn ?
      '<div class="item-card"><div class="item-title">ERC (Pandrol Clips)</div><div class="item-val">' + totalERC.toLocaleString() + ' Nos.</div></div>' +
      '<div class="item-card"><div class="item-title">GFN / Metal Liners</div><div class="item-val">' + totalLiners.toLocaleString() + ' Nos.</div></div>' +
      '<div class="item-card"><div class="item-title">Rubber Pads (GRSP)</div><div class="item-val">' + totalPads.toLocaleString() + ' Nos.</div></div>' +
      '<div class="item-card"><div class="item-title">Sleeper Spacing</div><div class="item-val">~' + (100000 / density).toFixed(1) + ' cm</div></div>' :
      '<div class="item-card"><div class="item-title">ERC (पैंड्रोल क्लिप)</div><div class="item-val">' + totalERC.toLocaleString() + ' नग</div></div>' +
      '<div class="item-card"><div class="item-title">GFN / मेटल लाइनर</div><div class="item-val">' + totalLiners.toLocaleString() + ' नग</div></div>' +
      '<div class="item-card"><div class="item-title">रबर पैड (GRSP)</div><div class="item-val">' + totalPads.toLocaleString() + ' नग</div></div>' +
      '<div class="item-card"><div class="item-title">स्लीपर के बीच दूरी</div><div class="item-val">~' + (100000 / density).toFixed(1) + ' cm</div></div>';

    document.getElementById("ballastOutput").innerHTML = isEn ?
      '🪨 Estimated Ballast Required: <b>' + totalBallast.toFixed(2) + ' m³</b> (Cubic Meters)' :
      '🪨 अनुमानित गिट्टी (Ballast): <b>' + totalBallast.toFixed(2) + ' घन मीटर (m³)</b>';

    document.getElementById("resultBox").style.display = "block";
  }
});