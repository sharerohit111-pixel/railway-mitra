import {app} from "../../assets/js/firebase.js";
import {requireOwner} from "./admin-guard.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const call=httpsCallable(getFunctions(app,"asia-south1"),"adminListExamAttempts");
const $=id=>document.getElementById(id),safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function load(){const list=$("recordsList"),status=$("recordsStatus");status.textContent="Loading submitted attempts…";list.innerHTML="";try{const d=(await call({limit:200})).data,rows=d.attempts||[];list.innerHTML=rows.map(x=>'<article class="record-card"><div><strong>'+safe(x.testId)+'</strong><small>Candidate UID: '+safe(x.uid)+'</small><small>Attempt: '+safe(x.attemptId)+'</small></div><div class="record-stats"><span>Score <b>'+safe(x.score??"—")+'</b></span><span>Accuracy <b>'+safe(x.accuracy??"—")+'%</b></span><span>Correct <b>'+safe(x.correct??"—")+'</b></span><span>Wrong <b>'+safe(x.wrong??"—")+'</b></span><span>Unattempted <b>'+safe(x.unattempted??"—")+'</b></span></div><small>'+safe(x.submittedAt?new Date(x.submittedAt).toLocaleString():"Submitted time unavailable")+'</small></article>').join("")||'<div class="exam-empty">No submitted attempts found yet.</div>';status.textContent="Showing "+rows.length+" most recent submitted attempt(s).";}catch(e){status.textContent=e.message||"Could not load candidate records.";}}
$("refreshRecords").onclick=load;
requireOwner(()=>load());
