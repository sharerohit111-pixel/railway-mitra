import {auth} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
const gate=document.getElementById("adminGate");
const sections=document.getElementById("adminSections");
onAuthStateChanged(auth,async user=>{
 sections.hidden=true;
 if(!user){gate.innerHTML='<div class="exam-empty-icon">🔑</div><h3>Sign in required</h3><p>Only the verified owner account can view Admin Workspace.</p>';return;}
 try{
  const token=await user.getIdTokenResult(true);
  if(token.claims.admin!==true)throw new Error("This account does not have owner admin permission.");
  gate.innerHTML='<div class="exam-empty-icon">✅</div><h3>Owner access verified</h3><p>Private admin sections are now available to this owner account.</p>';
  sections.hidden=false;
 }catch(error){
  gate.innerHTML='<div class="exam-empty-icon">⛔</div><h3>Access denied</h3><p>'+String(error.message||"Owner permission required.").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</p>';
 }
});