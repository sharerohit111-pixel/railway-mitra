let currentLang = 'en';

const translations = {
  en: {
    appTitle: "Track Fittings Calculator",
    appSubtitle: "RDSO Drawing No. Finder",
    lblSleeper: "1. Sleeper Type",
    lblRail: "2. Rail Section",
    lblCircuit: "3. Track Circuiting / Liner Type",
    lblResultHeader: "RDSO Drawing Details",
    sleeperOpts: {
      "RT-2496": "Standard 60 kg PSC (RT-2496)",
      "RT-2495": "Standard 52 kg PSC (RT-2495)",
      "RT-8746": "Wider Base PSC (RT-8746)",
      "RT-8527": "25T Heavy Duty PSC (RT-8527)"
    },
    railOpts: {
      "60kg": "60 kg (UIC 60 / 60E1)",
      "52kg": "52 kg"
    },
    circuitOpts: {
      "metal": "Non-Track Circuited (Metal Liner)",
      "gfn": "Track Circuited (GFN / HVN Liner)"
    },
    cards: {
      erc: "ERC (Elastic Rail Clip)",
      linerGS: "Liner (Gauge Side - GS)",
      linerNGS: "Liner (Non-Gauge - NGS)",
      grsp: "GRSP (Rubber Pad)",
      insert: "MCI Insert (Cast-in)",
      cutLiner: "Cut Liner (Joints)"
    },
    qty4: "4 Nos. / Sleeper",
    qty2: "2 Nos. / Sleeper",
    jointNote: "For Fishplated / Glued Joints",
    warn52on60: "Note: Combination liners (different GS & NGS) are required when laying 52 kg rail on a 60 kg sleeper.",
    warnNotRec: "Note: Laying 60 kg rail on a 52 kg sleeper (RT-2495) is generally not standard practice on Indian Railways.",
    warn8527_52kg: "Important: The 52 kg rail combination for RT-8527 contains provisional drawing references marked “Check RDSO”. Do not use these references for field work until verified against the latest applicable RDSO drawing and railway instructions."
  },
  hi: {
    appTitle: "ट्रैक फिटिंग्स कैलकुलेटर",
    appSubtitle: "RDSO ड्राइंग नंबर खोजें",
    lblSleeper: "1. स्लीपर का प्रकार (Sleeper Type)",
    lblRail: "2. रेल सेक्शन (Rail Section)",
    lblCircuit: "3. ट्रैक सर्किटिंग / लाइनर प्रकार",
    lblResultHeader: "RDSO ड्राइंग विवरण",
    sleeperOpts: {
      "RT-2496": "स्टैंडर्ड 60 kg PSC (RT-2496)",
      "RT-2495": "स्टैंडर्ड 52 kg PSC (RT-2495)",
      "RT-8746": "वाइडर बेस PSC (RT-8746)",
      "RT-8527": "25T हैवी ड्यूटी PSC (RT-8527)"
    },
    railOpts: {
      "60kg": "60 kg (UIC 60 / 60E1)",
      "52kg": "52 kg"
    },
    circuitOpts: {
      "metal": "नॉन-ट्रैक सर्किटेड (Metal Liner)",
      "gfn": "ट्रैक सर्किटेड (GFN / HVN Liner)"
    },
    cards: {
      erc: "ERC (इलास्टिक रेल क्लिप)",
      linerGS: "लाइनर (गेज साइड - GS)",
      linerNGS: "लाइनर (नॉन-गेज साइड - NGS)",
      grsp: "GRSP (रबर पैड)",
      insert: "MCI इंसर्ट (स्लीपर में)",
      cutLiner: "कट लाइनर (जोड़ों के लिए)"
    },
    qty4: "4 नग / प्रति स्लीपर",
    qty2: "2 नग / प्रति स्लीपर",
    jointNote: "फिशप्लेट / ग्लूड जॉइंट के लिए",
    warn52on60: "नोट: 60 kg स्लीपर पर 52 kg रेल बिछाने के लिए GS और NGS में अलग-अलग कॉम्बिनेशन लाइनर लगते हैं।",
    warnNotRec: "नोट: 52 kg स्लीपर (RT-2495) पर 60 kg रेल बिछाना भारतीय रेलवे में मानक (Standard) नहीं है।",
    warn8527_52kg: "महत्वपूर्ण: RT-8527 पर 52 kg रेल के लिए कुछ ड्राइंग संदर्भ “Check RDSO” के रूप में अस्थायी हैं। फील्ड में उपयोग से पहले नवीनतम लागू RDSO ड्राइंग और रेलवे निर्देशों से इनकी पुष्टि अवश्य करें।"

  }
};

// RDSO Master Mapping Data
const rdsoData = {
  "RT-2496_60kg": {
    erc: "RT-3701 (Mk-III) / RT-5919 (Mk-V)",
    metalGS: "RT-3740",
    metalNGS: "RT-3740",
    gfnGS: "RT-3706",
    gfnNGS: "RT-3706",
    grsp: "RT-3711 (6mm) / RT-6618 (10mm)",
    insert: "RT-3704 / RT-3705",
    cutLiner: "RT-4511",
    warn: null
  },
  "RT-2496_52kg": {
    erc: "RT-3701 (Mk-III) / RT-5919 (Mk-V)",
    metalGS: "RT-3741",
    metalNGS: "RT-3742",
    gfnGS: "RT-3707",
    gfnNGS: "RT-3708",
    grsp: "RT-3711 (6mm) / RT-6618 (10mm)",
    insert: "RT-3704 / RT-3705",
    cutLiner: "RT-4322",
    warn: "warn52on60"
  },
  "RT-2495_52kg": {
    erc: "RT-3701 (Mk-III)",
    metalGS: "RT-3738",
    metalNGS: "RT-3738",
    gfnGS: "RT-3702",
    gfnNGS: "RT-3702",
    grsp: "RT-3710 (6mm)",
    insert: "RT-3703",
    cutLiner: "RT-4322",
    warn: null
  },
  "RT-2495_60kg": {
    erc: "N/A (Not Standard)",
    metalGS: "N/A",
    metalNGS: "N/A",
    gfnGS: "N/A",
    gfnNGS: "N/A",
    grsp: "N/A",
    insert: "RT-3703",
    cutLiner: "N/A",
    warn: "warnNotRec"
  },
  "RT-8746_60kg": {
    erc: "RT-5919 (Mk-V) / RT-3701 (Mk-III)",
    metalGS: "RT-8748",
    metalNGS: "RT-8748",
    gfnGS: "RT-8751",
    gfnNGS: "RT-8751",
    grsp: "RT-8747 (10mm)",
    insert: "RT-8745",
    cutLiner: "RT-4511",
    warn: null
  },
  "RT-8746_52kg": {
    erc: "RT-5919 (Mk-V) / RT-3701 (Mk-III)",
    metalGS: "RT-8749",
    metalNGS: "RT-8750",
    gfnGS: "RT-8752",
    gfnNGS: "RT-8753",
    grsp: "RT-8747 (10mm)",
    insert: "RT-8745",
    cutLiner: "RT-4322",
    warn: "warn52on60"
  },
  "RT-8527_60kg": {
    erc: "RT-5919 (Mk-V)",
    metalGS: "RT-8616",
    metalNGS: "RT-8617",
    gfnGS: "RT-6938",
    gfnNGS: "RT-6939",
    grsp: "RT-8528",
    insert: "RT-8526",
    cutLiner: "RT-4511",
    warn: null
  },
  "RT-8527_52kg": {
    erc: "RT-5919 (Mk-V)",
    metalGS: "RT-8616 (Check RDSO)",
    metalNGS: "RT-8617 (Check RDSO)",
    gfnGS: "RT-6938 (Check RDSO)",
    gfnNGS: "RT-6939 (Check RDSO)",
    grsp: "RT-8528",
    insert: "RT-8526",
    cutLiner: "RT-4322",
    warn: "warn8527_52kg"
  }
};

function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'hi' : 'en';
  document.getElementById('btnEn').classList.toggle('active', currentLang === 'en');
  document.getElementById('btnHi').classList.toggle('active', currentLang === 'hi');
  updateLabels();
  calculateFittings();
}

function updateLabels() {
  const t = translations[currentLang];
  document.getElementById('appTitle').innerText = t.appTitle;
  document.getElementById('appSubtitle').innerText = t.appSubtitle;
  document.getElementById('lblSleeper').innerText = t.lblSleeper;
  document.getElementById('lblRail').innerText = t.lblRail;
  document.getElementById('lblCircuit').innerText = t.lblCircuit;
  document.getElementById('lblResultHeader').innerText = t.lblResultHeader;

  const sSel = document.getElementById('sleeperSelect');
  for (let opt of sSel.options) opt.text = t.sleeperOpts[opt.value];

  const rSel = document.getElementById('railSelect');
  for (let opt of rSel.options) opt.text = t.railOpts[opt.value];

  const cSel = document.getElementById('circuitSelect');
  for (let opt of cSel.options) opt.text = t.circuitOpts[opt.value];
}

function calculateFittings() {
  const sleeper = document.getElementById('sleeperSelect').value;
  const rail = document.getElementById('railSelect').value;
  const circuit = document.getElementById('circuitSelect').value;
  const t = translations[currentLang];

  document.getElementById('sleeperBadge').innerText = "RDSO/" + sleeper.replace("RT-", "T-");

  const key = `${sleeper}_${rail}`;
  const data = rdsoData[key];

  const linerGS = circuit === 'metal' ? data.metalGS : data.gfnGS;
  const linerNGS = circuit === 'metal' ? data.metalNGS : data.gfnNGS;

  const cardsHTML = `
    <div class="result-card full-width">
      <div class="card-title">${t.cards.erc}</div>
      <div class="card-value">${data.erc}</div>
      <div class="card-sub">${t.qty4}</div>
    </div>

    <div class="result-card">
      <div class="card-title">${t.cards.linerGS}</div>
      <div class="card-value">${linerGS}</div>
      <div class="card-sub">${t.qty2}</div>
    </div>

    <div class="result-card">
      <div class="card-title">${t.cards.linerNGS}</div>
      <div class="card-value">${linerNGS}</div>
      <div class="card-sub">${t.qty2}</div>
    </div>

    <div class="result-card">
      <div class="card-title">${t.cards.grsp}</div>
      <div class="card-value">${data.grsp}</div>
      <div class="card-sub">${t.qty2}</div>
    </div>

    <div class="result-card">
      <div class="card-title">${t.cards.insert}</div>
      <div class="card-value">${data.insert}</div>
      <div class="card-sub">${t.qty4}</div>
    </div>

    <div class="result-card full-width">
      <div class="card-title">${t.cards.cutLiner}</div>
      <div class="card-value">${data.cutLiner}</div>
      <div class="card-sub">${t.jointNote}</div>
    </div>
  `;

  document.getElementById('cardsGrid').innerHTML = cardsHTML;

  const warnBox = document.getElementById('warningNote');
  if (data.warn) {
    warnBox.style.display = 'block';
    warnBox.innerText = t[data.warn];
  } else {
    warnBox.style.display = 'none';
  }
}

// Initial load
calculateFittings();
