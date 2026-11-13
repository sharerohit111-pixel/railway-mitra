import { auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged, getIdTokenResult } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const state=document.getElementById("rmOwnerState");
const dashboard=document.getElementById("rmOwnerDashboard");
function message(title,detail,kind="info"){
 state.dataset.kind=kind;
 state.replaceChildren();
 const strong=document.createElement("strong");strong.textContent=title;
 const p=document.createElement("p");p.textContent=detail;
 state.append(strong,p);
}
onAuthStateChanged(auth,async(user)=>{
 if(!user){
  message("लॉगिन आवश्यक है","पहले Railway Mitra में लॉगिन करें। फिर Owner Dashboard खोलें।","error");
  return;
 }
 try{
  const token=await getIdTokenResult(user,true);
  if(token.claims.owner!==true){
   message("प्रवेश की अनुमति नहीं है","इस खाते पर सर्वर द्वारा जारी owner=true अधिकार उपलब्ध नहीं है। सुरक्षा के लिए ईमेल या ब्राउज़र डेटा के आधार पर मालिकाना अधिकार नहीं दिया जाता।","error");
   return;
  }
  state.hidden=true;
  dashboard.hidden=false;
 }catch(error){
  message("पहचान सत्यापित नहीं हो सकी","कृपया दोबारा लॉगिन करें या बाद में प्रयास करें।","error");
  console.error("[Owner Analytics] Claim verification failed",error);
 }
});