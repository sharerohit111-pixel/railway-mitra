import {auth,db} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,doc,getDoc,getDocs,setDoc} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const gate=document.getElementById("backupGate"),app=document.getElementById("backupApp");
const $=id=>document.getElementById(id);
const HISTORY_KEY="railwayMitra.adminBackup.history.v1";
const SETTINGS_KEY="railwayMitra.settings.v1";
const MAX_FILE_BYTES=8*1024*1024;
let owner=null;

function say(text,error=false){$("backupMessage").textContent=text;$("backupMessage").style.color=error?"#fca5a5":"#78e8c1";}
function getHistory(){try{const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");return Array.isArray(x)?x:[];}catch(_){return [];}}
function renderHistory(){const h=getHistory();$("historyCount").textContent=h.length+" downloads";$("lastBackup").textContent=h[0]?.date?new Date(h[0].date).toLocaleString():"Not created yet";$("historyList").innerHTML=h.length?h.slice(0,10).map(x=>'<div class="rm-history-item"><span>'+new Date(x.date).toLocaleString()+'</span><span>'+Number(x.documents||0)+' Firestore docs · '+(x.action==="restore"?"Restored":"Downloaded")+'</span></div>').join(""):"<p>No backup history yet.</p>";}
function record(action,documents){const h=getHistory();h.unshift({date:new Date().toISOString(),action,documents});localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,20)));renderHistory();}
function safeJson(value){return JSON.parse(JSON.stringify(value,(_,v)=>v&&typeof v.toMillis==="function"?{__rmTimestampMillis:v.toMillis()}:v));}
async function readBackupData(){
 const uid=owner.uid;
 const [profileSnap,diarySnap]=await Promise.all([
  getDoc(doc(db,"users",uid,"employeeProfile","main")),
  getDocs(collection(db,"users",uid,"dutyDiary"))
 ]);
 const diary={};diarySnap.forEach(s=>diary[s.id]=safeJson(s.data()));
 let settings={};try{settings=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");}catch(_){}
 return {format:"railway-mitra-account-backup",version:1,createdAt:new Date().toISOString(),project:"railway-mitra",ownerUid:uid,scope:["users/{uid}/employeeProfile/main","users/{uid}/dutyDiary/*","this-device-settings"],data:{employeeProfile:profileSnap.exists()?safeJson(profileSnap.data()):null,dutyDiary:diary,deviceSettings:settings}};
}
$("downloadBackup").addEventListener("click",async()=>{
 const btn=$("downloadBackup");btn.disabled=true;say("Reading permitted account records…");
 try{
  const payload=await readBackupData();const json=JSON.stringify(payload,null,2);
  const blob=new Blob([json],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="railway-mitra-account-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  const count=Object.keys(payload.data.dutyDiary).length+(payload.data.employeeProfile?1:0);record("download",count);say("Backup downloaded. "+count+" Firestore documents included.");
 }catch(e){console.error(e);say("Backup failed: "+(e.message||"Firestore access error"),true);}finally{btn.disabled=false;}
});
function validateBackup(x){
 if(!x||x.format!=="railway-mitra-account-backup"||x.version!==1||x.project!=="railway-mitra"||!x.data||!x.data.dutyDiary||typeof x.data.dutyDiary!=="object"||Array.isArray(x.data.dutyDiary))throw new Error("This is not a supported Railway Mitra backup file.");
 if(x.ownerUid!==owner.uid)throw new Error("This backup belongs to a different account. Restore is blocked.");
 const ids=Object.keys(x.data.dutyDiary);if(ids.length>1000)throw new Error("Backup contains too many Duty Diary records (maximum 1,000).");
 for(const id of ids){if(!/^\d{4}-\d{2}-\d{2}$/.test(id))throw new Error("Invalid Duty Diary record ID: "+id);}
 if(x.data.employeeProfile!==null&&x.data.employeeProfile!==undefined&&(typeof x.data.employeeProfile!=="object"||Array.isArray(x.data.employeeProfile)))throw new Error("Invalid Employee Profile data.");
 if(x.data.deviceSettings!==undefined&&(typeof x.data.deviceSettings!=="object"||Array.isArray(x.data.deviceSettings)))throw new Error("Invalid Settings data.");
 return ids;
}
$("restoreFile").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>MAX_FILE_BYTES)throw new Error("File is too large. Maximum size is 8 MB.");
  const payload=JSON.parse(await file.text());const ids=validateBackup(payload);
  const profile=payload.data.employeeProfile;const total=ids.length+(profile?1:0);
  const confirmed=confirm("Restore this backup to the currently signed-in owner account?\n\nEmployee Profile: "+(profile?"replace":"unchanged")+"\nDuty Diary records: "+ids.length+"\nDevice Settings: "+(payload.data.deviceSettings?"replace":"unchanged")+"\n\nExisting matching records will be overwritten. Unrelated records will not be deleted.");
  if(!confirmed)return;
  say("Restoring permitted records…");
  for(let i=0;i<ids.length;i+=400){
   const batchIds=ids.slice(i,i+400);
   await Promise.all(batchIds.map(id=>setDoc(doc(db,"users",owner.uid,"dutyDiary",id),payload.data.dutyDiary[id])));
  }
  if(profile)await setDoc(doc(db,"users",owner.uid,"employeeProfile","main"),profile);
  if(payload.data.deviceSettings){localStorage.setItem(SETTINGS_KEY,JSON.stringify(payload.data.deviceSettings));}
  record("restore",total);say("Restore completed for "+total+" Firestore documents. Unrelated records were not deleted.");
 }catch(err){console.error(err);say("Restore failed: "+(err.message||"Unknown error"),true);}
 finally{e.target.value="";}
});
renderHistory();
onAuthStateChanged(auth,async user=>{
 app.hidden=true;owner=null;
 if(!user){gate.innerHTML="<h2>Sign-in required</h2><p>Please sign in with the owner account.</p>";return;}
 try{
  const token=await user.getIdTokenResult(true);
  if(token.claims.admin!==true)throw new Error("This account does not have Owner Admin permission.");
  owner=user;gate.innerHTML="<h2>✅ Owner access verified</h2><p>Backup controls are available.</p>";app.hidden=false;
 }catch(err){gate.innerHTML="<h2>⛔ Access denied</h2><p>"+String(err.message||"Owner permission required.").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+"</p>";}
});