'use strict';
let lang = 'hi';

function toggleLang() {
  lang = lang === 'hi' ? 'en' : 'hi';
  applyLang();
}

function applyLang() {
  const isEn = lang === 'en';
  const setText = (id, value) => { document.getElementById(id).textContent = value; };
  setText('langBtn', isEn ? 'हिंदी' : 'English');
  setText('mainTitle', isEn ? '🌡️ Zone-Wise LWR Temp & Patrolling' : '🌡️ जोन-वाइज LWR तापमान और पेट्रोलिंग');
  setText('subTitle', isEn ? 'Check td and patrolling thresholds for the four reference temperature zones (I–IV).' : 'IRPWM के 4 तापमान जोन (Zone I–IV) के अनुसार td और पेट्रोलिंग जांचें');
  setText('zoneLabel', isEn ? '1. Select Railway Temperature Zone:' : '1. रेलवे तापमान जोन चुनें (Temperature Zone):');
  setText('optZ1', isEn ? 'Zone I (Annual range: 40°C–50°C | Coastal)' : 'Zone I (वार्षिक अंतर: 40°C – 50°C | तटीय क्षेत्र)');
  setText('optZ2', isEn ? 'Zone II (Annual range: 51°C–60°C | South/Central)' : 'Zone II (वार्षिक अंतर: 51°C – 60°C | दक्षिण/मध्य)');
  setText('optZ3', isEn ? 'Zone III (Annual range: 61°C–70°C | North/West)' : 'Zone III (वार्षिक अंतर: 61°C – 70°C | उत्तर/पश्चिम)');
  setText('optZ4', isEn ? 'Zone IV (Annual range: 71°C–76°C | Extreme temperatures)' : 'Zone IV (वार्षिक अंतर: 71°C – 76°C | अत्यधिक ठंड/गर्मी)');
  setText('tmLabel', isEn ? '2. Mean Rail Temperature (tm in °C):' : '2. क्षेत्र का मीन रेल तापमान (Mean Rail Temp - tm °C):');
  setText('tdLabel', isEn ? '3. Destressing Temperature (td in °C):' : '3. डिस्ट्रेसिंग तापमान (Destressing Temp - td °C):');
  setText('currLabel', isEn ? '4. Current Rail Temperature (°C):' : '4. मौजूदा रेल तापमान (Current Rail Temp °C):');
  setText('calcBtn', isEn ? 'Check Reference Thresholds' : 'जोन नियमों से जांचें (Verify)');
  setText('resDiffLabel', isEn ? 'Temperature difference from td (ΔT = Current − td):' : 'डिस्ट्रेसिंग तापमान से अंतर (ΔT = Curr - td):');
  document.getElementById('disclaimer').textContent = isEn
    ? 'Important: This calculator provides an indicative result based on entered values and the reference thresholds encoded here. For actual patrolling, watchman and speed-restriction decisions, follow the latest applicable IRPWM, Railway Board/zonal instructions and competent authority orders. This is not an operational authorization.'
    : 'महत्वपूर्ण: यह कैलकुलेटर दिए गए इनपुट और इसमें शामिल संदर्भ सीमाओं के आधार पर प्रारंभिक संकेत देता है। पेट्रोलिंग, वॉचमैन और गति प्रतिबंध के वास्तविक निर्णय के लिए लागू नवीनतम IRPWM, रेलवे बोर्ड/जोनल निर्देश तथा सक्षम अधिकारी के आदेश देखें। इसे परिचालन अनुमति न मानें।';
  updateZoneInfo();
  if (document.getElementById('resultBox').style.display === 'block') calculateZoneLWR();
}

function updateZoneInfo() {
  const zone = document.getElementById('tempZone').value;
  const isEn = lang === 'en';
  const zoneFour = zone === '4';
  const ruleLines = zoneFour
    ? (isEn
      ? ['Permissible td range: tm + 5°C to tm + 10°C', 'Hot-weather patrolling reference: above td + 20°C', 'Watchman / speed-restriction reference: above td + 25°C', 'Cold-weather patrolling reference: below td − 30°C']
      : ['अनुमेय td सीमा: tm + 5°C से tm + 10°C', 'गर्मी की पेट्रोलिंग का संदर्भ: td + 20°C से ऊपर', 'वॉचमैन / गति प्रतिबंध का संदर्भ: td + 25°C से ऊपर', 'सर्दी की पेट्रोलिंग का संदर्भ: td − 30°C से नीचे'])
    : (isEn
      ? ['Permissible td range: tm to tm + 5°C', 'Hot-weather patrolling reference: above td + 20°C', 'Watchman / speed-restriction reference: above td + 25°C', 'Cold-weather patrolling reference: below td − 30°C']
      : ['अनुमेय td सीमा: tm से tm + 5°C तक', 'गर्मी की पेट्रोलिंग का संदर्भ: td + 20°C से ऊपर', 'वॉचमैन / गति प्रतिबंध का संदर्भ: td + 25°C से ऊपर', 'सर्दी की पेट्रोलिंग का संदर्भ: td − 30°C से नीचे']);
  const heading = isEn ? 'Reference thresholds supplied in the calculator' : 'कैलकुलेटर में दिए गए संदर्भ मान';
  document.getElementById('zoneRulesBox').innerHTML =
    '<strong>📘 Zone ' + zone + ' — ' + heading + '</strong><br>' +
    ruleLines.map(line => '• ' + line).join('<br>') +
    '<br><br><em>' + (isEn ? 'Verify these thresholds against the current official rule book and local instructions before operational use.' : 'परिचालन उपयोग से पहले इन सीमाओं का वर्तमान आधिकारिक नियम-पुस्तिका और स्थानीय निर्देशों से मिलान करें।') + '</em>';
}

function calculateZoneLWR() {
  const zone = document.getElementById('tempZone').value;
  const tm = Number(document.getElementById('tmTemp').value);
  const td = Number(document.getElementById('tdTemp').value);
  const curr = Number(document.getElementById('currTemp').value);
  const isEn = lang === 'en';
  const fields = ['tmTemp', 'tdTemp', 'currTemp'];
  const values = [tm, td, curr];
  if (fields.some((id, i) => document.getElementById(id).value.trim() === '' || !Number.isFinite(values[i]))) {
    alert(isEn ? 'Please enter valid values for tm, td and current rail temperature.' : 'कृपया tm, td और मौजूदा रेल तापमान के सही मान भरें।');
    return;
  }
  if (values.some(v => v < -20 || v > 100)) {
    alert(isEn ? 'Please check the entered temperatures. Values must be between −20°C and 100°C.' : 'दर्ज तापमान जाँचें। मान −20°C से 100°C के बीच होना चाहिए।');
    return;
  }

  const minTd = zone === '4' ? tm + 5 : tm;
  const maxTd = zone === '4' ? tm + 10 : tm + 5;
  const tdValid = td >= minTd && td <= maxTd;
  const tdMessage = tdValid
    ? (isEn ? 'Valid against the entered reference range for Zone ' + zone + ': ' + td + '°C (' + minTd + '°C–' + maxTd + '°C).' : 'Zone ' + zone + ' की दी गई संदर्भ सीमा के भीतर: ' + td + '°C (' + minTd + '°C–' + maxTd + '°C)।')
    : (isEn ? 'Outside the entered reference range for Zone ' + zone + '. Range: ' + minTd + '°C–' + maxTd + '°C.' : 'Zone ' + zone + ' की दी गई संदर्भ सीमा से बाहर। सीमा: ' + minTd + '°C–' + maxTd + '°C।');
  document.getElementById('tdValidationBox').innerHTML = '<div class="td-check">' + (tdValid ? '✓ ' : '⚠ ') + tdMessage + '</div>';

  const diff = curr - td;
  const hotStart = td + 20;
  const extremeHot = td + 25;
  const coldStart = td - 30;
  document.getElementById('diffOutput').textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + ' °C';

  let badgeClass, statusText;
  if (curr > extremeHot) {
    badgeClass = 'badge-danger';
    statusText = isEn ? '🚨 CRITICAL HEAT: Above td + 25°C — immediately follow applicable official instructions.' : '🚨 अत्यधिक गर्मी: td + 25°C से ऊपर — लागू आधिकारिक निर्देशों का तुरंत पालन करें।';
  } else if (curr > hotStart) {
    badgeClass = 'badge-hot';
    statusText = isEn ? '☀️ HOT-WEATHER THRESHOLD CROSSED: Above td + 20°C.' : '☀️ गर्मी की संदर्भ सीमा पार: td + 20°C से ऊपर।';
  } else if (curr < coldStart) {
    badgeClass = 'badge-cold';
    statusText = isEn ? '❄️ COLD-WEATHER THRESHOLD CROSSED: Below td − 30°C.' : '❄️ सर्दी की संदर्भ सीमा पार: td − 30°C से नीचे।';
  } else {
    badgeClass = 'badge-safe';
    statusText = isEn ? 'Within the calculator reference thresholds; this does not certify track safety.' : 'कैलकुलेटर की संदर्भ सीमाओं के भीतर; इससे ट्रैक की सुरक्षा प्रमाणित नहीं होती।';
  }
  document.getElementById('statusAlert').innerHTML = '<span class="' + badgeClass + '">' + statusText + '</span>';

  document.getElementById('limitDetails').innerHTML = isEn
    ? '• Zone ' + zone + ' reference td range: <b>' + minTd.toFixed(1) + '°C to ' + maxTd.toFixed(1) + '°C</b><br>• Hot-weather reference threshold: <b>' + hotStart.toFixed(1) + '°C</b> (td + 20°C)<br>• Extreme-heat reference threshold: <b>' + extremeHot.toFixed(1) + '°C</b> (td + 25°C)<br>• Cold-weather reference threshold: <b>' + coldStart.toFixed(1) + '°C</b> (td − 30°C)'
    : '• Zone ' + zone + ' की संदर्भ td सीमा: <b>' + minTd.toFixed(1) + '°C से ' + maxTd.toFixed(1) + '°C</b><br>• गर्मी की संदर्भ सीमा: <b>' + hotStart.toFixed(1) + '°C</b> (td + 20°C)<br>• अत्यधिक गर्मी की संदर्भ सीमा: <b>' + extremeHot.toFixed(1) + '°C</b> (td + 25°C)<br>• सर्दी की संदर्भ सीमा: <b>' + coldStart.toFixed(1) + '°C</b> (td − 30°C)';
  document.getElementById('resultBox').style.display = 'block';
}

window.addEventListener('DOMContentLoaded', applyLang);
