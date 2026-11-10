import {app,auth} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const gate=document.getElementById("adminGate"),form=document.getElementById("publishForm"),status=document.getElementById("adminStatus");
const publish=httpsCallable(getFunctions(app,"asia-south1"),"adminPublishTest");
const importButton=document.getElementById("loadCivil2026");
const importStatus=document.getElementById("importStatus");
importButton.addEventListener("click",async()=>{
 importButton.disabled=true;importStatus.classList.remove("error");importStatus.textContent="Loading prepared paper…";
 try{
  const response=await fetch("./data/gdce-je-civil-previous-2026.json",{cache:"no-store"});
  if(!response.ok)throw new Error("Prepared question bank could not be loaded ("+response.status+").");
  const paper=await response.json();
  if(!Array.isArray(paper.questions)||paper.questions.length!==150)throw new Error("The prepared paper must contain exactly 150 questions.");
  const fields=form.elements;
  fields.testId.value=paper.testId;
  fields.title.value=paper.title;
  fields.streamId.value=paper.streamId;
  fields.category.value=paper.category;
  fields.sourceLabel.value=paper.sourceLabel;
  fields.sourceYear.value=paper.sourceYear;
  fields.durationMinutes.value=paper.durationMinutes;
  fields.positiveMarksPerQuestion.value=paper.positiveMarksPerQuestion;
  fields.negativeMarksPerWrongAnswer.value=paper.negativeMarksPerWrongAnswer;
  fields.questions.value=JSON.stringify(paper.questions,null,2);
  importStatus.textContent="Loaded "+paper.questions.length+" questions. Review the source note and then select Validate & Publish Test.";
 }catch(error){importStatus.textContent=error.message||"Could not load the prepared paper.";importStatus.classList.add("error");}
 finally{importButton.disabled=false;}
});

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
  const streamTitle={ "gdce-je-civil":"GDCE JE Civil Engineering","gdce-je-electrical":"GDCE JE Electrical Engineering","gdce-je-mechanical":"GDCE JE Mechanical Engineering","gdce-train-manager":"GDCE Train Manager","ldce-je-civil":"LDCE JE Civil Engineering","ldce-je-electrical":"LDCE JE Electrical Engineering","ldce-je-mechanical":"LDCE JE Mechanical Engineering","ldce-other-posts":"LDCE Other Departmental Posts" }[streamId];
  if(!streamTitle)throw new Error("Please select a valid GDCE or LDCE stream.");
  const response=await publish({test:{
   testId:String(data.get("testId")).trim(),title:String(data.get("title")).trim(),streamId,streamTitle,
   category:String(data.get("category")),sourceLabel:String(data.get("sourceLabel")||"").trim(),sourceYear:data.get("sourceYear")?Number(data.get("sourceYear")):null,durationMinutes:Number(data.get("durationMinutes")),
   positiveMarksPerQuestion:Number(data.get("positiveMarksPerQuestion")),
   negativeMarksPerWrongAnswer:Number(data.get("negativeMarksPerWrongAnswer")),
   published:true,questions
  }});
  status.textContent="Success: "+response.data.testId+" — "+response.data.totalQuestions+" verified questions stored. Access: "+response.data.access.toUpperCase()+". Published: "+(response.data.published?"Yes":"No");
  form.reset();
 }catch(error){status.textContent=error.message||"Could not publish this test.";status.classList.add("error");}
});