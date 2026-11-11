var currentLang = 'hi';

function initLwrTool() {
  var langBtn = document.getElementById("langBtn");
  var tempZone = document.getElementById("tempZone");
  var calcBtn = document.getElementById("calcBtn");

  if (langBtn) langBtn.onclick = switchLanguage;
  if (tempZone) tempZone.onchange = updateZoneBox;
  if (calcBtn) calcBtn.onclick = runLwrCalculation;
}

function switchLanguage() {
  currentLang = (currentLang === 'hi') ? 'en' : 'hi';
  var isEn = (currentLang === 'en');

  document.getElementById("langBtn").innerText = isEn ? "हिंदी" : "English";
  document.getElementById("mainTitle").innerText = isEn ? "🌡️ Zone-Wise LWR Temp & Patrolling" : "🌡️ जोन-वाइज LWR तापमान और पेट्रोलिंग";
  document.getElementById("subTitle").innerText = isEn ? "Check exact Hot or Cold Weather Patrolling requirement as per Zone I–IV" : "IRPWM के 4 तापमान जोन (Zone I–IV) के अनुसार td और पेट्रोलिंग की स्थिति जांचें";
  document.getElementById("zoneLabel").innerText = isEn ? "1. Select Rail Temperature Zone:" : "1. रेलवे तापमान जोन चुनें (Temperature Zone):";
  document.getElementById("optZ1").innerText = isEn ? "Zone I (Annual Range: 40°C – 50°C | Coastal)" : "Zone I (वार्षिक अंतर: 40°C – 50°C | तटीय क्षेत्र)";
  document.getElementById("optZ2").innerText = isEn ? "Zone II (Annual Range: 51°C – 60°C | South/Central)" : "Zone II (वार्षिक अंतर: 51°C – 60°C | दक्षिण/मध्य)";
  document.getElementById("optZ3").innerText = isEn ? "Zone III (Annual Range: 61°C – 70°C | North/West)" : "Zone III (वार्षिक अंतर: 61°C – 70°C | उत्तर/पश्चिम)";
  document.getElementById("optZ4").innerText = isEn ? "Zone IV (Annual Range: 71°C – 76°C | Extreme Temp)" : "Zone IV (वार्षिक अंतर: 71°C – 76°C | अत्यधिक ठंड/गर्मी)";
  document.getElementById("tmLabel").innerText = isEn ? "2. Mean Rail Temperature (tm in °C):" : "2. क्षेत्र का मीन रेल तापमान (Mean Rail Temp - tm °C):";
  document.getElementById("tdLabel").innerText = isEn ? "3. Destressing Temperature (td in °C):" : "3. डिस्ट्रेसिंग तापमान (Destressing Temp - td °C):";
  document.getElementById("currLabel").innerText = isEn ? "4. Current Rail Temperature (in °C):" : "4. मौजूदा रेल तापमान (Current Rail Temp °C):";
  document.getElementById("calcBtn").innerText = isEn ? "Check Patrolling Status" : "पेट्रोलिंग स्थिति जांचें (Check Status)";
  document.getElementById("resDiffLabel").innerText = isEn ? "Temp Variation from td (ΔT):" : "डिस्ट्रेसिंग तापमान से अंतर (ΔT):";

  document.getElementById("disclaimerBox").innerHTML = isEn ?
    '<b>Important:</b> This calculator provides preliminary reference indications based on entered inputs and IRPWM thresholds. Always refer to the latest applicable IRPWM, Railway Board/Zonal instructions, and competent authority orders before operational implementation.' :
    '<b>महत्वपूर्ण:</b> यह कैलकुलेटर दिए गए इनपुट और इसमें शामिल संदर्भ सीमाओं के आधार पर प्रारंभिक संकेत देता है। पेट्रोलिंग, वॉचमैन और गति प्रतिबंध के वास्तविक निर्णय के लिए लागू नवीनतम IRPWM, रेलवे बोर्ड/जोनल निर्देश तथा सक्षम अधिकारी के आदेश देखें। इसे परिचालन अनुमति न मानें।';

  updateZoneBox();
  if (document.getElementById("resultBox").style.display === "block") {
    runLwrCalculation();
  }
}

function updateZoneBox() {
  var zone = document.getElementById("tempZone").value;
  var isEn = (currentLang === 'en');
  var tdRange = (zone === "4") ? "tm + 5°C to tm + 10°C" : "tm to tm + 5°C";
  var tdRangeHi = (zone === "4") ? "tm + 5°C से tm + 10°C" : "tm से tm + 5°C";

  document.getElementById("zoneRulesBox").innerHTML = isEn ?
    '<strong style="color:#38bdf8;">📘 Zone ' + zone + ' – Reference Values in Calculator:</strong><br>' +
    '• <b>Permissible td Range:</b> ' + tdRange + '<br>' +
    '• <b>Hot Weather Patrolling:</b> Above <b>td + 20°C</b><br>' +
    '• <b>Watchman / Speed Restriction:</b> Above <b>td + 25°C</b><br>' +
    '• <b>Cold Weather Patrolling:</b> Below <b>td - 30°C</b>' :
    '<strong style="color:#38bdf8;">📘 Zone ' + zone + ' – कैलकुलेटर में दिए गए संदर्भ मान:</strong><br>' +
    '• <b>अनुमेय td सीमा:</b> ' + tdRangeHi + '<br>' +
    '• <b>गर्मी की पेट्रोलिंग (Hot Patrolling):</b> <b>td + 20°C</b> से ऊपर<br>' +
    '• <b>वॉचमैन / गति प्रतिबंध:</b> <b>td + 25°C</b> से ऊपर<br>' +
    '• <b>सर्दी की पेट्रोलिंग (Cold Patrolling):</b> <b>td - 30°C</b> से नीचे';
}

function runLwrCalculation() {
  var zone = document.getElementById("tempZone").value;
  var tm = parseFloat(document.getElementById("tmTemp").value);
  var td = parseFloat(document.getElementById("tdTemp").value);
  var curr = parseFloat(document.getElementById("currTemp").value);
  var isEn = (currentLang === 'en');

  if (isNaN(tm) || isNaN(td) || isNaN(curr)) {
    alert(isEn ? "Please enter tm, td, and Current Temperature!" : "कृपया tm, td और मौजूदा तापमान सही डालें!");
    return;
  }

  var minTd = (zone === "4") ? (tm + 5) : tm;
  var maxTd = (zone === "4") ? (tm + 10) : (tm + 5);
  var hotStart = td + 20;
  var extremeHot = td + 25;
  var coldStart = td - 30;
  var diff = curr - td;
  var sign = diff > 0 ? "+" : "";

  var banner = document.getElementById("patrollingActionBanner");
  if (curr > extremeHot) {
    banner.className = "action-banner ban-danger";
    banner.innerHTML = isEn ?
      '🚨 ACTION: START HOT WEATHER PATROLLING + WATCHMAN<br><span style="font-weight:normal;font-size:13px;">Temp (' + curr + '°C) > td + 25°C (' + extremeHot + '°C). Deploy Hot Weather Patrolling, Stationary Watchman & Speed Restriction!</span>' :
      '🚨 निर्णय: अभी HOT WEATHER PATROLLING + वॉचमैन लगाएं!<br><span style="font-weight:normal;font-size:13px;">तापमान (' + curr + '°C), td + 25°C (' + extremeHot + '°C) से अधिक है। गर्मी की पेट्रोलिंग, वॉचमैन और गति प्रतिबंध (SR) लगा दें।</span>';
  } else if (curr > hotStart) {
    banner.className = "action-banner ban-hot";
    banner.innerHTML = isEn ?
      '☀️ ACTION: START HOT WEATHER PATROLLING<br><span style="font-weight:normal;font-size:13px;">Temp (' + curr + '°C) > td + 20°C (' + hotStart + '°C). Deploy Hot Weather Patrolling immediately.</span>' :
      '☀️ निर्णय: अभी HOT WEATHER PATROLLING लगा देनी चाहिए!<br><span style="font-weight:normal;font-size:13px;">तापमान (' + curr + '°C), td + 20°C (' + hotStart + '°C) से ऊपर है। गर्मी की पेट्रोलिंग शुरू करें।</span>';
  } else if (curr < coldStart) {
    banner.className = "action-banner ban-cold";
    banner.innerHTML = isEn ?
      '❄️ ACTION: START COLD WEATHER PATROLLING<br><span style="font-weight:normal;font-size:13px;">Temp (' + curr + '°C) < td - 30°C (' + coldStart + '°C). Deploy Cold Weather Patrolling immediately.</span>' :
      '❄️ निर्णय: अभी COLD WEATHER PATROLLING लगा देनी चाहिए!<br><span style="font-weight:normal;font-size:13px;">तापमान (' + curr + '°C), td - 30°C (' + coldStart + '°C) से कम है। सर्दी की पेट्रोलिंग शुरू करें।</span>';
  } else {
    banner.className = "action-banner ban-safe";
    banner.innerHTML = isEn ?
      '✅ RESULT: NO PATROLLING REQUIRED RIGHT NOW<br><span style="font-weight:normal;font-size:13px;">Temp (' + curr + '°C) is within safe range (' + coldStart + '°C to ' + hotStart + '°C). Neither Hot nor Cold patrolling is needed.</span>' :
      '✅ निर्णय: अभी कोई भी पेट्रोलिंग नहीं लगानी है!<br><span style="font-weight:normal;font-size:13px;">तापमान (' + curr + '°C) सुरक्षित सीमा (' + coldStart + '°C से ' + hotStart + '°C) के बीच है। अभी Hot या Cold पेट्रोलिंग की जरूरत नहीं है।</span>';
  }

  var tdBox = document.getElementById("tdStatusText");
  if (td >= minTd && td <= maxTd) {
    tdBox.style.borderLeftColor = "#10b981";
    tdBox.innerHTML = isEn ?
      '✅ <b>td Check (Zone ' + zone + '):</b> ' + td + '°C is within permissible limit (' + minTd + '°C – ' + maxTd + '°C).' :
      '✅ <b>td जांच (Zone ' + zone + '):</b> दिया गया td (' + td + '°C) अनुमेय सीमा (' + minTd + '°C – ' + maxTd + '°C) के अंदर है।';
  } else {
    tdBox.style.borderLeftColor = "#f87171";
    tdBox.innerHTML = isEn ?
      '⚠️ <b>td Warning (Zone ' + zone + '):</b> ' + td + '°C is outside permissible range (<b>' + minTd + '°C – ' + maxTd + '°C</b>).' :
      '⚠️ <b>td चेतावनी (Zone ' + zone + '):</b> दिया गया td (' + td + '°C) इस जोन की अनुमेय सीमा (<b>' + minTd + '°C – ' + maxTd + '°C</b>) से बाहर है।';
  }

  document.getElementById("diffOutput").innerText = sign + diff.toFixed(1) + " °C";
  document.getElementById("limitDetails").innerHTML = isEn ?
    '• Hot Patrolling Above: <b>' + hotStart.toFixed(1) + '°C</b> (td + 20°C)<br>' +
    '• Watchman / SR Above: <b>' + extremeHot.toFixed(1) + '°C</b> (td + 25°C)<br>' +
    '• Cold Patrolling Below: <b>' + coldStart.toFixed(1) + '°C</b> (td - 30°C)' :
    '• गर्मी की पेट्रोलिंग शुरू: <b>' + hotStart.toFixed(1) + '°C</b> (td + 20°C) से ऊपर<br>' +
    '• वॉचमैन / स्पीड रिस्ट्रिक्शन: <b>' + extremeHot.toFixed(1) + '°C</b> (td + 25°C) से ऊपर<br>' +
    '• सर्दी की पेट्रोलिंग शुरू: <b>' + coldStart.toFixed(1) + '°C</b> (td - 30°C) से नीचे';

  document.getElementById("resultBox").style.display = "block";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLwrTool);
} else {
  initLwrTool();
}