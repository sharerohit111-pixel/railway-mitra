let currentLang = 'hi'; // Default Hindi

function toggleLanguage() {
  currentLang = (currentLang === 'hi') ? 'en' : 'hi';
  applyLanguage();
}

function applyLanguage() {
  if (currentLang === 'en') {
    document.getElementById("langToggleBtn").innerText = "हिंदी में देखें";
    document.getElementById("titleText").innerText = "🛤️ Versine & Curve Calculator";
    document.getElementById("subTitleText").innerText = "Calculate Curve Versine (in mm) for both Main Line and Yard";
    document.getElementById("chordLabel").innerText = "1. Track Type / Chord Length:";
    document.getElementById("opt20").innerText = "20 Meter (Main Line Standard)";
    document.getElementById("opt10").innerText = "10 Meter (Yard / Sharp Curve)";
    document.getElementById("opt6").innerText = "6 Meter (Turnout / Cross-over)";
    document.getElementById("optCustom").innerText = "Custom Chord Length (in meters)";
    document.getElementById("customChordLabel").innerText = "Enter Chord Length (in meters):";
    document.getElementById("customChordInput").placeholder = "e.g. 15";
    document.getElementById("typeLabel").innerText = "2. Select Input Parameter:";
    document.getElementById("optDegree").innerText = "Degree of Curve (D)";
    document.getElementById("optRadius").innerText = "Radius of Curve (R in meters)";
    document.getElementById("calcBtnText").innerText = "Calculate Versine";
    document.getElementById("resTitle").innerText = "Calculated Versine:";
    document.getElementById("infoBoxContent").innerHTML =
      `<strong style="color:#38bdf8;">📘 Principle & Formula:</strong><br>` +
      `• <b>Main Formula:</b> V = (C² / 8R) × 1000 (in mm)<br>` +
      `• <b>Main Line (20m Chord):</b> V = 28.57 × Degree<br>` +
      `• <b>Yard (10m Chord):</b> V = 7.14 × Degree<br>` +
      `• <i>Note: As per Indian Railways, Radius of a 1° curve is 1750 meters.</i>`;
  } else {
    document.getElementById("langToggleBtn").innerText = "English में देखें";
    document.getElementById("titleText").innerText = "🛤️ वर्साइन और कर्व कैलकुलेटर";
    document.getElementById("subTitleText").innerText = "Main Line और Yard दोनों के लिए कर्व वर्साइन (mm में) निकालें";
    document.getElementById("chordLabel").innerText = "1. ट्रैक का प्रकार / कॉर्ड लंबाई (Chord Length):";
    document.getElementById("opt20").innerText = "20 मीटर (Main Line स्टैंडर्ड)";
    document.getElementById("opt10").innerText = "10 मीटर (Yard / तीखा मोड़)";
    document.getElementById("opt6").innerText = "6 मीटर (Turnout / Cross-over)";
    document.getElementById("optCustom").innerText = "Custom लंबाई (अन्य मीटर)";
    document.getElementById("customChordLabel").innerText = "कॉर्ड की लंबाई डालें (मीटर में):";
    document.getElementById("customChordInput").placeholder = "जैसे: 15";
    document.getElementById("typeLabel").innerText = "2. मान किस रूप में है? (Input Type):";
    document.getElementById("optDegree").innerText = "कर्व की डिग्री (Degree - D)";
    document.getElementById("optRadius").innerText = "कर्व की त्रिज्या (Radius - R मीटर में)";
    document.getElementById("calcBtnText").innerText = "वर्साइन निकालें (Calculate)";
    document.getElementById("resTitle").innerText = "अनुमानित वर्साइन (Versine):";
    document.getElementById("infoBoxContent").innerHTML =
      `<strong style="color:#38bdf8;">📘 सिद्धांत और नियम (Principle):</strong><br>` +
      `• <b>मुख्य सूत्र:</b> V = (C² / 8R) × 1000 (mm में)<br>` +
      `• <b>Main Line (20m कॉर्ड):</b> V = 28.57 × Degree<br>` +
      `• <b>Yard (10m कॉर्ड):</b> V = 7.14 × Degree<br>` +
      `• <i>नोट: भारतीय रेलवे के अनुसार 1° कर्व की त्रिज्या (Radius) 1750 मीटर होती है।</i>`;
  }
  updatePlaceholder();
  if (document.getElementById("resultBox").style.display === "block") {
    calculateVersine();
  }
}

function toggleCustomChord() {
  const chord = document.getElementById("chordLength").value;
  document.getElementById("customChordDiv").style.display = (chord === "custom") ? "block" : "none";
}

function updatePlaceholder() {
  const type = document.getElementById("inputType").value;
  const label = document.getElementById("valueLabel");
  const input = document.getElementById("curveValue");
  if (currentLang === 'hi') {
    if (type === "degree") {
      label.innerText = "कर्व की डिग्री डालें (Degree):";
      input.placeholder = "जैसे: 2.5";
    } else {
      label.innerText = "कर्व की त्रिज्या डालें (Radius मीटर में):";
      input.placeholder = "जैसे: 700";
    }
  } else {
    if (type === "degree") {
      label.innerText = "Enter Degree of Curve:";
      input.placeholder = "e.g. 2.5";
    } else {
      label.innerText = "Enter Radius of Curve (in meters):";
      input.placeholder = "e.g. 700";
    }
  }
}

function calculateVersine() {
  let chordSelect = document.getElementById("chordLength").value;
  let C = (chordSelect === "custom") ? parseFloat(document.getElementById("customChordInput").value) : parseFloat(chordSelect);
  let type = document.getElementById("inputType").value;
  let val = parseFloat(document.getElementById("curveValue").value);

  if (!C || C <= 0 || !val || val <= 0) {
    alert(currentLang === 'hi' ? "कृपया सही संख्या (Value) डालें!" : "Please enter a valid positive number!");
    return;
  }

  let R, D;
  if (type === "degree") {
    D = val;
    R = 1750 / D;
  } else {
    R = val;
    D = 1750 / R;
  }

  let versineMM = ((C * C) / (8 * R)) * 1000;

  document.getElementById("versineOutput").innerText = versineMM.toFixed(2) + " mm";

  if (currentLang === 'hi') {
    document.getElementById("extraDetails").innerHTML =
      `• त्रिज्या (Radius): <b>${R.toFixed(2)} मीटर</b><br>` +
      `• डिग्री (Degree): <b>${D.toFixed(2)}°</b><br>` +
      `• कॉर्ड लंबाई (Chord): <b>${C} मीटर</b>`;
  } else {
    document.getElementById("extraDetails").innerHTML =
      `• Radius: <b>${R.toFixed(2)} meters</b><br>` +
      `• Degree: <b>${D.toFixed(2)}°</b><br>` +
      `• Chord Length: <b>${C} meters</b>`;
  }

  document.getElementById("resultBox").style.display = "block";
}
