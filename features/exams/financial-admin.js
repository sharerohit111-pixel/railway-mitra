import {app} from "../../assets/js/firebase.js";
import {requireOwner} from "./admin-guard.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const fn=getFunctions(app,"asia-south1"),call=n=>httpsCallable(fn,n);
const api={get:call("adminGetFinanceSettings"),save:call("adminSaveFinanceSettings"),price:call("adminSetMaterialPrice"),record:call("adminRecordPayment"),list:call("adminListPayments"),approve:call("adminApprovePayment")};
const $=id=>document.getElementById(id),safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(id,s){$(id).textContent=s;}
async function load(){const d=(await api.get({})).data;$("subscriptionPrice").value=d.subscriptionPrice??300;$("subscriptionDays").value=d.subscriptionDays??30;}
async function payments(){msg("paymentStatus","Loading payment records…");try{const d=(await api.list({limit:100})).data;const root=$("paymentRecords");root.innerHTML=(d.payments||[]).map(p=>'<div class="exam-list-item"><div><strong>₹'+safe(p.amount)+' • '+safe(p.status)+'</strong><small>UID: '+safe(p.uid)+' • Ref: '+safe(p.reference)+' • '+safe(p.type)+'</small></div><span>'+safe(p.id)+'</span></div>').join("")||'<div class="exam-empty">No payment records yet.</div>';msg("paymentStatus","Loaded "+(d.payments||[]).length+" record(s).");}catch(e){msg("paymentStatus",e.message||"Could not load records.");}}
$("savePlan").onclick=async()=>{try{await api.save({subscriptionPrice:Number($("subscriptionPrice").value),subscriptionDays:Number($("subscriptionDays").value)});msg("planStatus","Subscription plan saved online.");}catch(e){msg("planStatus",e.message||"Save failed.");}};
$("saveMaterialPrice").onclick=async()=>{try{await api.price({fileId:$("materialFileId").value.trim(),price:Number($("materialPrice").value)});msg("materialStatus","PDF price saved online.");}catch(e){msg("materialStatus",e.message||"Save failed.");}};
$("recordPayment").onclick=async()=>{try{const d=(await api.record({uid:$("candidateUid").value.trim(),amount:Number($("paymentAmount").value),reference:$("paymentReference").value.trim(),type:$("paymentType").value,materialId:$("paymentMaterialId").value.trim()})).data;msg("paymentStatus","Pending record created: "+d.paymentId);await payments();}catch(e){msg("paymentStatus",e.message||"Could not record payment.");}};
$("approvePayment").onclick=async()=>{try{const d=(await api.approve({uid:$("candidateUid").value.trim(),reference:$("paymentReference").value.trim()})).data;msg("paymentStatus","Payment approved. Subscription expiry: "+d.expiresAt);await payments();}catch(e){msg("paymentStatus",e.message||"Approval failed.");}};
$("refreshPayments").onclick=payments;
requireOwner(async()=>{try{await load();await payments();}catch(e){msg("paymentStatus",e.message||"Finance settings unavailable.");}});
