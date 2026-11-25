(()=>{"use strict";
const KEY="railwayMitraLanguage";
const EN_HI={
"Where Is Your Train?":"आपकी ट्रेन कहाँ है?","Railway Mitra · Community movement reports":"रेलवे मित्र · सामुदायिक ट्रेन मूवमेंट रिपोर्ट","Home":"होम",
"Train movement, shared by railway employees":"रेलवे कर्मचारियों द्वारा साझा की गई ट्रेन मूवमेंट जानकारी",
"View estimated train progress and non-stop passing times based on station reports and the timetable.":"स्टेशन रिपोर्ट और समय-सारणी के आधार पर ट्रेन की अनुमानित स्थिति और बिना रुके गुजरने का समय देखें।",
"Community reports only · Not official live tracking · Not for railway operations or safety decisions.":"केवल सामुदायिक रिपोर्ट · आधिकारिक लाइव ट्रैकिंग नहीं · रेलवे संचालन या सुरक्षा निर्णयों के लिए नहीं।",
"ROUTE PROGRESS":"रूट की प्रगति","Waiting for report":"रिपोर्ट की प्रतीक्षा","No movement report yet":"अभी तक कोई मूवमेंट रिपोर्ट नहीं","Latest verified community report will appear here.":"नवीनतम सत्यापित सामुदायिक रिपोर्ट यहाँ दिखाई देगी।",
"Submit train movement":"ट्रेन मूवमेंट रिपोर्ट भेजें","EMPLOYEE REPORT":"कर्मचारी रिपोर्ट","Station":"स्टेशन","Direction":"दिशा","Train type":"ट्रेन का प्रकार","Movement type":"मूवमेंट का प्रकार",
"Train passed without stop":"बिना रुके ट्रेन गुजरी","Train halted":"ट्रेन रुकी","Train departed":"ट्रेन रवाना हुई","Departure KM":"प्रस्थान किलोमीटर",
"Report time (device clock)":"रिपोर्ट का समय (फोन की घड़ी)","Capturing…":"समय दर्ज हो रहा है…","5 km alert sound & vibration":"5 किमी अलर्ट ध्वनि और कंपन",
"Alarm test only. Live GPS alarm will activate after track-distance verification and background delivery setup.":"यह केवल अलार्म परीक्षण है। रूट से दूरी की पुष्टि और बैकग्राउंड अलर्ट सेटअप के बाद ही GPS अलर्ट उपलब्ध होगा।",
"📍 Enable duty mode & GPS alert":"📍 ड्यूटी मोड और GPS अलर्ट चालू करें","🔔 Test alarm & vibration":"🔔 अलार्म और कंपन जाँचें",
"Duty mode off · GPS not tracked":"ड्यूटी मोड बंद · GPS ट्रैक नहीं हो रहा","Duty mode off · GPS not active":"ड्यूटी मोड बंद · GPS सक्रिय नहीं",
"Submit report":"रिपोर्ट भेजें","Submitting securely…":"सुरक्षित रूप से भेजा जा रहा है…","Report submitted successfully. Thank you!":"रिपोर्ट सफलतापूर्वक भेज दी गई। धन्यवाद!",
"RECENT COMMUNITY UPDATES":"हाल की सामुदायिक अपडेट","Latest reports":"नवीनतम रिपोर्ट","↻ Refresh":"↻ रीफ्रेश","Loading reports…":"रिपोर्ट लोड हो रही हैं…","No community reports yet.":"अभी कोई सामुदायिक रिपोर्ट नहीं है।",
"Your report is associated with your signed-in Railway Mitra account. GPS is not uploaded continuously. Train speed values are estimates, not actual measured speeds.":"आपकी रिपोर्ट आपके Railway Mitra खाते से जुड़ी है। GPS लगातार अपलोड नहीं होता। ट्रेन की गति अनुमानित है, वास्तविक माप नहीं।",
"Please sign in to Railway Mitra first.":"कृपया पहले Railway Mitra में साइन इन करें।","Sign in to Railway Mitra to view employee reports.":"कर्मचारी रिपोर्ट देखने के लिए Railway Mitra में साइन इन करें।",
"Could not load reports. Check your internet connection and sign-in status.":"रिपोर्ट लोड नहीं हो सकीं। इंटरनेट और साइन-इन स्थिति जाँचें।",
"Enter a valid departure KM (0–158).":"प्रस्थान का सही किलोमीटर (0–158) दर्ज करें।","Your session has expired. Please sign in again.":"आपका सत्र समाप्त हो गया है। कृपया फिर से साइन इन करें।",
"Report could not be submitted. Please try again.":"रिपोर्ट भेजी नहीं जा सकी। कृपया दोबारा प्रयास करें।","UP · Lalgarh → Phalodi":"UP · लालगढ़ → फलोदी","DOWN · Phalodi → Lalgarh":"DOWN · फलोदी → लालगढ़",
"Passenger · 105 km/h (estimated)":"यात्री · 105 किमी/घंटा (अनुमानित)","Goods · 60 km/h (estimated)":"मालगाड़ी · 60 किमी/घंटा (अनुमानित)","e.g. 145":"उदाहरण: 145"
};
const HI_EN=Object.fromEntries(Object.entries(EN_HI).map(([en,hi])=>[hi,en]));
let lang="en";try{lang=localStorage.getItem(KEY)==="hi"?"hi":"en"}catch{}
const originals=new WeakMap();
const map=()=>lang==="hi"?EN_HI:HI_EN;
function translate(s){let out=s;const dict=map();Object.keys(dict).sort((a,b)=>b.length-a.length).forEach(k=>{out=out.split(k).join(dict[k])});return out}
function translateTree(root){
 if(!root)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){
  if(!node.nodeValue.trim()||/^(SCRIPT|STYLE)$/.test(node.parentElement?.tagName||""))continue;
  if(!originals.has(node))originals.set(node,node.nodeValue);
  const translated=translate(originals.get(node));if(node.nodeValue!==translated)node.nodeValue=translated;
 }
 root.querySelectorAll?.("input[placeholder]").forEach(el=>{if(!el.dataset.rmPlaceholder)el.dataset.rmPlaceholder=el.placeholder;el.placeholder=translate(el.dataset.rmPlaceholder)});
 document.documentElement.lang=lang;
 const button=document.getElementById("rmTrainLanguageToggle");
 if(button){button.textContent=lang==="en"?"हिंदी":"English";button.setAttribute("aria-label",lang==="en"?"हिंदी में बदलें":"Switch to English");button.setAttribute("aria-pressed",String(lang==="hi"))}
}
function setLanguage(value){if(!["en","hi"].includes(value))return;lang=value;try{localStorage.setItem(KEY,lang)}catch{}translateTree(document.body)}
function init(){
 if(matchMedia("(pointer:coarse)").matches||navigator.maxTouchPoints>0)document.body.classList.add("rm-touch-layout");
 let button=document.getElementById("rmTrainLanguageToggle");
 if(!button){button=document.createElement("button");button.id="rmTrainLanguageToggle";button.type="button";button.addEventListener("click",()=>setLanguage(lang==="en"?"hi":"en"));document.body.append(button)}
 translateTree(document.body);
 new MutationObserver(records=>{
  for(const record of records){
   for(const added of record.addedNodes){
    if(added.nodeType===1)translateTree(added);
    else if(added.nodeType===3&&added.nodeValue.trim()){
     const current=added.nodeValue;
     if(!originals.has(added)||current===translate(originals.get(added)))originals.set(added,current);
     const next=translate(originals.get(added));if(added.nodeValue!==next)added.nodeValue=next;
    }
   }
  }
 }).observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
window.RailwayMitraTrainLanguage={get:()=>lang,set:setLanguage};
})();