import { app, auth } from "../../assets/js/firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
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
  if(token.claims.admin!==true){
   message("प्रवेश की अनुमति नहीं है","इस खाते पर सर्वर द्वारा जारी admin=true अधिकार उपलब्ध नहीं है। सुरक्षा के लिए ईमेल या ब्राउज़र डेटा के आधार पर मालिकाना अधिकार नहीं दिया जाता।","error");
   return;
  }
  state.hidden=true;
  dashboard.hidden=false;
  await loadOwnerReport();
 }catch(error){
  message("पहचान सत्यापित नहीं हो सकी","कृपया दोबारा लॉगिन करें या बाद में प्रयास करें।","error");
  console.error("[Owner Analytics] Claim verification failed",error);
 }
});
async function loadOwnerReport(){
 const connection=document.getElementById("rmAnalyticsConnection");
 try{
  const functions=getFunctions(app,"asia-south1");
  const reportCall=httpsCallable(functions,"getOwnerAnalyticsSummary");
  const response=await reportCall({});
  const data=response.data||{};
  const cards=dashboard.querySelectorAll(".rm-owner-card");
  if(cards[0]) cards[0].querySelector("strong").textContent=String(data.realtimeActiveUsers ?? "—");
  if(cards[1]) cards[1].querySelector("strong").textContent=String(data.last7Days?.activeUsers ?? "—");
  if(cards[2]) cards[2].querySelector("strong").textContent=String(data.last7Days?.sessions ?? "—");
  if(cards[3]) cards[3].querySelector("strong").textContent=String(data.last7Days?.installPromptAccepted ?? "—");
  connection.textContent="GA4 Property "+data.propertyId+" से रिपोर्ट प्राप्त हुई। पिछले 7 दिनों के आँकड़े; अपडेट: "+new Date(data.generatedAt).toLocaleString();
  const list=document.createElement("ul");
  (data.topEvents||[]).forEach(item=>{const li=document.createElement("li");li.textContent=item.eventName+": "+item.eventCount;list.appendChild(li);});
  connection.appendChild(list);
 }catch(error){connection.textContent=error?.message||"Analytics रिपोर्ट अभी उपलब्ध नहीं है।";}
}