"use strict";
const translations={
 en:{kicker:"RAILWAY MITRA · EMPLOYEE SERVICES",title:"Railway Updates",intro:"Find railway circulars, employee notices and important deadlines in one place.",searchLabel:"Search updates",searchPlaceholder:"Search by RBE number or keyword…",clear:"Clear",categories:"Browse categories",all:"All news",rbe:"Official announcements",pay:"Pay & employee benefits",exam:"Recruitment & exams",safety:"Safety & operations",passenger:"Passenger & train services",zone:"Zones & projects",other:"Other updates",noticeKicker:"LATEST INFORMATION",noticeTitle:"Notices & circulars",verifiedOnly:"Official-source first",emptyTitle:"No notices published here yet",emptyText:"No verified notices are available in this section yet. Please check the official source directory below.",loadError:"Notices could not be loaded. Please try again later.",sourceKicker:"CHECK THE ORIGINAL ORDER",sourceTitle:"Official source directory",sourceText:"Always open the issuing authority’s original notice before relying on a rule, deadline or benefit.",disclaimer:"Railway Mitra is an independent app, not an official Indian Railways or Government of India service. Verify every notice with the relevant authority.",transfer:"Safety & operations",medical:"Passenger & train services",count:n=>n+" news items",feedUpdated:"Feed updated: ",rbSource:"Official announcements and releases ↗",irSource:"Official railway portal ↗",rrbSource:"Recruitment notices and results ↗",lastDate:"Last date: ",open:"Open original order ↗"},
 hi:{kicker:"रेलवे मित्र · कर्मचारी सेवाएँ",title:"रेलवे अपडेट",intro:"रेलवे परिपत्र, कर्मचारी सूचनाएँ और महत्वपूर्ण अंतिम तिथियाँ एक स्थान पर देखें।",searchLabel:"अपडेट खोजें",searchPlaceholder:"RBE नंबर या शब्द से खोजें…",clear:"हटाएँ",categories:"श्रेणियाँ देखें",all:"सभी समाचार",rbe:"आधिकारिक घोषणाएँ",pay:"वेतन एवं कर्मचारी लाभ",exam:"भर्ती एवं परीक्षाएँ",safety:"सुरक्षा एवं परिचालन",passenger:"यात्री एवं ट्रेन सेवाएँ",zone:"जोन एवं परियोजनाएँ",other:"अन्य अपडेट",noticeKicker:"नवीनतम जानकारी",noticeTitle:"सूचनाएँ एवं परिपत्र",verifiedOnly:"आधिकारिक स्रोत प्राथमिकता",emptyTitle:"अभी कोई सत्यापित सूचना उपलब्ध नहीं है",emptyText:"इस भाग में अभी सत्यापित सूचनाएँ उपलब्ध नहीं हैं। नीचे दी गई आधिकारिक स्रोत निर्देशिका देखें।",loadError:"सूचनाएँ लोड नहीं हो सकीं। कृपया बाद में पुनः प्रयास करें।",sourceKicker:"मूल आदेश अवश्य देखें",sourceTitle:"आधिकारिक स्रोत निर्देशिका",sourceText:"किसी नियम, अंतिम तिथि या लाभ पर भरोसा करने से पहले जारीकर्ता का मूल आदेश अवश्य खोलें।",disclaimer:"रेलवे मित्र स्वतंत्र ऐप है, भारतीय रेलवे या भारत सरकार की आधिकारिक सेवा नहीं। प्रत्येक सूचना संबंधित प्राधिकरण से सत्यापित करें।",feedUpdated:"फीड अपडेट: ",rbSource:"आधिकारिक घोषणाएँ एवं विज्ञप्तियाँ ↗",irSource:"आधिकारिक रेलवे पोर्टल ↗",rrbSource:"भर्ती सूचनाएँ एवं परिणाम ↗",transfer:"सुरक्षा एवं परिचालन",medical:"यात्री एवं ट्रेन सेवाएँ",count:n=>n+" समाचार",lastDate:"अंतिम तिथि: ",open:"मूल आदेश खोलें ↗"}
};
const categories=["all","rbe","pay","exam","transfer","medical","zone","other"];
let notices=[],loadFailed=false,category="all",language="en",feedUpdatedAt="";
const search=document.getElementById("updatesSearch"),list=document.getElementById("noticeList"),empty=document.getElementById("emptyState"),count=document.getElementById("resultCount");
try{language=localStorage.getItem("railwayMitraLanguage")==="hi"?"hi":"en";}catch{}
function safeText(value){return typeof value==="string"?value.trim():"";}
function validNotice(n){
 return n&&(n.verified===true||n.userProvided===true)&&categories.includes(n.category)&&n.category!=="all"&&
  safeText(n.id)&&safeText(n.titleEn)&&safeText(n.titleHi)&&safeText(n.summaryEn)&&safeText(n.summaryHi)&&
  safeText(n.sourceName)&&(n.userProvided===true||/^https:\/\//i.test(safeText(n.sourceUrl)))&&
  (!n.deadline||/^\d{4}-\d{2}-\d{2}$/.test(n.deadline));
}
async function loadNotices(){
 try{
  const response=await fetch("./notices.json",{cache:"no-store"});
  if(!response.ok)throw new Error("Feed request failed");
  const payload=await response.json();
  if(!payload||!Array.isArray(payload.notices))throw new Error("Invalid notice feed");
  notices=payload.notices.filter(validNotice);\n  feedUpdatedAt=/^\\d{4}-\\d{2}-\\d{2}$/.test(payload.updatedAt||"")?new Date(payload.updatedAt+"T00:00:00").toLocaleDateString(language==="hi"?"hi-IN":"en-IN",{day:"numeric",month:"long",year:"numeric"}):"";
  notices.sort((a,b)=>(safeText(b.publishedAt)).localeCompare(safeText(a.publishedAt)));
 }catch(error){loadFailed=true;console.error("Railway Updates feed:",error);}
 renderNotices();
}
function renderLanguage(){
 const dict=translations[language];document.documentElement.lang=language;
 document.querySelectorAll("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.textContent=typeof dict[key]==="function"?dict[key](0):dict[key];});
 document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{const key=el.dataset.i18nPlaceholder;if(dict[key])el.placeholder=dict[key];});
 document.getElementById("updatesLanguage").textContent=language==="en"?"हिन्दी":"English";
 const feed=document.getElementById("feedUpdated");if(feed)feed.textContent=dict.feedUpdated+feedUpdatedAt;
 renderNotices();
}
function renderNotices(){
 const q=search.value.trim().toLocaleLowerCase();
 const filtered=notices.filter(n=>(category==="all"||n.category===category)&&[n.titleEn,n.titleHi,n.summaryEn,n.summaryHi,n.rbeNumber,n.keywords].join(" ").toLocaleLowerCase().includes(q));
 list.replaceChildren();
 filtered.forEach(n=>{
  const article=document.createElement("article");article.className="rm-notice-card";
  const meta=document.createElement("div");meta.className="rm-notice-meta";
  const tag=document.createElement("span");tag.className="rm-notice-tag";tag.textContent=n.userProvided===true?(language==="hi"?"उपलब्ध PDF · सत्यापन शेष":"USER PDF · VERIFY"):n.category.toUpperCase();meta.append(tag);
  if(n.rbeNumber){const num=document.createElement("span");num.textContent=n.rbeNumber;meta.append(num);}
  if(n.publishedAt){const date=document.createElement("span");date.textContent=n.publishedAt;meta.append(date);}
  article.append(meta);
  const title=document.createElement("h3");title.textContent=language==="hi"?n.titleHi:n.titleEn;article.append(title);
  const summary=document.createElement("p");summary.textContent=language==="hi"?n.summaryHi:n.summaryEn;article.append(summary);
  if(n.deadline){const deadline=document.createElement("p");deadline.className="rm-deadline";deadline.textContent=translations[language].lastDate+n.deadline;article.append(deadline);}
  const source=document.createElement("p");source.className="rm-notice-meta";source.textContent=(language==="hi"?"स्रोत: ":"Source: ")+n.sourceName;article.append(source);
  if(/^https:\/\//i.test(safeText(n.sourceUrl))){const link=document.createElement("a");link.href=n.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent=translations[language].open;article.append(link);}else if(n.userProvided===true){const note=document.createElement("p");note.className="rm-notice-meta";note.textContent=language==="hi"?"मूल जारीकर्ता लिंक उपलब्ध नहीं है। उपयोग से पहले संबंधित कार्यालय से पुष्टि करें।":"Original issuing-authority link was not supplied. Confirm with the relevant office before relying on this information.";article.append(note);}
  list.append(article);
 });
 count.textContent=translations[language].count(filtered.length);
 empty.hidden=filtered.length>0;
 if(loadFailed){empty.hidden=false;empty.querySelector("p").textContent=translations[language].loadError;}
 else if(!filtered.length){empty.querySelector("p").textContent=translations[language].emptyText;}
}
document.getElementById("categoryFilters").addEventListener("click",event=>{
 const button=event.target.closest("button[data-category]");if(!button)return;
 category=categories.includes(button.dataset.category)?button.dataset.category:"all";
 document.querySelectorAll(".rm-category").forEach(el=>el.classList.toggle("active",el===button));
 renderNotices();
});
search.addEventListener("input",renderNotices);
document.getElementById("clearSearch").addEventListener("click",()=>{search.value="";category="all";document.querySelectorAll(".rm-category").forEach(el=>el.classList.toggle("active",el.dataset.category==="all"));renderNotices();search.focus();});
document.getElementById("updatesLanguage").addEventListener("click",()=>{language=language==="en"?"hi":"en";try{localStorage.setItem("railwayMitraLanguage",language);}catch{}renderLanguage();});
renderLanguage();
loadNotices();
