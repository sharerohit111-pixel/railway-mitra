import {auth} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const gate=document.getElementById("adminGate"),panel=document.getElementById("adminPanel");
const form=document.getElementById("noticeForm"),status=document.getElementById("publisherStatus"),list=document.getElementById("adminNoticeList");
const functions=getFunctions(undefined,"asia-south1");
const listNotices=httpsCallable(functions,"adminListRailwayNotices");
const saveNotice=httpsCallable(functions,"adminSaveRailwayNotice");
let owner=false;
const safe=value=>String(value||"").trim();
function showError(error){status.textContent=error?.message||"Request failed. Please try again.";status.className="rm-publisher-status error";}
async function refresh(){
 if(!owner)return;
 list.replaceChildren();
 try{
  const result=await listNotices({});
  const notices=Array.isArray(result.data?.notices)?result.data.notices:[];
  if(!notices.length){const p=document.createElement("p");p.textContent="No notices saved yet.";list.append(p);return;}
  notices.forEach(n=>{
   const card=document.createElement("article");card.className="rm-draft-item";
   const title=document.createElement("strong");title.textContent=n.titleEn||n.id;
   const meta=document.createElement("small");meta.textContent=[n.id,n.category,n.published?"Published":"Draft",n.publishedAt].join(" · ");
   card.append(title,meta);list.append(card);
  });
 }catch(error){showError(error);}
}
onAuthStateChanged(auth,async user=>{
 owner=false;panel.hidden=true;
 if(!user){gate.textContent="Sign in to Railway Mitra with the owner account to continue.";return;}
 try{
  const token=await user.getIdTokenResult(true);
  if(token.claims.admin!==true){gate.textContent="Access denied. This account does not have the server-verified admin permission.";return;}
  owner=true;gate.textContent="Owner permission verified. Server checks are applied to every save.";gate.className="rm-publisher-status success";panel.hidden=false;await refresh();
 }catch(error){gate.textContent="Could not verify owner access. Please sign in again.";}
});
form.addEventListener("submit",async event=>{
 event.preventDefault();if(!owner||!form.reportValidity())return;
 const data=Object.fromEntries(new FormData(form).entries());
 const sourceUrl=safe(data.sourceUrl);
 try{const url=new URL(sourceUrl);if(url.protocol!=="https:")throw new Error("Only HTTPS official source links are allowed.");}
 catch(error){showError(error);return;}
 if(!document.getElementById("verified").checked){showError(new Error("Confirm that you checked the original notice."));return;}
 if(data.deadline&&data.deadline<data.publishedAt){showError(new Error("Last date cannot be earlier than publication date."));return;}
 data.verified=true;data.published=document.getElementById("publishNow").checked;
 data.keywords=safe(data.keywords);data.rbeNumber=safe(data.rbeNumber);
 try{
  status.textContent="Saving through secure server…";
  const result=await saveNotice(data);
  status.textContent=result.data.published?"Notice published successfully.":"Notice saved as an unpublished draft.";
  status.className="rm-publisher-status success";form.reset();await refresh();
 }catch(error){showError(error);}
});
document.getElementById("refreshNotices").addEventListener("click",refresh);
