import {auth} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
export function requireOwner(onAllowed){
 const gate=document.getElementById("adminGate");
 const panel=document.getElementById("protectedPanel");
 if(panel)panel.hidden=true;
 onAuthStateChanged(auth,async user=>{
  if(!user){gate.innerHTML='<div class="exam-empty-icon">🔑</div><h3>Sign in required</h3><p>Owner sign-in is required.</p>';return;}
  try{
   const token=await user.getIdTokenResult(true);
   if(token.claims.admin!==true)throw new Error("Owner admin permission is missing.");
   gate.innerHTML='<div class="exam-empty-icon">✅</div><h3>Owner access verified</h3><p>Private controls are available.</p>';
   if(panel)panel.hidden=false;
   if(onAllowed)onAllowed(user);
  }catch(error){
   gate.innerHTML='<div class="exam-empty-icon">⛔</div><h3>Access denied</h3><p>'+String(error.message||"Owner permission required.").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</p>';
  }
 });
}