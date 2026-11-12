import {auth,db} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,doc,getDoc,getDocs,setDoc,writeBatch,Timestamp} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const gate=document.getElementById("backupGate"),app=document.getElementById("backupApp");
const $=id=>document.getElementById(id);
const HISTORY_KEY="railwayMitra.adminBackup.history.v1";
const SETTINGS_KEY="railwayMitra.settings.v1";
const MAX_FILE_BYTES=8*1024*1024;
const MAX_DIARY_RECORDS=1000;
let owner=null;

function say(text,error=false){$("backupMessage").textContent=text;$("backupMessage").style.color=error?"#fca5a5":"#78e8c1";}
function getHistory(){try{const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");return Array.isArray(x)?x:[];}catch(_){return [];}}
function renderHistory(){
 const h=getHistory();
 $("historyCount").textContent=h.length+" entries";
 $("lastBackup").textContent=h[0]?.date?new Date(h[0].date).toLocaleString():"Not created yet";
 const list=$("historyList");list.replaceChildren();
 if(!h.length){const p=document.createElement("p");p.textContent="No backup history yet.";list.appendChild(p);return;}
 h.slice(0,10).forEach(x=>{
  const row=document.createElement("div");row.className="rm-history-item";
  const left=document.createElement("span");left.textContent=Number.isFinite(Date.parse(x.date))?new Date(x.date).toLocaleString():"Unknown date";
  const right=document.createElement("span");right.textContent=Number(x.documents||0)+" Firestore docs · "+(x.action==="restore"?"Restored":"Downloaded");
  row.append(left,right);list.appendChild(row);
 });
}
function record(action,documents){const h=getHistory();h.unshift({date:new Date().toISOString(),action,documents});localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,20)));renderHistory();}

// Convert Firestore Timestamp instances before JSON.stringify invokes their toJSON method.
function encodeFirestoreValues(value){
 if(value&&typeof value.toMillis==="function"&&typeof value.toDate==="function"){
  return {__rmType:"firestore-timestamp",milliseconds:value.toMillis()};
 }
 if(Array.isArray(value))return value.map(encodeFirestoreValues);
 if(value&&typeof value==="object"){
  const out={};for(const [key,item] of Object.entries(value))out[key]=encodeFirestoreValues(item);return out;
 }
 return value;
}
function decodeFirestoreValues(value){
 if(Array.isArray(value))return value.map(decodeFirestoreValues);
 if(value&&typeof value==="object"){
  if(value.__rmType==="firestore-timestamp"&&Number.isFinite(value.milliseconds))return Timestamp.fromMillis(value.milliseconds);
  // Backward compatibility for older v1 backups where Timestamp.toJSON() ran first.
  if(value.type==="firestore/timestamp/1.0"&&Number.isFinite(value.seconds))return new Timestamp(value.seconds,Number(value.nanoseconds||0));
  const out={};for(const [key,item] of Object.entries(value))out[key]=decodeFirestoreValues(item);return out;
 }
 return value;
}
function parseLocalSettings(){
 try{const value=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
 catch(_){return {};}
}
async function readBackupData(){
 const uid=owner.uid;
 const [profileSnap,diarySnap]=await Promise.all([
  getDoc(doc(db,"users",uid,"employeeProfile","main")),
  getDocs(collection(db,"users",uid,"dutyDiary"))
 ]);
 if(diarySnap.size>MAX_DIARY_RECORDS)throw new Error("Duty Diary has more than "+MAX_DIARY_RECORDS+" records. Export is stopped to keep the backup manageable.");
 const diary={};diarySnap.forEach(s=>diary[s.id]=encodeFirestoreValues(s.data()));
 return {format:"railway-mitra-account-backup",version:2,createdAt:new Date().toISOString(),project:"railway-mitra",ownerUid:uid,scope:["users/{uid}/employeeProfile/main","users/{uid}/dutyDiary/*","this-device-local-settings"],data:{employeeProfile:profileSnap.exists()?encodeFirestoreValues(profileSnap.data()):null,dutyDiary:diary,deviceSettings:parseLocalSettings()}};
}
$("downloadBackup").addEventListener("click",async()=>{
 const btn=$("downloadBackup");btn.disabled=true;say("Reading permitted account records…");
 try{
  const payload=await readBackupData();const json=JSON.stringify(payload,null,2);
  const blob=new Blob([json],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="railway-mitra-account-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  const count=Object.keys(payload.data.dutyDiary).length+(payload.data.employeeProfile?1:0);record("download",count);say("Backup downloaded. "+count+" Firestore documents included.");
 }catch(e){console.error(e);say("Backup failed: "+(e.message||"Firestore access error"),true);}finally{btn.disabled=false;}
});
function validateBackup(x){
 if(!x||x.format!=="railway-mitra-account-backup"||![1,2].includes(x.version)||x.project!=="railway-mitra"||!x.data||!x.data.dutyDiary||typeof x.data.dutyDiary!=="object"||Array.isArray(x.data.dutyDiary))throw new Error("This is not a supported Railway Mitra backup file.");
 if(x.ownerUid!==owner.uid)throw new Error("This backup belongs to a different account. Restore is blocked.");
 const ids=Object.keys(x.data.dutyDiary);if(ids.length>MAX_DIARY_RECORDS)throw new Error("Backup contains too many Duty Diary records (maximum "+MAX_DIARY_RECORDS+").");
 for(const id of ids){if(!/^\d{4}-\d{2}-\d{2}$/.test(id))throw new Error("Invalid Duty Diary record ID: "+id);}
 if(x.data.employeeProfile!==null&&x.data.employeeProfile!==undefined&&(typeof x.data.employeeProfile!=="object"||Array.isArray(x.data.employeeProfile)))throw new Error("Invalid Employee Profile data.");
 if(x.data.deviceSettings!==undefined&&(!x.data.deviceSettings||typeof x.data.deviceSettings!=="object"||Array.isArray(x.data.deviceSettings)))throw new Error("Invalid local Settings data.");
 return ids;
}
$("restoreFile").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 const input=e.target;
 try{
  if(file.size>MAX_FILE_BYTES)throw new Error("File is too large. Maximum size is 8 MB.");
  const payload=JSON.parse(await file.text());const ids=validateBackup(payload);
  const profile=payload.data.employeeProfile;const hasSettings=Object.prototype.hasOwnProperty.call(payload.data,"deviceSettings");
  const total=ids.length+(profile?1:0);
  const confirmed=confirm("Restore this backup to the currently signed-in owner account?\n\nEmployee Profile: "+(profile?"replace":"unchanged")+"\nDuty Diary records: "+ids.length+"\nDevice Settings: "+(hasSettings?"replace":"unchanged")+"\n\nExisting matching records will be overwritten. Unrelated records will not be deleted.");
  if(!confirmed)return;
  const restoreDiary=ids.map(id=>[id,decodeFirestoreValues(payload.data.dutyDiary[id])]);
  const restoreProfile=profile?decodeFirestoreValues(profile):null;
  say("Restoring permitted records…");
  // Use Firestore batches (max 500 writes each) so a failed batch is atomic.
  for(let i=0;i<restoreDiary.length;i+=450){
   const batch=writeBatch(db);
   for(const [id,data] of restoreDiary.slice(i,i+450))batch.set(doc(db,"users",owner.uid,"dutyDiary",id),data);
   await batch.commit();
  }
  if(restoreProfile)await setDoc(doc(db,"users",owner.uid,"employeeProfile","main"),restoreProfile);
  if(hasSettings)localStorage.setItem(SETTINGS_KEY,JSON.stringify(payload.data.deviceSettings));
  record("restore",total);say("Restore completed for "+total+" Firestore documents. Unrelated records were not deleted.");
 }catch(err){console.error(err);say("Restore failed: "+(err.message||"Unknown error"),true);}
 finally{input.value="";}
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
