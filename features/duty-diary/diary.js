import { auth, db } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { collection, doc, getDocs, onSnapshot, setDoc, deleteDoc, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

"use strict";
const $ = id => document.getElementById(id);
const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdays = ["Mo","Tu","We","Th","Fr","Sa","Su"];
let currentDate = new Date(), selectedDate = new Date(), diaryRecords = {}, activeUid = null, unsubscribeRecords = null, saving = false;
const keyOf = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const localKey = uid => "railway_diary_data_v1_" + uid;
const recordsRef = uid => collection(db,"users",uid,"dutyDiary");
function showMessage(t,error=false){$("diaryMessage").textContent=t;$("diaryMessage").style.color=error?"#ff9999":"#8fe9c2";}
function setSync(t){$("recordSyncStatus").textContent=t;}
function readLocal(uid){try{return JSON.parse(localStorage.getItem(localKey(uid))||"{}")}catch(e){return {};}}
function writeLocal(){if(activeUid)localStorage.setItem(localKey(activeUid),JSON.stringify(diaryRecords));}
function defaultRecord(){return {dutyType:"Day Duty",isTaApplicable:false,taHours:0,taRemarks:"",ndaHours:0,ndaRemarks:"",otaHours:0,otaRemarks:"",kmaPoints:0,kmaRemarks:"",generalNotes:""};}
function numeric(id){const n=Number($(id).value);return Number.isFinite(n)&&n>0?n:0;}
function readForm(){return {dutyType:$("duty-type").value,isTaApplicable:$("is-ta").checked,taHours:numeric("ta-hours"),taRemarks:$("ta-remarks").value.trim(),ndaHours:numeric("nda-hours"),ndaRemarks:$("nda-remarks").value.trim(),otaHours:numeric("ota-hours"),otaRemarks:$("ota-remarks").value.trim(),kmaPoints:numeric("kma-points"),kmaRemarks:$("kma-remarks").value.trim(),generalNotes:$("general-notes").value.trim(),updatedAt:new Date().toISOString()};}
function toggleTaFields(){$("ta-fields").hidden=!$("is-ta").checked;}
function renderCalendar(){
 const grid=$("days-grid");grid.replaceChildren();
 weekdays.forEach(name=>{const el=document.createElement("div");el.className="day-name";el.textContent=name;grid.appendChild(el);});
 $("calendar-title").textContent=months[currentDate.getMonth()]+" "+currentDate.getFullYear();
 const first=new Date(currentDate.getFullYear(),currentDate.getMonth(),1).getDay(),offset=first===0?6:first-1;
 for(let i=0;i<offset;i++)grid.appendChild(document.createElement("div"));
 const last=new Date(currentDate.getFullYear(),currentDate.getMonth()+1,0).getDate();
 for(let day=1;day<=last;day++){const date=new Date(currentDate.getFullYear(),currentDate.getMonth(),day),key=keyOf(date),el=document.createElement("button");el.type="button";el.className="calendar-day";el.textContent=String(day);if(diaryRecords[key])el.classList.add("has-data");if(key===keyOf(selectedDate))el.classList.add("selected");el.addEventListener("click",()=>selectDate(day));grid.appendChild(el);}
 updateMonthlySummary();
}
function updateMonthlySummary(){
 const prefix=currentDate.getFullYear()+"-"+String(currentDate.getMonth()+1).padStart(2,"0");let ta=0,nda=0,ota=0,kma=0;
 Object.keys(diaryRecords).forEach(key=>{if(!key.startsWith(prefix))return;const r=diaryRecords[key];if(r.isTaApplicable)ta++;nda+=Number(r.ndaHours)||0;ota+=Number(r.otaHours)||0;kma+=Number(r.kmaPoints)||0;});
 $("summary-month-title").textContent=months[currentDate.getMonth()]+" "+currentDate.getFullYear();
 $("sum-ta").textContent=ta;$("sum-nda").textContent=nda;$("sum-ota").textContent=ota;$("sum-kma").textContent=kma;
}
function loadDayData(date){
 const key=keyOf(date),r=Object.assign(defaultRecord(),diaryRecords[key]||{});
 $("form-date-title").textContent="Daily Record: "+key;
 $("duty-type").value=r.dutyType;$("is-ta").checked=!!r.isTaApplicable;
 const fields={"ta-hours":"taHours","ta-remarks":"taRemarks","nda-hours":"ndaHours","nda-remarks":"ndaRemarks","ota-hours":"otaHours","ota-remarks":"otaRemarks","kma-points":"kmaPoints","kma-remarks":"kmaRemarks","general-notes":"generalNotes"};
 Object.keys(fields).forEach(id=>{$(id).value=r[fields[id]]==null?"":r[fields[id]];});
 toggleTaFields();setSync(diaryRecords[key]?"Saved record":"Not saved");showMessage("");
}
function selectDate(day){selectedDate=new Date(currentDate.getFullYear(),currentDate.getMonth(),day);renderCalendar();loadDayData(selectedDate);}
function changeMonth(delta){currentDate=new Date(currentDate.getFullYear(),currentDate.getMonth()+delta,1);renderCalendar();}
async function saveCurrentDayData(){
 if(!activeUid){showMessage("Please log in to save your diary.",true);return;}if(saving)return;saving=true;$("saveDiaryBtn").disabled=true;
 const key=keyOf(selectedDate),record=readForm();diaryRecords[key]=record;
 try{writeLocal();setSync("Syncing…");renderCalendar();await setDoc(doc(db,"users",activeUid,"dutyDiary",key),record,{merge:true});setSync("Cloud synced");showMessage("Record saved to your account and this device.");}
 catch(error){console.error("Diary cloud save:",error);setSync("Device saved · cloud pending");showMessage("Saved on this device; cloud sync pending ("+(error.code||"connection") + ").",true);}
 finally{saving=false;$("saveDiaryBtn").disabled=false;}
}
async function clearCurrentDay(){
 if(!activeUid)return;const key=keyOf(selectedDate);if(!confirm("Delete this date's record from this device and cloud?"))return;
 try{await deleteDoc(doc(db,"users",activeUid,"dutyDiary",key));delete diaryRecords[key];writeLocal();renderCalendar();loadDayData(selectedDate);showMessage("Record deleted.");}
 catch(error){console.error(error);showMessage("Could not delete the cloud record. Check connection and rules.",true);}
}
async function syncLocalRecords(uid){
 const local=readLocal(uid);let remote={};
 try{const snap=await getDocs(recordsRef(uid));snap.forEach(d=>remote[d.id]=d.data());}catch(error){console.warn("Cloud diary fetch:",error);}
 diaryRecords=Object.assign({},local,remote);writeLocal();
 for(const key of Object.keys(local)){if(!remote[key]){try{await setDoc(doc(db,"users",uid,"dutyDiary",key),local[key],{merge:true});}catch(error){console.warn("Queued diary upload:",key,error);}}}
 renderCalendar();loadDayData(selectedDate);
}
function listenToCloud(uid){
 if(unsubscribeRecords)unsubscribeRecords();
 unsubscribeRecords=onSnapshot(recordsRef(uid),snapshot=>{
  snapshot.docChanges().forEach(change=>{if(change.type==="removed")delete diaryRecords[change.doc.id];else diaryRecords[change.doc.id]=change.doc.data();});
  writeLocal();renderCalendar();loadDayData(selectedDate);setSync(navigator.onLine?"Cloud synced":"Offline · device copy");
 },error=>{console.error("Diary listener:",error);setSync("Cloud unavailable");showMessage("Cloud access failed. Firestore rules may need publishing.",true);});
}
$("prevMonth").addEventListener("click",()=>changeMonth(-1));
$("nextMonth").addEventListener("click",()=>changeMonth(1));
$("is-ta").addEventListener("change",toggleTaFields);
$("diaryForm").addEventListener("submit",event=>{event.preventDefault();saveCurrentDayData();});
$("clearDayBtn").addEventListener("click",()=>loadDayData(selectedDate));
$("deleteDayBtn").addEventListener("click",clearCurrentDay);
try{await enableIndexedDbPersistence(db);}catch(error){if(error.code!=="failed-precondition"&&error.code!=="unimplemented")console.warn("Firestore offline persistence:",error.message);}
renderCalendar();loadDayData(selectedDate);
onAuthStateChanged(auth,async user=>{
 if(unsubscribeRecords){unsubscribeRecords();unsubscribeRecords=null;}
 if(!user){activeUid=null;diaryRecords={};renderCalendar();loadDayData(selectedDate);$("accountStatus").textContent="Not signed in — open the login page to continue.";$("accountStatus").insertAdjacentHTML("beforeend",' <a href="../auth/login.html">Log in</a>');$("saveDiaryBtn").disabled=true;setSync("Login required");return;}
 activeUid=user.uid;$("accountStatus").textContent="Signed in · "+(user.displayName||user.email||user.phoneNumber||"Railway Mitra account");$("saveDiaryBtn").disabled=false;
 await syncLocalRecords(user.uid);listenToCloud(user.uid);
});
window.addEventListener("online",()=>{if(activeUid)syncLocalRecords(activeUid).then(()=>setSync("Cloud synced"));});
