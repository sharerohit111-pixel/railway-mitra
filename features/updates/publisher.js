"use strict";
const form=document.getElementById("noticeForm");
const draftList=document.getElementById("draftList");
const status=document.getElementById("publisherStatus");
const exportButton=document.getElementById("exportJson");
const drafts=[];
const allowedCategories=new Set(["rbe","pay","exam","transfer","medical","zone","other"]);
const clean=value=>String(value||"").trim();
function renderDrafts(){
 draftList.replaceChildren();
 if(!drafts.length){const p=document.createElement("p");p.textContent="No drafts yet.";draftList.append(p);}
 drafts.forEach((item,index)=>{
  const card=document.createElement("article");card.className="rm-draft-item";
  const remove=document.createElement("button");remove.type="button";remove.className="rm-draft-remove";remove.textContent="Remove";remove.setAttribute("aria-label","Remove "+item.id);remove.addEventListener("click",()=>{drafts.splice(index,1);renderDrafts();});
  const title=document.createElement("strong");title.textContent=item.titleEn;
  const meta=document.createElement("small");meta.textContent=item.id+" · "+item.category+" · "+item.publishedAt;
  card.append(remove,title,meta);draftList.append(card);
 });
 exportButton.disabled=!drafts.length;
 status.textContent=drafts.length?drafts.length+" draft record(s) ready for export.":"No draft records added.";
}
form.addEventListener("submit",event=>{
 event.preventDefault();
 if(!form.reportValidity())return;
 const data=Object.fromEntries(new FormData(form).entries());
 data.id=clean(data.id);data.category=clean(data.category);
 data.titleEn=clean(data.titleEn);data.titleHi=clean(data.titleHi);
 data.summaryEn=clean(data.summaryEn);data.summaryHi=clean(data.summaryHi);
 data.rbeNumber=clean(data.rbeNumber);data.sourceName=clean(data.sourceName);
 data.sourceUrl=clean(data.sourceUrl);data.publishedAt=clean(data.publishedAt);
 data.deadline=clean(data.deadline);data.keywords=clean(data.keywords);
 let url;
 try{url=new URL(data.sourceUrl);}catch{status.textContent="Enter a valid official HTTPS URL.";return;}
 if(url.protocol!=="https:"||url.hostname==="example.gov.in"||url.hostname==="example.com"){status.textContent="Only a real HTTPS source URL can be submitted.";return;}
 if(!allowedCategories.has(data.category)){status.textContent="Choose a valid notice category.";return;}
 if(data.deadline&&data.deadline<data.publishedAt){status.textContent="The last date cannot be earlier than the publication date.";return;}
 if(drafts.some(item=>item.id===data.id)){status.textContent="This notice ID already exists in the draft list.";return;}
 data.verified=true;
 data.keywords=data.keywords.split(",").map(x=>x.trim()).filter(Boolean).join(", ");
 drafts.push(data);
 form.reset();renderDrafts();
});
exportButton.addEventListener("click",()=>{
 if(!drafts.length)return;
 const payload={version:1,updatedAt:new Date().toISOString(),notices:drafts};
 const blob=new Blob([JSON.stringify(payload,null,2)+"\n"],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download="notices-draft.json";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 status.textContent="JSON exported. A maintainer must review it and merge records into notices.json before they appear in the app.";
});
document.getElementById("clearDrafts").addEventListener("click",()=>{drafts.splice(0,drafts.length);renderDrafts();});
renderDrafts();
