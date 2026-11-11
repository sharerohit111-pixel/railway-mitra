let lang = 'hi';

function toggleLang() {
  lang = (lang === 'hi') ? 'en' : 'hi';
  applyLang();
}

function applyLang() {
  const isEn = (lang === 'en');
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
  document.getElementById("resDiffLabel").innerText = isEn ? "Temp Variation from td (ΔT = Curr - td):" : "डिस्ट्रेसिंग तापमान से अंतर (ΔT = Curr - td):";

  document.getElementById("disclaimerBox").innerHTML = isEn ?
    \`<b>Important:</b> This calculator provides preliminary reference indications based on entered inputs and IRPWM thresholds. Always refer to the latest applicable IRPWM, Railway Board/Zonal instructions, and competent authority orders before operational implementation.\` :
    \`<b>महत्वपूर्ण:</b> यह कैलकुलेटर दिए गए इनपुट और इसमें शामिल संदर्भ सीमाओं के आधार पर प्रारंभिक संकेत देता है। पेट्रोलिंग, वॉचमैन और गति प्रतिबंध के वास्तविक निर्णय के लिए लागू नवीनतम IRPWM, रेलवे बोर्ड/जोनल निर्देश तथा सक्षम अधिकारी के आदेश देखें। इसे परिचालन अनुमति न मानें।\`;

  updateZoneInfo();
  if (document.getElementById("resultBox").style.display === "block") calculateZoneLWR();
}

function updateZoneInfo() {
  const zone = document.getElementById("tempZone").value;
  const isEn = (lang === 'en');
  let ruleText = "";
  if (zone === "1" || zone === "2" || zone === "3") {
    ruleText = isEn ?
      \`<strong style="color:#38bdf8;">📘 Zone \${zone} – Reference Values in Calculator:</strong><br>• <b>Permissible td Range:</b> tm to tm + 5°C<br>• <b>Hot Weather Patrolling:</b> Above <b>td + 20°C</b><br>• <b>Watchman / Speed Restriction:</b> Above <b>td + 25°C</b><br>• <b>Cold Weather Patrolling:</b> Below <b>td - 30°C</b>\` :
      \`<strong style="color:#38bdf8;">📘 Zone \${zone} – कैलकुलेटर में दिए गए संदर्भ मान:</strong><br>• <b>अनुमेय td सीमा:</b> tm से tm + 5°C<br>• <b>गर्मी की पेट्रोलिंग (Hot Patrolling):</b> <b>td + 20°C</b> से ऊपर<br>• <b>वॉचमैन / गति प्रतिबंध:</b> <b>td + 25°C</b> से ऊपर<br>• <b>सर्दी की पेट्रोलिंग (Cold Patrolling):</b> <b>td - 30°C</b> से नीचे\`;
  } else {
    ruleText = isEn ?
      \`<strong style="color:#38bdf8;">📘 Zone 4 – Reference Values in Calculator:</strong><br>• <b>Permissible td Range:</b> tm + 5°C to tm + 10°C<br>• <b>Hot Weather Patrolling:</b> Above <b>td + 20°C</b><br>• <b>Watchman / Speed Restriction:</b> Above <b>td + 25°C</b><br>• <b>Cold Weather Patrolling:</b> Below <b>td - 30°C</b>\` :
      \`<strong style="color:#38bdf8;">📘 Zone 4 – कैलकुलेटर में दिए गए संदर्भ मान:</strong><br>• <b>अनुमेय td सीमा:</b> tm + 5°C से tm + 10°C<br>• <b>गर्मी की पेट्रोलिंग (Hot Patrolling):</b> <b>td + 20°C</b> से ऊपर<br>• <b>वॉचमैन / गति प्रतिबंध:</b> <b>td + 25°C</b> से ऊपर<br>• <b>सर्दी की पेट्रोलिंग (Cold Patrolling):</b> <b>td - 30°C</b> से नीचे\`;
  }
  document.getElementById("zoneRulesBox").innerHTML = ruleText;
}

function calculateZoneLWR() {
  const zone = document.getElementById("tempZone").value;
  const tm = parseFloat(document.getElementById("tmTemp").value);
  const td = parseFloat(document.getElementById("tdTemp").value);
  const curr = parseFloat(document.getElementById("currTemp").value);
  const isEn = (lang === 'en');
  if (isNaN(tm) || isNaN(td) || isNaN(curr)) {
    alert(isEn ? "Please enter tm, td, and Current Temperature!" : "कृपया tm, td और मौजूदा तापमान सही डालें!");
    return;
  }

  const minTd = (zone === "4") ? (tm + 5) : tm;
  const maxTd = (zone === "4") ? (tm + 10) : (tm + 5);
  let tdStatusHTML = "";
  if (td >= minTd && td <= maxTd) {
    tdStatusHTML = isEn ?
      \`<div class="td-check">✅ <b>Valid td for Zone \${zone}:</b> \${td}°C is within allowed range (\${minTd}°C – \${maxTd}°C).</div>\` :
      \`<div class="td-check">✅ <b>Zone \${zone} की संदर्भ सीमा के भीतर:</b> \${td}°C सही रेंज (\${minTd}°C – \${maxTd}°C) में है।</div>\`;
  } else {
    tdStatusHTML = isEn ?
      \`<div class="td-check" style="border-left-color:#f87171;">⚠️ <b>Zone \${zone} td Out of Reference Range:</b> Allowed range is <b>\${minTd}°C – \${maxTd}°C</b>.</div>\` :
      \`<div class="td-check" style="border-left-color:#f87171;">⚠️ <b>Zone \${zone} की दी गई संदर्भ सीमा से बाहर।</b> सीमा: <b>\${minTd}°C – \${maxTd}°C</b>।</div>\`;
  }
  document.getElementById("tdValidationBox").innerHTML = tdStatusHTML;

  const diff = curr - td;
  const sign = diff > 0 ? "+" : "";
  document.getElementById("diffOutput").innerText = \`\${sign}\${diff.toFixed(1)} °C\`;
  const hotStart = td + 20;
  const extremeHot = td + 25;
  const coldStart = td - 30;
  const decisionBox = document.getElementById("patrollingDecisionBox");

  if (curr > extremeHot) {
    decisionBox.className = "decision-box dec-danger";
    decisionBox.innerHTML = isEn ?
      \`🚨 CRITICAL HEAT (> td + 25°C):<br>Deploy <b>Hot Weather Patrolling + Stationary Watchman</b> immediately and impose Speed Restriction (SR) on vulnerable locations!\` :
      \`🚨 अत्यधिक गर्मी (> td + 25°C):<br>अभी <b>Hot Weather Patrolling</b> के साथ संवेदनशील जगहों पर <b>वॉचमैन (Watchman) और गति प्रतिबंध (SR)</b> लगा देना चाहिए!\`;
  } else if (curr > hotStart) {
    decisionBox.className = "decision-box dec-hot";
    decisionBox.innerHTML = isEn ?
      \`☀️ HOT WEATHER PATROLLING REQUIRED (> td + 20°C):<br>Start <b>Hot Weather Patrolling</b> immediately.\` :
      \`☀️ तापमान td + 20°C से अधिक है:<br>अभी <b>Hot Weather Patrolling (गर्मी की पेट्रोलिंग)</b> लगा देनी चाहिए।\`;
  } else if (curr < coldStart) {
    decisionBox.className = "decision-box dec-cold";
    decisionBox.innerHTML = isEn ?
      \`❄️ COLD WEATHER PATROLLING REQUIRED (< td - 30°C):<br>Start <b>Cold Weather Patrolling</b> immediately to watch for rail fractures.\` :
      \`❄️ तापमान td - 30°C से कम है:<br>अभी <b>Cold Weather Patrolling (सर्दी की पेट्रोलिंग)</b> लगा देनी चाहिए (रेल फ्रैक्चर की निगरानी करें)।\`;
  } else {
    decisionBox.className = "decision-box dec-safe";
    decisionBox.innerHTML = isEn ?
      \`✅ NORMAL TEMPERATURE RANGE:<br><b>No Hot or Cold Weather Patrolling</b> is required right now.\` :
      \`✅ सामान्य तापमान सीमा (td - 30°C से td + 20°C के बीच):<br>अभी <b>न तो Hot Weather और न ही Cold Weather Patrolling</b> लगाने की आवश्यकता है।\`;
  }

  document.getElementById("limitDetails").innerHTML = isEn ?
    \`• Zone \${zone} Reference td Range: <b>\${minTd.toFixed(1)}°C to \${maxTd.toFixed(1)}°C</b><br>• Hot Patrolling Threshold: <b>\${hotStart.toFixed(1)}°C</b> (td + 20°C)<br>• Extreme Heat / Watchman Limit: <b>\${extremeHot.toFixed(1)}°C</b> (td + 25°C)<br>• Cold Patrolling Threshold: <b>\${coldStart.toFixed(1)}°C</b> (td - 30°C)\` :
    \`• Zone \${zone} की संदर्भ td सीमा: <b>\${minTd.toFixed(1)}°C से \${maxTd.toFixed(1)}°C</b><br>• गर्मी की पेट्रोलिंग (Hot Patrolling) सीमा: <b>\${hotStart.toFixed(1)}°C</b> (td + 20°C)<br>• अत्यधिक गर्मी / वॉचमैन सीमा: <b>\${extremeHot.toFixed(1)}°C</b> (td + 25°C)<br>• सर्दी की पेट्रोलिंग (Cold Patrolling) सीमा: <b>\${coldStart.toFixed(1)}°C</b> (td - 30°C)\`;
  document.getElementById("resultBox").style.display = "block";
}

window.onload = applyLang;
