let lang = 'hi';
const CANT_CONSTANT = 1750 / 127; // BG equilibrium cant constant, approximately 13.7795

function toggleLang() {
  lang = lang === 'hi' ? 'en' : 'hi';
  applyLang();
}

function applyLang() {
  const en = lang === 'en';
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  set('langBtn', en ? 'हिंदी' : 'English');
  set('mainTitle', en ? '📐 Cant (Superelevation) & Safe Speed' : '📐 कैंट (Superelevation) और सेफ स्पीड');
  set('subTitle', en ? 'Calculate cant and theoretical speed limits for Broad Gauge (BG) curves' : 'ब्रॉड गेज (BG) कर्व के लिए कैंट और अधिकतम सुरक्षित गति निकालें');
  set('inputTypeLabel', en ? '1. Select Curve Input:' : '1. कर्व का मान चुनें (Curve Input):');
  set('optDeg', en ? 'Degree of Curve (D)' : 'कर्व की डिग्री (Degree - D)');
  set('optRad', en ? 'Radius of Curve (R in metres)' : 'कर्व की त्रिज्या (Radius - R मीटर में)');
  set('speedLabel', en ? '2. Enter Train Speed (km/h):' : '2. ट्रेन की गति डालें (Speed in km/h):');
  set('routeLabel', en ? '3. Route Category (IRPWM):' : '3. रूट की श्रेणी (Route Group - IRPWM):');
  set('optABC', en ? 'Group A, B, C (Max Ca = 165mm, Cd = 100mm)' : 'Group A, B, C (अधिकतम Ca = 165mm, Cd = 100mm)');
  set('optDE', en ? 'Group D, E (Max Ca = 140mm, Cd = 75mm)' : 'Group D, E (अधिकतम Ca = 140mm, Cd = 75mm)');
  set('calcBtn', en ? 'Calculate Cant & Speed' : 'गणना करें (Calculate)');
  set('resCantTitle', en ? 'Equilibrium Cant required:' : 'आवश्यक इक्विलिब्रियम कैंट (Equilibrium Cant):');
  set('disclaimer', en ? 'This is a mathematical estimate based on the formula and selected limits. Actual operating speed must follow approved railway rules, local restrictions and competent authority instructions.' : 'यह परिणाम दिए गए सूत्र और चुनी गई सीमाओं पर आधारित गणितीय अनुमान है। वास्तविक संचालन गति के लिए स्वीकृत रेलवे नियम, स्थानीय प्रतिबंध और सक्षम प्राधिकारी के आदेश मान्य होंगे।');
  document.getElementById('principleBox').innerHTML = en
    ? '<strong>📘 Formula & assumptions (BG):</strong><br>• Equilibrium Cant (Ca) = (1750 × V²) / (127 × R) mm<br>• Maximum cant (as configured): 165 mm for Groups A/B/C; 140 mm for Groups D/E<br>• Theoretical limiting speed = √[((Max Ca + Cd) × R) / (1750/127)] km/h'
    : '<strong>📘 सूत्र और मान्यताएँ (BG):</strong><br>• इक्विलिब्रियम कैंट (Ca) = (1750 × V²) / (127 × R) mm<br>• चुनी गई अधिकतम कैंट सीमा: Group A/B/C के लिए 165 mm; Group D/E के लिए 140 mm<br>• सैद्धांतिक सीमा गति = √[((अधिकतम Ca + Cd) × R) / (1750/127)] km/h';
  updateLabels();
  if (document.getElementById('resultBox').style.display === 'block') calculateCant();
}

function updateLabels() {
  const en = lang === 'en';
  const degree = document.getElementById('curveType').value === 'degree';
  document.getElementById('curveValLabel').textContent = degree
    ? (en ? 'Enter Degree of Curve:' : 'कर्व की डिग्री डालें (Degree):')
    : (en ? 'Enter Radius of Curve (metres):' : 'कर्व की त्रिज्या डालें (Radius मीटर में):');
  document.getElementById('curveVal').placeholder = degree
    ? (en ? 'e.g. 2.0' : 'जैसे: 2.0')
    : (en ? 'e.g. 875' : 'जैसे: 875');
}

function calculateCant() {
  const type = document.getElementById('curveType').value;
  const value = Number(document.getElementById('curveVal').value);
  const speed = Number(document.getElementById('trainSpeed').value);
  const limits = document.getElementById('routeGroup').value.split('_').map(Number);
  const [maxCa, maxCd] = limits;
  const en = lang === 'en';

  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(speed) || speed <= 0) {
    alert(en ? 'Please enter a curve value and train speed greater than zero.' : 'कृपया कर्व का मान और ट्रेन की गति शून्य से अधिक सही दर्ज करें।');
    return;
  }
  if (!Number.isFinite(maxCa) || !Number.isFinite(maxCd)) {
    alert(en ? 'Please select a valid route category.' : 'कृपया सही रूट श्रेणी चुनें।');
    return;
  }

  const radius = type === 'degree' ? 1750 / value : value;
  const degree = 1750 / radius;
  if (!Number.isFinite(radius) || radius <= 0) {
    alert(en ? 'Please enter a valid curve radius or degree.' : 'कृपया कर्व की सही त्रिज्या या डिग्री दर्ज करें।');
    return;
  }

  const equilibriumCant = CANT_CONSTANT * speed * speed / radius;
  const cantToProvide = Math.min(equilibriumCant, maxCa);
  const theoreticalMaxSpeed = Math.sqrt(((maxCa + maxCd) * radius) / CANT_CONSTANT);

  document.getElementById('cantOutput').textContent = equilibriumCant.toFixed(1) + ' mm';
  const withinLimit = equilibriumCant <= maxCa;
  document.getElementById('statusBadge').innerHTML = withinLimit
    ? '<span class="badge-ok">' + (en ? '✓ Within selected cant limit' : '✓ चुनी गई कैंट सीमा के भीतर') + '</span>'
    : '<span class="badge-warn">' + (en ? '⚠ Exceeds selected maximum cant' : '⚠ अधिकतम अनुमेय कैंट सीमा से अधिक') + '</span>';

  document.getElementById('extraInfo').innerHTML = en
    ? '• Curve radius: <b>' + radius.toFixed(1) + ' m</b> | Degree: <b>' + degree.toFixed(2) + '°</b><br>' +
      '• Cant to provide (capped at selected Max Ca): <b>' + cantToProvide.toFixed(1) + ' mm</b><br>' +
      '• Theoretical limiting speed (Max Ca ' + maxCa + ' mm + Cd ' + maxCd + ' mm): <b>' + Math.floor(theoreticalMaxSpeed) + ' km/h</b>'
    : '• कर्व की त्रिज्या: <b>' + radius.toFixed(1) + ' मीटर</b> | डिग्री: <b>' + degree.toFixed(2) + '°</b><br>' +
      '• दिया जाने वाला कैंट (चुनी गई अधिकतम Ca सीमा तक): <b>' + cantToProvide.toFixed(1) + ' mm</b><br>' +
      '• सैद्धांतिक सीमा गति (अधिकतम Ca ' + maxCa + ' mm + Cd ' + maxCd + ' mm): <b>' + Math.floor(theoreticalMaxSpeed) + ' km/h</b>';

  document.getElementById('resultBox').style.display = 'block';
}

window.addEventListener('DOMContentLoaded', applyLang);