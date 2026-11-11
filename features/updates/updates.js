"use strict";
const translations={
 en:{kicker:"RAILWAY MITRA · EMPLOYEE SERVICES",title:"Railway Updates",intro:"Find railway circulars, employee notices and important deadlines in one place.",searchLabel:"Search updates",searchPlaceholder:"Search by RBE number or keyword…",clear:"Clear",categories:"Browse categories",all:"All updates",pay:"DA & Pay Commission",transfer:"Transfer notices",medical:"Medical & Pass",zone:"Zone & Division",other:"Other notices",noticeKicker:"LATEST INFORMATION",noticeTitle:"Notices & circulars",verifiedOnly:"Official-source first",emptyTitle:"No notices published here yet",emptyText:"This section is ready for verified notices. We will not display unverified dates, circular numbers or claims as official updates.",sourceKicker:"CHECK THE ORIGINAL ORDER",sourceTitle:"Official source directory",sourceText:"Always open the issuing authority’s original notice before relying on a rule, deadline or benefit.",disclaimer:"Railway Mitra is an independent app, not an official Indian Railways or Government of India service. Verify every notice with the relevant authority.",count:n=>n+" notices"},
 hi:{kicker:"रेलवे मित्र · कर्मचारी सेवाएँ",title:"रेलवे अपडेट",intro:"रेलवे परिपत्र, कर्मचारी सूचनाएँ और महत्वपूर्ण अंतिम तिथियाँ एक स्थान पर देखें।",searchLabel:"अपडेट खोजें",searchPlaceholder:"RBE नंबर या शब्द से खोजें…",clear:"हटाएँ",categories:"श्रेणियाँ देखें",all:"सभी अपडेट",pay:"महँगाई भत्ता एवं वेतन आयोग",transfer:"स्थानांतरण सूचनाएँ",medical:"मेडिकल एवं पास",zone:"जोन एवं मंडल",other:"अन्य सूचनाएँ",noticeKicker:"नवीनतम जानकारी",noticeTitle:"सूचनाएँ एवं परिपत्र",verifiedOnly:"आधिकारिक स्रोत प्राथमिकता",emptyTitle:"अभी कोई सूचना प्रकाशित नहीं है",emptyText:"यह भाग सत्यापित सूचनाओं के लिए तैयार है। अपुष्ट तिथियों, परिपत्र संख्याओं या दावों को आधिकारिक अपडेट के रूप में नहीं दिखाया जाएगा।",sourceKicker:"मूल आदेश अवश्य देखें",sourceTitle:"आधिकारिक स्रोत निर्देशिका",sourceText:"किसी नियम, अंतिम तिथि या लाभ पर भरोसा करने से पहले जारीकर्ता का मूल आदेश अवश्य खोलें।",disclaimer:"रेलवे मित्र स्वतंत्र ऐप है, भारतीय रेलवे या भारत सरकार की आधिकारिक सेवा नहीं। प्रत्येक सूचना संबंधित प्राधिकरण से सत्यापित करें।",count:n=>n+" सूचनाएँ"}
};
const categories=["all","rbe","pay","exam","transfer","medical","zone","other"];
// The feed intentionally starts empty. Only notices verified against an issuing authority
// should be added here; never invent circular numbers, publication dates or deadlines.
const notices=[];
const search=document.getElementById("updatesSearch"),list=document.getElementById("noticeList"),empty=document.getElementById("emptyState"),count=document.getElementById("resultCount");
let category="all",language="en";
try{language=localStorage.getItem("railwayMitraLanguage")==="hi"?"hi":"en";}catch{}
function renderLanguage(){
 const dict=translations[language];document.documentElement.lang=language;
 document.querySelectorAll("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.textContent=typeof dict[key]==="function"?dict[key](0):dict[key];});
 document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{const key=el.dataset.i18nPlaceholder;if(dict[key])el.placeholder=dict[key];});
 document.getElementById("updatesLanguage").textContent=language==="en"?"हिन्दी":"English";
 renderNotices();
}
function renderNotices(){
 const q=search.value.trim().toLocaleLowerCase();
 const filtered=notices.filter(n=>(category==="all"||n.category===category)&&[n.title,n.summary,n.number,n.keywords].join(" ").toLocaleLowerCase().includes(q));
 list.replaceChildren();
 filtered.forEach(n=>{
  const article=document.createElement("article");article.className="rm-notice-card";
  const meta=document.createElement("div");meta.className="rm-notice-meta";
  const tag=document.createElement("span");tag.className="rm-notice-tag";tag.textContent=n.category.toUpperCase();meta.append(tag);
  if(n.number){const num=document.createElement("span");num.textContent=n.number;meta.append(num);}
  if(n.date){const date=document.createElement("span");date.textContent=n.date;meta.append(date);}
  article.append(meta);
  const title=document.createElement("h3");title.textContent=n.title;article.append(title);
  const summary=document.createElement("p");summary.textContent=n.summary;article.append(summary);
  if(n.deadline){const deadline=document.createElement("p");deadline.className="rm-deadline";deadline.textContent=(language==="hi"?"अंतिम तिथि: ":"Last date: ")+n.deadline;article.append(deadline);}
  if(n.url){const link=document.createElement("a");link.href=n.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=language==="hi"?"मूल आदेश खोलें ↗":"Open original order ↗";article.append(link);}
  list.append(article);
 });
 count.textContent=translations[language].count(filtered.length);
 empty.hidden=filtered.length>0;
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
