import { app, auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const functions = getFunctions(app, "asia-south1");
const call = name => httpsCallable(functions, name);
const gate = document.getElementById("fbAuthGate");
const appArea = document.getElementById("fbApp");
const form = document.getElementById("feedbackForm");
const message = document.getElementById("fbMessage");
const list = document.getElementById("fbList");
const thread = document.getElementById("fbThread");
let currentFeedbackId = null;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function readableError(error) {
  const code = error && error.code ? String(error.code) : "";
  if (code.includes("unauthenticated")) return "Please sign in again to continue.";
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return "Service is temporarily unavailable. Please try again shortly.";
  return error && error.message ? error.message.replace(/^FirebaseError:\s*/,"") : "Something went wrong. Please try again.";
}
function formatDate(ms) {
  if (!ms) return "Just now";
  return new Date(ms).toLocaleString([], { dateStyle:"medium", timeStyle:"short" });
}
async function loadFeedback() {
  list.replaceChildren(el("p","rm-fb-muted","Loading your feedback..."));
  thread.hidden = true;
  try {
    const result = await call("listMyUserFeedback")({});
    const items = (result.data.feedback || []).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    list.replaceChildren();
    if (!items.length) {
      list.append(el("p","rm-fb-muted","You have not sent feedback yet. Your submissions and replies will appear here."));
      return;
    }
    items.forEach(item => {
      const card=el("article","rm-fb-ticket");
      const top=el("div","rm-fb-ticket-top");
      top.append(el("strong","",item.subject || item.category));
      top.append(el("span","rm-fb-status "+(item.status||"open"),({open:"Open",replied:"Reply received",resolved:"Resolved"})[item.status]||"Open"));
      card.append(top);
      card.append(el("p","",item.details || ""));
      const meta=el("div","rm-fb-ticket-meta");
      meta.append(el("span","",item.category),el("span","", "★ "+(item.rating||0)+"/5"),el("span","",formatDate(item.createdAt)));
      card.append(meta);
      const btn=el("button","rm-fb-open-thread","View conversation");
      btn.type="button"; btn.addEventListener("click",()=>openThread(item.id));
      card.append(btn); list.append(card);
    });
  } catch(error) {
    list.replaceChildren(el("p","rm-fb-muted",readableError(error)));
  }
}
async function openThread(id) {
  currentFeedbackId=id;
  thread.hidden=false;
  thread.replaceChildren(el("p","rm-fb-muted","Loading conversation..."));
  try {
    const result=await call("getUserFeedbackThread")({feedbackId:id});
    const data=result.data;
    thread.replaceChildren();
    thread.append(el("h3","","Conversation"));
    const messages=el("div","rm-fb-messages");
    (data.messages||[]).forEach(item=>{
      const bubble=el("div","rm-fb-bubble "+(item.senderRole==="admin"?"admin":"user"));
      bubble.append(el("strong","",item.senderRole==="admin"?"Railway Mitra Support":"You"));
      bubble.append(el("p","",item.message));
      bubble.append(el("small","",formatDate(item.createdAt)));
      messages.append(bubble);
    });
    thread.append(messages);
    const replyForm=el("form","rm-fb-reply-form");
    const input=el("textarea","rm-fb-reply-input"); input.rows=3; input.maxLength=1800; input.required=true; input.placeholder="Write your reply...";
    const btn=el("button","rm-fb-primary","Send Reply"); btn.type="submit";
    replyForm.append(input,btn);
    replyForm.addEventListener("submit",async event=>{
      event.preventDefault(); btn.disabled=true;
      try { await call("replyToUserFeedback")({feedbackId:id,message:input.value.trim()}); await openThread(id); await loadFeedbackListOnly(); }
      catch(error){ alert(readableError(error)); btn.disabled=false; }
    });
    thread.append(replyForm);
    thread.scrollIntoView({behavior:"smooth",block:"nearest"});
  } catch(error) { thread.replaceChildren(el("p","rm-fb-muted",readableError(error))); }
}
async function loadFeedbackListOnly() { await loadFeedback(); }
form.addEventListener("submit",async event=>{
  event.preventDefault();
  const btn=document.getElementById("fbSubmit"); btn.disabled=true;
  message.textContent="Sending your feedback...";
  try {
    const payload={
      category:document.getElementById("fbCategory").value,
      rating:Number(form.querySelector('input[name="fbRating"]:checked')?.value||5),
      subject:document.getElementById("fbSubject").value.trim(),
      details:document.getElementById("fbDetails").value.trim()
    };
    await call("submitUserFeedback")(payload);
    form.reset();
    form.querySelector('input[name="fbRating"][value="5"]').checked=true;
    message.textContent="Thank you! Your feedback has been sent. You can follow replies below.";
    await loadFeedback();
  } catch(error) { message.textContent=readableError(error); }
  finally { btn.disabled=false; }
});
document.getElementById("fbRefresh").addEventListener("click",loadFeedback);
onAuthStateChanged(auth,user=>{
  gate.hidden=!!user; appArea.hidden=!user;
  if(user) loadFeedback();
});
