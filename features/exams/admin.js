import {app,auth} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const gate=document.getElementById("adminGate"),form=document.getElementById("publishForm"),status=document.getElementById("adminStatus");
const publish=httpsCallable(getFunctions(app,"asia-south1"),"adminPublishTest");
onAuthStateChanged(auth,async user=>{
 if(!user){gate.innerHTML='<div class="exam-empty-icon">🔑</div><h3>Sign in required</h3><p>Sign in to Railway Mitra first. Only the owner account with a trusted admin claim can use this panel.</p>';return;}
 try{const token=await user.getIdTokenResult(true);if(token.claims.admin!==true)throw new Error("This account does not have the owner admin role.");gate.innerHTML='<div class="exam-empty-icon">✅</div><h3>Owner access verified</h3><p>Publishing actions are protected again by the Firebase callable backend.</p>';form.hidden=false;}
 catch(error){gate.innerHTML='<div class="exam-empty-icon">⛔</div><h3>Access denied</h3><p>'+String(error.message||"Owner permission required.").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</p>';}
});
form.addEventListener("submit",async event=>{
 event.preventDefault();status.textContent="Validating questions and sending to secure Firebase…";status.classList.remove("error");
 const data=new FormData(form);
 try{
  const questions=JSON.parse(String(data.get("questions")));
  if(!Array.isArray(questions))throw new Error("Questions must be a JSON array.");
  const streamId=String(data.get("streamId"));
  const streamTitle={ "gdce-je-civil":"GDCE JE Civil Engineering","gdce-je-electrical":"GDCE JE Electrical Engineering","gdce-je-mechanical":"GDCE JE Mechanical Engineering","gdce-train-manager":"GDCE Train Manager" }[streamId];
  const response=await publish({test:{
   testId:String(data.get("testId")).trim(),title:String(data.get("title")).trim(),streamId,streamTitle,
   category:String(data.get("category")),durationMinutes:Number(data.get("durationMinutes")),
   positiveMarksPerQuestion:Number(data.get("positiveMarksPerQuestion")),
   negativeMarksPerWrongAnswer:Number(data.get("negativeMarksPerWrongAnswer")),
   published:true,questions
  }});
  status.textContent="Success: "+response.data.testId+" — "+response.data.totalQuestions+" verified questions stored. Access: "+response.data.access.toUpperCase()+". Published: "+(response.data.published?"Yes":"No");
  form.reset();
 }catch(error){status.textContent=error.message||"Could not publish this test.";status.classList.add("error");}
});