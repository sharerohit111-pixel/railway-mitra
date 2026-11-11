import { app, auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const input=document.getElementById("confirmText");
const checkbox=document.getElementById("confirmCheck");
const button=document.getElementById("deleteBtn");
const status=document.getElementById("status");
let signedInUser=null;
function refresh(){button.disabled=!(signedInUser&&input.value.trim()==="DELETE"&&checkbox.checked);}
onAuthStateChanged(auth,user=>{signedInUser=user||null;status.textContent=user?"Signed in as "+(user.email||user.phoneNumber||"your account"):"Please sign in before requesting account deletion.";refresh();});
input.addEventListener("input",refresh);checkbox.addEventListener("change",refresh);
button.addEventListener("click",async()=>{
 if(!signedInUser||input.value.trim()!=="DELETE"||!checkbox.checked)return;
 if(!window.confirm("Permanently delete your Railway Mitra account and covered cloud data? This cannot be undone."))return;
 button.disabled=true;status.textContent="Processing secure deletion request…";
 try{
  const call=httpsCallable(getFunctions(app,"asia-south1"),"deleteMyAccount");
  const result=await call({confirmation:"DELETE"});
  try{localStorage.removeItem("railwayMitra.employeeProfile.v1");}catch(_){}
  status.textContent="Account deleted. Payment records retained for required accounting or legal purposes: "+Number(result.data.retainedPaymentRecords||0)+".";
  setTimeout(()=>{window.location.href="../../index.html";},1800);
 }catch(error){
  const code=String(error?.code||"");
  status.textContent=code.includes("failed-precondition")?"For security, sign out and sign in again, then retry.":(error?.message||"Deletion could not be completed. Please try again or contact support.");
  button.disabled=false;
 }
});