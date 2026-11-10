/* Shared landing-page controller for non-calculator Railway Mitra modules. */
"use strict";

// Load the isolated Folder Identification Code System on every shared module page.
(function loadFolderIdentificationCodes(){
 const css=document.createElement("link");
 css.rel="stylesheet";
 css.href="../../features/folder-codes/folder-codes.css";
 document.head.appendChild(css);
 const script=document.createElement("script");
 script.src="../../features/folder-codes/folder-codes.js";
 script.defer=true;
 document.head.appendChild(script);
})();
document.addEventListener("DOMContentLoaded",async()=>{
 const page=document.body.dataset.moduleId;
 const content=document.getElementById("moduleContent");
 if(!page||!content)return;
 const catalog={
  profile:{en:["Employee Profile","Keep your employee details organized in one place.",["Personal details","Designation and pay level","Posting and service details","Emergency contact"]],hi:["कर्मचारी प्रोफाइल","अपनी कर्मचारी संबंधी जानकारी एक स्थान पर व्यवस्थित रखें।",["व्यक्तिगत विवरण","पदनाम एवं वेतन स्तर","पदस्थापन एवं सेवा विवरण","आपातकालीन संपर्क"]]},
  salary:{en:["Salary & Pay","Salary-related reference tools and information.",["Pay level and basic-pay reference","Monthly salary components","Deductions and take-home pay","Pay-fixation information"]],hi:["वेतन एवं भुगतान","वेतन से संबंधित जानकारी और संदर्भ सुविधाएँ।",["वेतन स्तर एवं मूल वेतन संदर्भ","मासिक वेतन के घटक","कटौतियाँ एवं हाथ में मिलने वाला वेतन","वेतन निर्धारण की जानकारी"]]},
  arrears:{en:["Arrear Information","A place for employee arrear information and supporting resources.",["DA arrear references","Pay revision arrear records","Period-wise statement","Supporting orders and documents"]],hi:["बकाया राशि की जानकारी","कर्मचारी बकाया राशि एवं संबंधित संसाधनों के लिए स्थान।",["महँगाई भत्ता बकाया संदर्भ","वेतन संशोधन बकाया अभिलेख","अवधिवार विवरण","संबंधित आदेश एवं दस्तावेज"]]},
  duty:{en:["Duty Management","Organize duty-related information and records.",["Duty roster reference","Attendance record resources","Night duty information","Duty handover notes"]],hi:["ड्यूटी प्रबंधन","ड्यूटी से संबंधित जानकारी एवं अभिलेख व्यवस्थित करें।",["ड्यूटी रोस्टर संदर्भ","उपस्थिति अभिलेख संसाधन","रात्रि ड्यूटी जानकारी","ड्यूटी हस्तांतरण टिप्पणियाँ"]]},
  leave:{en:["Leave Management","Access leave-related information and planning resources.",["Leave account reference","Leave rules and procedures","Leave application checklist","Leave balance records"]],hi:["अवकाश प्रबंधन","अवकाश संबंधी जानकारी एवं योजना संसाधन।",["अवकाश खाते का संदर्भ","अवकाश नियम एवं प्रक्रिया","अवकाश आवेदन जाँच सूची","अवकाश शेष अभिलेख"]]},
  retirement:{en:["NPS & Pension","Retirement and pension information in one place.",["NPS contribution reference","Pension and retirement rules","Service-period checklist","Retirement document checklist"]],hi:["एनपीएस एवं पेंशन","सेवानिवृत्ति एवं पेंशन संबंधी जानकारी एक स्थान पर।",["एनपीएस अंशदान संदर्भ","पेंशन एवं सेवानिवृत्ति नियम","सेवा अवधि जाँच सूची","सेवानिवृत्ति दस्तावेज जाँच सूची"]]},
  finance:{en:["Loan & Finance","Personal finance reference resources for railway employees.",["Loan and EMI records","Monthly budget planning","Debt repayment checklist","Financial document list"]],hi:["ऋण एवं वित्त","रेलवे कर्मचारियों के लिए व्यक्तिगत वित्त संदर्भ संसाधन।",["ऋण एवं ईएमआई अभिलेख","मासिक बजट योजना","ऋण भुगतान जाँच सूची","वित्तीय दस्तावेज सूची"]]},
  rules:{en:["Railway Rules","A structured place for manuals, rules and circulars.",["Establishment rules","Leave and pass rules","Pay and allowance orders","Railway Board circulars"]],hi:["रेलवे नियम","मैनुअल, नियम एवं परिपत्र व्यवस्थित रखने का स्थान।",["स्थापना नियम","अवकाश एवं पास नियम","वेतन एवं भत्ता आदेश","रेलवे बोर्ड परिपत्र"]]},
  engineering:{en:["Engineering Tools","Track and Permanent Way reference resources.",["P-Way manual reference","Track maintenance procedures","Inspection and patrolling references","Engineering drawings and standards"]],hi:["इंजीनियरिंग संसाधन","ट्रैक एवं स्थायी पथ से संबंधित संदर्भ संसाधन।",["पी-वे मैनुअल संदर्भ","ट्रैक अनुरक्षण प्रक्रिया","निरीक्षण एवं पेट्रोलिंग संदर्भ","इंजीनियरिंग ड्राइंग एवं मानक"]]},
  documents:{en:["Documents & PDF","A central place for employee documents and useful PDFs.",["Personal document checklist","Service-related document list","Forms and applications","Reference PDFs"]],hi:["दस्तावेज एवं पीडीएफ","कर्मचारी दस्तावेजों एवं उपयोगी पीडीएफ के लिए केंद्रीय स्थान।",["व्यक्तिगत दस्तावेज जाँच सूची","सेवा संबंधी दस्तावेज सूची","प्रपत्र एवं आवेदन","संदर्भ पीडीएफ"]]},
  updates:{en:["Railway Updates","A place to organize official orders and notifications.",["Railway Board updates","Zone and division notices","Recruitment and promotion notices","Important circulars"]],hi:["रेलवे अपडेट","आधिकारिक आदेश एवं सूचनाएँ व्यवस्थित रखने का स्थान।",["रेलवे बोर्ड अपडेट","जोन एवं मंडल सूचनाएँ","भर्ती एवं पदोन्नति सूचनाएँ","महत्वपूर्ण परिपत्र"]]}
 };
 const data=catalog[page];if(!data){content.textContent="Module configuration unavailable.";return;}
 let lang="en";try{lang=localStorage.getItem("railwayMitraLanguage")==="hi"?"hi":"en";}catch{}
 const title=document.getElementById("moduleTitle"),desc=document.getElementById("moduleDescription"),list=document.getElementById("moduleItems"),toggle=document.getElementById("languageToggle");
 const render=()=>{const t=data[lang];document.documentElement.lang=lang;title.textContent=t[0];desc.textContent=t[1];list.replaceChildren();t[2].forEach(item=>{const li=document.createElement("li");li.textContent=item;list.append(li);});toggle.textContent=lang==="en"?"हिन्दी":"English";};
 toggle.addEventListener("click",()=>{lang=lang==="en"?"hi":"en";try{localStorage.setItem("railwayMitraLanguage",lang);}catch{}render();});
 render();
 const year=document.getElementById("moduleYear");if(year)year.textContent=new Date().getFullYear();
});