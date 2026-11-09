(function () {
  "use strict";
  const KEY = "railwayMitra.languageMode.v2";
  const HI_EN = {
    "मुख्य पेज पर वापस जाएँ":"Back to Home Page","डैशबोर्ड पर वापस जाएँ":"Back to Dashboard","भत्ता कैलकुलेटर पर वापस जाएँ":"Back to Allowance Calculator","वापस":"Back",
    "भत्ता कैलकुलेटर":"Allowance Calculator","भत्ता कैलकुलेटर उपलब्ध है":"Calculator Available","कैलकुलेटर उपलब्ध है":"Calculator Available",
    "महँगाई भत्ता की गणना करें":"Calculate Dearness Allowance","मकान किराया भत्ते की गणना":"Calculate House Rent Allowance","यात्रा भत्ते की गणना":"Calculate Transport Allowance",
    "वेतन का विवरण":"Salary Details","मूल वेतन":"Basic Pay","DA दर":"DA Rate","निर्धारित DA दर":"Applicable DA Rate","प्रभावी तिथि":"Effective Date",
    "DA की गणना करें":"Calculate DA","गणना करें":"Calculate","रीसेट करें":"Reset","गणना का परिणाम":"Calculation Result","महँगाई भत्ता":"Dearness Allowance",
    "मूल वेतन + DA":"Basic Pay + DA","नोट:":"Note:","नोट":"Note","कुल महीने":"Total Months","कुल माह":"Total Months","महीने":"Months",
    "कर्मचारी की मूल जानकारी":"Basic Employee Information","अपनी कर्मचारी जानकारी एक बार भरें। जुड़े हुए कैलकुलेटर इसी प्रोफाइल से आवश्यक विवरण अपने आप प्राप्त करेंगे।":"Enter your employee details once. Connected calculators will automatically use the required information from this profile.",
    "कर्मचारी का नाम":"Employee Name","पूरा नाम":"Full Name","पद":"Post","वेतन स्तर":"Pay Level","मूल वेतन ₹":"Basic Pay ₹","परिवहन भत्ता":"Transport Allowance",
    "मंडल":"Division","रेलवे जोन":"Railway Zone","वैकल्पिक":"Optional","विभाग":"Department","प्रोफाइल सेव करें":"Save Profile","प्रोफाइल हटाएँ":"Delete Profile",
    "महत्वपूर्ण:":"Important:","इस प्रारंभिक संस्करण में प्रोफाइल इसी ब्राउज़र/डिवाइस में सेव होती है। यह अभी Firebase खाते के साथ दूसरे डिवाइस पर सिंक नहीं होती। व्यक्तिगत HRMS या बैंक संबंधी संवेदनशील जानकारी साझा न करें।":"In this version, your profile is saved only in this browser/device and is not synced to other devices through Firebase. Do not share sensitive HRMS or bank information.",
    "प्रोफाइल उपलब्ध नहीं":"Profile Not Available","पहले Employee Profile में जानकारी सेव करें।":"Please save your details in Employee Profile first.","प्रोफाइल देखें / बदलें":"View / Edit Profile",
    "आप क्या गणना करना चाहते हैं?":"What would you like to calculate?","मासिक नया वेतन":"New Monthly Salary","मासिक नए वेतन की गणना":"New Monthly Salary Calculation","एरियर":"Arrears","एरियर की गणना":"Arrear Calculation",
    "विकल्प बदलें":"Change Option","वर्तमान 7th CPC Basic Pay":"Current 7th CPC Basic Pay","अनुमानित Fitment Factor":"Estimated Fitment Factor",
    "क्या सरकारी रेलवे क्वार्टर मिला हुआ है?":"Have you been allotted a Railway Quarter?","नहीं — HRA मिलेगा":"No — HRA is applicable","हाँ — HRA नहीं मिलेगा":"Yes — HRA is not applicable",
    "क्वार्टर मिलने पर मासिक वेतन में HRA ₹0 माना जाएगा।":"If a quarter is allotted, monthly HRA will be treated as ₹0.",
    "शहर की श्रेणी (मासिक HRA)":"City Class (Monthly HRA)","शहर की श्रेणी के अनुसार मासिक HRA अनुमानित होगा।":"Monthly HRA will be estimated according to the city class.",
    "Base Transport Allowance":"Base Transport Allowance","संभावित प्रभावी तिथि":"Expected Effective Date","एरियर की गणना किस तारीख तक करनी है?":"Calculate arrears up to which date?",
    "डिफ़ॉल्ट आज की तारीख है। चाहें तो अपनी दूसरी तारीख चुनें।":"Today's date is selected by default. You can choose another date.",
    "वर्तमान 7th CPC DA (%)":"Current 7th CPC DA (%)","मासिक नया वेतन निकालें":"Calculate New Monthly Salary","केवल एरियर निकालें":"Calculate Arrears Only",
    "गणना के विवरण":"Calculation Details","नया Basic Pay":"New Basic Pay","नया HRA":"New HRA","नया Transport Allowance":"New Transport Allowance",
    "नई NPS कटौती (10%)":"New NPS Deduction (10%)","एरियर के अनुमानित महीने":"Estimated Arrear Months","एरियर की गणना अंतिम तारीख तक":"Arrears Calculated Up To",
    "प्रोफाइल से लिया गया":"Loaded from Profile","Profile में Basic Pay उपलब्ध नहीं":"Basic Pay is not available in Profile",
    "कर्मचारी":"Employee","प्रोफाइल विवरण":"Profile Details","प्रोफाइल इस डिवाइस पर सफलतापूर्वक सेव हो गई।":"Profile saved successfully on this device.",
    "प्रोफाइल सेव नहीं हो सकी। कृपया डिवाइस की स्टोरेज अनुमति जाँचें।":"Could not save profile. Please check device storage permissions.",
    "क्या आप इस डिवाइस से कर्मचारी प्रोफाइल हटाना चाहते हैं?":"Do you want to delete the employee profile from this device?",
    "इस डिवाइस से प्रोफाइल हटा दी गई है।":"Profile deleted from this device.",
    "वेतन एवं भत्ते":"Salary & Allowances",
    "मूल वेतन (Basic Pay)":"Basic Pay", "मूल वेतन (Basic Pay) ₹":"Basic Pay (₹)", "वर्तमान 7th CPC Basic Pay (₹)":"Current 7th CPC Basic Pay (₹)",
    "भत्ता की गणना करें":"Calculate Allowance", "कुल एरियर":"Total Arrears", "एरियर राशि":"Arrear Amount",
    "अपना पद चुनें":"Select Your Post", "Select Your Post (अपनी पोस्ट चुनें)":"Select Your Post",
    "मासिक शुद्ध बढ़ोतरी":"Monthly Net Increase", "वर्तमान अनुमानित Net":"Current Estimated Net", "नया अनुमानित Gross":"Estimated New Gross",
    "वर्तमान 7th CPC अनुमानित Gross":"Current Estimated 7th CPC Gross", "वर्तमान अनुमानित Net":"Current Estimated Net",
    "मासिक वेतन के इस अनुमान में Basic, DA, HRA और TPTA शामिल हैं तथा NPS घटाया गया है। सरकारी क्वार्टर मिलने पर HRA शून्य है। HRA दरें अनुमानित हैं, आधिकारिक 8th CPC अधिसूचना नहीं।":"This monthly salary estimate includes Basic, DA, HRA and TPTA, with NPS deducted. HRA is zero if a government quarter is allotted. HRA rates are estimates, not an official 8th CPC notification.",
    "केवल Basic + DA अंतर − 10% NPS; TA/HRA शामिल नहीं":"Only Basic + DA difference minus 10% NPS; TA/HRA are excluded",
    "क्वार्टर मिलने पर मासिक HRA ₹0 माना जाएगा।":"If a quarter is allotted, monthly HRA will be ₹0.",
    "Profile TPA विकल्पों से मेल नहीं खाता; सही Base TPTA चुनें।":"Profile TPA does not match the available options; select the correct Base TPTA.",
    "कृपया पुष्टि करें":"Please verify", "शहर के अनुसार जाँचें।":"Verify according to your city.",
    "गणना के परिणाम":"Calculation Results", "अनुमानित प्रभावी तिथि":"Estimated Effective Date",
    "नई NPS कटौती":"New NPS Deduction", "एरियर की गणना अंतिम तारीख तक":"Arrears calculated up to",
    "मूल वेतन + DA":"Basic Pay + DA", "महँगाई भत्ता की गणना करें":"Calculate Dearness Allowance",
    "वेतन और एरियर की गणना करें":"Calculate Salary and Arrears", "कर्मचारी की जानकारी":"Employee Information",
    "कर्मचारी सेवाएँ":"Employee Services", "गोपनीयता पहले":"Privacy First", "आपकी व्यक्तिगत कर्मचारी जानकारी निजी और सुरक्षित रहनी चाहिए।":"Your personal employee information must remain private and protected.",
    "भत्ते":"Allowances","मदद":"Help","सेवाएँ":"Services",
    "ट्रैक मेंटेनर":"Track Maintainer","शहर की श्रेणी":"City Class","चुनें":"Select","अपना पद चुनें":"Select Your Post",
    "अपनी पोस्ट चुनें":"Select Your Post","वर्तमान DA (%)":"Current DA (%)","वर्तमान Basic Pay":"Current Basic Pay",
    "महीनों की संख्या":"Number of Months","कुल एरियर":"Total Arrears","एरियर राशि":"Arrear Amount",
    "कैलकुलेटर":"Calculator","गणना का विवरण":"Calculation Details","परिणाम":"Result","डाउनलोड PDF":"Download PDF",
    "कृपया":"Please","जाँचें":"Check","सही":"Valid","नाम":"Name","लेवल":"Level","मूल जानकारी":"Basic Information",
    "DA एरियर":"DA Arrears","मकान किराया भत्ता":"House Rent Allowance","यात्रा भत्ता":"Transport Allowance",
    "रात्रि ड्यूटी भत्ता":"Night Duty Allowance","ओवरटाइम भत्ता":"Overtime Allowance","किलोमीटर भत्ता":"Kilometrage Allowance",
    "Railway Mitra – Railway Allowances":"Railway Mitra – Railway Allowances","कर्मचारी की जानकारी":"Employee Information",
    "अपनी जानकारी भरें":"Enter Your Details","सेव करें":"Save","हटाएँ":"Delete","वेतन स्तर चुनें":"Select Pay Level"
  };
  const EN_HI = Object.fromEntries(Object.entries(HI_EN).map(([hi,en])=>[en,hi]));
  let lang = localStorage.getItem(KEY) || "mix";
  const originals = new WeakMap();
  function replaceText(value, map) {
    let out=value;
    Object.keys(map).sort((a,b)=>b.length-a.length).forEach(k=>{out=out.split(k).join(map[k]);});
    return out;
  }
  function translate(root) {
    const map=lang==="en"?HI_EN:null;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(n){return n.parentElement && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName) && n.nodeValue.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}
    });
    let node;
    while((node=walker.nextNode())){
      if(!originals.has(node)) originals.set(node,node.nodeValue);
      const base=originals.get(node);
      node.nodeValue=map?replaceText(base,map):base;
    }
    root.querySelectorAll("input[placeholder],button[aria-label],a[aria-label],option,optgroup[label]").forEach(el=>{
      ["placeholder","aria-label","label"].forEach(attr=>{
        if(!el.hasAttribute(attr))return;
        const key="data-rm-original-"+attr;
        if(!el.hasAttribute(key))el.setAttribute(key,el.getAttribute(attr));
        const base=el.getAttribute(key);
        el.setAttribute(attr,map?replaceText(base,map):base);
      });
    });
    document.documentElement.lang=lang==="en"?"en":"hi";
    document.querySelectorAll("title").forEach(t=>{
      if(!t.dataset.rmOriginal)t.dataset.rmOriginal=t.textContent;
      t.textContent=map?replaceText(t.dataset.rmOriginal,map):t.dataset.rmOriginal;
    });
    const btn=document.getElementById("rmLanguageToggle");
    if(btn){
      btn.textContent=lang==="en"?"हिंदी + English":"English";
      btn.setAttribute("aria-label",lang==="en"?"Switch to Hindi and English mix":"Switch to full English");
      btn.title=lang==="en"?"वर्तमान मिश्रित भाषा में लौटें":"पूरे ऐप को English में बदलें";
    }
  }
  function addToggle(){
    if(document.getElementById("rmLanguageToggle"))return;
    const b=document.createElement("button");b.id="rmLanguageToggle";b.type="button";
    if(document.body.classList.contains("rm-rules")){b.style.cssText="position:relative;display:block;width:max-content;max-width:100%;margin:0 0 18px auto;right:auto;bottom:auto;z-index:2;padding:9px 14px;border:1px solid #39dff5;border-radius:999px;background:linear-gradient(135deg,#087eae,#7838c8);color:#fff;font-weight:800;font-size:14px;box-shadow:0 4px 16px #0008;cursor:pointer";const target=document.querySelector(".rules-topic-grid");if(target)target.parentNode.insertBefore(b,target);}else{b.style.cssText="position:fixed;right:14px;bottom:78px;z-index:99999;padding:10px 15px;border:1px solid #39dff5;border-radius:999px;background:linear-gradient(135deg,#087eae,#7838c8);color:#fff;font-weight:800;font-size:14px;box-shadow:0 4px 16px #0008;cursor:pointer";}
    b.addEventListener("click",()=>{
      lang=lang==="en"?"mix":"en";
      localStorage.setItem(KEY,lang);
      translate(document.body);
    });
    document.body.appendChild(b);translate(document.body);
  }
  document.addEventListener("DOMContentLoaded",addToggle);
  const observer=new MutationObserver(records=>{
    if(!document.body)return;
    for(const rec of records){
      if(rec.type==="childList")rec.addedNodes.forEach(n=>{
        if(n.nodeType===Node.ELEMENT_NODE)translate(n);
        else if(n.nodeType===Node.TEXT_NODE&&n.nodeValue.trim()){
          if(!originals.has(n))originals.set(n,n.nodeValue);
          if(lang==="en")n.nodeValue=replaceText(originals.get(n),HI_EN);
          else n.nodeValue=originals.get(n);
        }
      });
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.RailwayMitraLanguage={get:()=>lang,set(value){if(!["en","mix"].includes(value))return;lang=value;localStorage.setItem(KEY,lang);if(document.body)translate(document.body);}};
})();