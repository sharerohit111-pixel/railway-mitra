import { auth, db } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const KEY="railwayMitra.settings.v1";
const defaults={theme:"dark",accent:"cyan",fontSize:"normal",language:"en",basicPay:"25500",daRate:"63",notifyUpdates:false,notifyRecruitment:false,notifyReminders:true};
const $=id=>document.getElementById(id);
let state={...defaults,...readLocal()},user=null,saveTimer=null,remoteReady=false;
function readLocal(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch(_){return {}}}
function localSave(){localStorage.setItem(KEY,JSON.stringify(state));applyPreferences();}
function applyPreferences(){
 document.documentElement.dataset.rmTheme=state.theme;
 document.documentElement.style.setProperty("--rm-settings-accent",({cyan:"#35e8ff",blue:"#4c91e8",violet:"#9b5cff",pink:"#ff45d4"})[state.accent]||"#35e8ff");
 document.documentElement.style.fontSize=state.fontSize==="larger"?"18px":state.fontSize==="large"?"17px":"16px";
}
function populate(){
 $("darkTheme").checked=state.theme==="dark";$("accentColor").value=state.accent;$("fontSize").value=state.fontSize;
 $("language").value=state.language;$("basicPay").value=state.basicPay;$("daRate").value=state.daRate;
 $("notifyUpdates").checked=!!state.notifyUpdates;$("notifyRecruitment").checked=!!state.notifyRecruitment;$("notifyReminders").checked=!!state.notifyReminders;
}
function collect(){state={theme:$("darkTheme").checked?"dark":"light",accent:$("accentColor").value,fontSize:$("fontSize").value,language:$("language").value,basicPay:$("basicPay").value,daRate:$("daRate").value,notifyUpdates:$("notifyUpdates").checked,notifyRecruitment:$("notifyRecruitment").checked,notifyReminders:$("notifyReminders").checked};}
function message(t,error=false){$("settingsMessage").textContent=t;$("settingsMessage").style.color=error?"#fca5a5":"#78e8c1";}
function scheduleCloudSave(){if(!user||!remoteReady)return;clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{await setDoc(doc(db,"users",user.uid,"preferences","settings"),{...state,updatedAt:new Date().toISOString()},{merge:true});$("cloudStatus").textContent="Automatic backup active";}catch(e){console.warn("Settings cloud sync failed",e);$("cloudStatus").textContent="Cloud temporarily unavailable";}},700);}
function changed(){collect();localSave();scheduleCloudSave();message("Preference saved on this device.");}
["darkTheme","accentColor","fontSize","language","basicPay","daRate","notifyUpdates","notifyRecruitment","notifyReminders"].forEach(id=>$(id).addEventListener("change",changed));
$("saveSettings").addEventListener("click",()=>{collect();localSave();scheduleCloudSave();message("Settings saved successfully.");});
$("resetSettings").addEventListener("click",()=>{if(!confirm("Reset all Settings preferences to defaults?"))return;state={...defaults};populate();localSave();scheduleCloudSave();message("Default settings restored.");});
$("exportBackup").addEventListener("click",()=>{collect();localSave();const blob=new Blob([JSON.stringify({app:"Railway Mitra",type:"settings-backup",version:1,exportedAt:new Date().toISOString(),settings:state},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="railway-mitra-settings-backup.json";a.click();URL.revokeObjectURL(url);message("Settings backup downloaded.");});
$("importBackup").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.app!=="Railway Mitra"||data.type!=="settings-backup"||!data.settings)throw new Error("Invalid backup file");state={...defaults,...data.settings};populate();localSave();scheduleCloudSave();message("Settings restored from backup.");}catch(err){message("Backup restore failed: "+err.message,true);}finally{e.target.value="";}});
populate();localSave();applyPreferences();
if(window.RailwayMitraLanguage?.set)window.RailwayMitraLanguage.set(state.language);
onAuthStateChanged(auth,async signedInUser=>{
 user=signedInUser||null;
 $("accountName").textContent=user?(user.displayName||user.email||user.phoneNumber||"Railway Mitra User"):"Your Railway Mitra Account";
 $("accountStatus").textContent=user?"Signed in · preferences protected to your account":"Not signed in · device preferences only";
 $("cloudStatus").textContent=user?"Connecting…":"Sign in for automatic account backup";
 if(!user){remoteReady=false;return;}
 try{
  const ref=doc(db,"users",user.uid,"preferences","settings");const snap=await getDoc(ref);
  if(snap.exists()){state={...defaults,...snap.data()};delete state.updatedAt;populate();localSave();if(window.RailwayMitraLanguage?.set)window.RailwayMitraLanguage.set(state.language);}
  else {await setDoc(ref,{...state,updatedAt:new Date().toISOString()},{merge:true});}
  remoteReady=true;$("cloudStatus").textContent="Automatic backup active";
 }catch(e){console.warn("Could not load cloud preferences",e);$("cloudStatus").textContent="Device backup active";}
});