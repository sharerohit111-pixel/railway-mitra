import { auth } from "../../assets/js/firebase.js";
const ENDPOINT="https://sgp.cloud.appwrite.io/v1", PROJECT="6b070890000e2fca34fd", FUNCTION="train-movement-api";
const ROUTE=[["Lalgarh Junction",0],["Nal Halt",10],["Gajner",30],["Kolayat",46],["Diyatara Road",62],["Nokhra",84],["Sird",105],["Bap",122],["Malar",145],["Phalodi Junction",158]];
const $=id=>document.getElementById(id), stationSelect=$("station"), alertStation=$("alertStation");
ROUTE.forEach(([name,km],i)=>{const o=document.createElement("option");o.value=String(i);o.textContent=name+" · "+km+" km";stationSelect.appendChild(o);const a=o.cloneNode(true);alertStation.appendChild(a);});
ROUTE.forEach(([name],i)=>{const n=document.createElement("span");n.className="rm-station-node";n.style.left=(i/(ROUTE.length-1)*100)+"%";n.dataset.label=name;n.title=name;$("stationNodes").appendChild(n);});
function clock(){$("capturedTime").textContent=new Date().toLocaleString(undefined,{dateStyle:"medium",timeStyle:"medium"});}clock();setInterval(clock,1000);setInterval(()=>{if(auth.currentUser)refresh();},30000);
$("movement").addEventListener("change",()=>$("departureKmWrap").hidden=$("movement").value!=="departure");
async function invoke(action,data={}){
  const user=auth.currentUser;if(!user)throw Object.assign(Error("Please sign in to Railway Mitra first."),{code:"unauthenticated"});
  const token=await user.getIdToken(true);
  const response=await fetch(ENDPOINT+"/functions/"+FUNCTION+"/executions",{method:"POST",headers:{"X-Appwrite-Project":PROJECT,"Content-Type":"application/json"},body:JSON.stringify({body:JSON.stringify({action,...data,firebaseIdToken:token}),async:false,method:"POST"})});
  const execution=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(execution.message||"Appwrite request failed.");
  const status=Number(execution.responseStatusCode||0);let result={};try{result=execution.responseBody?JSON.parse(execution.responseBody):{};}catch{}
  if(status<200||status>=300)throw Error(result.error||("Train report service returned HTTP "+status+"."));
  return result;
}
let alertEnabled=false,lastAlertKey="",latestReports=[];
const AVG_SPEED_KMH={passenger:105,goods:60};
const fmtTime=ms=>new Date(ms).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
function estimateArrival(r,target,direction){
 const origin=Number(r.movement==="departure"&&r.departureKm!=null?r.departureKm:r.stationKm),dest=target[1],speed=AVG_SPEED_KMH[r.trainType]||AVG_SPEED_KMH.passenger,reportedAt=Number(r.createdAt);
 if(!Number.isFinite(origin)||!Number.isFinite(reportedAt))return null;
 const forward=direction==="UP"?dest>=origin:dest<=origin;
 if(!forward)return {passed:true,origin,dest,speed,reportedAt};
 const distance=Math.max(0,Math.abs(dest-origin)),toAlert=Math.max(0,distance-5);
 return {passed:false,origin,dest,speed,reportedAt,distance,arrivalAt:reportedAt+distance/speed*3600000,alertAt:reportedAt+toAlert/speed*3600000};
}
function updateEtaAndAlarm(){
 const target=ROUTE[Number(alertStation.value)],direction=$("alertDirection").value,box=$("etaSummary");
 if(!target||!box)return;
 const r=latestReports.find(x=>x.direction===direction);
 if(!r){box.textContent="Selected direction ki abhi koi report nahi mili.";return;}
 const now=Date.now(),reportedAt=Number(r.createdAt),age=now-reportedAt;
 if(!Number.isFinite(reportedAt)||age<0||age>20*60*1000){box.textContent="Latest report 20 minute se purani hai. Nayi report ka wait karein.";return;}
 const eta=estimateArrival(r,target,direction);
 if(!eta){box.textContent="ETA calculate nahi ho paaya.";return;}
 if(eta.passed){box.textContent="Latest report ke mutabik train "+target[0]+" ko cross kar chuki ho sakti hai. Nayi report ka wait karein.";return;}
 const key=[r.createdAt,r.stationName,direction,target[0]].join("|");
 const remain=eta.arrivalAt-now,alarmRemain=eta.alertAt-now;
 const distanceNow=Math.max(0,eta.distance-(age/3600000)*eta.speed);
 box.textContent="Estimated arrival at "+target[0]+": "+fmtTime(eta.arrivalAt)+" · 5 km alert expected: "+fmtTime(eta.alertAt)+" · Approx distance: "+distanceNow.toFixed(1)+" km · Assumed speed: "+eta.speed+" km/h. Ye estimate hai, guarantee nahi.";
 if(alertEnabled&&Notification.permission==="granted"&&alarmRemain<=0&&lastAlertKey!==key){
  lastAlertKey=key;
  const message="Train may be within 5 km of "+target[0]+". Estimated station arrival: "+fmtTime(eta.arrivalAt)+".";
  $("alertMessage").textContent="🔔 "+message;
  new Notification("Railway Mitra · 5 km approach",{body:message,tag:"rm-train-"+key});
  if(navigator.vibrate)navigator.vibrate([500,180,500,180,700]);
 }
 if(alertEnabled&&alarmRemain>0&&alarmRemain<24*3600000){
  $("alertMessage").textContent="5 km alarm expected at "+fmtTime(eta.alertAt)+". Station arrival estimate: "+fmtTime(eta.arrivalAt)+".";
 }
}
function checkFiveKmAlert(reports){latestReports=reports;updateEtaAndAlarm();}
$("enableTrainAlert").addEventListener("click",async()=>{try{if(!("Notification" in window))throw Error("This browser does not support notifications.");if(!auth.currentUser)throw Error("Please sign in first.");const permission=await Notification.requestPermission();if(permission!=="granted")throw Error("Notification permission was not granted.");alertEnabled=true;lastAlertKey="";$("alertMessage").textContent="5 km alert enabled for "+ROUTE[Number(alertStation.value)][0]+" ("+$("alertDirection").value+"). Keep this page open.";try{localStorage.setItem("rmTrainAlertPrefs",JSON.stringify({station:alertStation.value,direction:$("alertDirection").value,enabled:true}));}catch{}await refresh();updateEtaAndAlarm();}catch(e){$("alertMessage").textContent=e.message;}});
try{const saved=JSON.parse(localStorage.getItem("rmTrainAlertPrefs")||"null");if(saved){alertStation.value=saved.station||"0";$("alertDirection").value=saved.direction||"UP";}}catch{}
alertStation.addEventListener("change",updateEtaAndAlarm);$("alertDirection").addEventListener("change",updateEtaAndAlarm);setInterval(updateEtaAndAlarm,1000);
function renderPosition(r){if(!r){$("trainStatus").textContent="Waiting for report";$("positionName").textContent="No movement report yet";$("positionMeta").textContent="Submit the first community report.";$("routeProgress").style.width="0%";$("trainMarker").style.left="0%";return;}const km=Math.max(0,Math.min(158,r.movement==="departure"&&Number.isFinite(Number(r.departureKm))?Number(r.departureKm):Number(r.stationKm)));const pct=km/158*100;$("routeProgress").style.width=pct+"%";$("trainMarker").style.left=pct+"%";$("trainStatus").textContent="Last reported · "+r.direction;$("positionName").textContent=r.stationName+" · "+km+" km";$("positionMeta").textContent=(r.movementLabel||r.movement)+" · "+new Date(r.createdAt).toLocaleString();}
function renderReports(reports){const list=$("reportList");list.replaceChildren();if(!reports.length){const li=document.createElement("li");li.textContent="Abhi koi report nahi hai.";list.appendChild(li);return;}reports.forEach(r=>{const li=document.createElement("li"),title=document.createElement("strong"),meta=document.createElement("small");title.textContent=r.stationName+" · "+r.direction+" · "+(r.movementLabel||r.movement);meta.textContent=new Date(r.createdAt).toLocaleString()+" · "+r.stationKm+" km"+(r.movement==="departure"&&r.departureKm!=null?" · Departure KM "+r.departureKm:"");li.append(title,meta);list.appendChild(li);});}
async function refresh(){try{const result=await invoke("list",{limit:30}),reports=Array.isArray(result.reports)?result.reports:[];renderReports(reports);renderPosition(reports[0]||null);checkFiveKmAlert(reports);}catch(e){$("reportList").textContent=e.code==="unauthenticated"?"Sign in to Railway Mitra to view employee reports.":(e.message||"Reports load nahi ho paaye. Internet aur login check karein.");}}
$("refreshReports").addEventListener("click",refresh);
$("movementForm").addEventListener("submit",async e=>{e.preventDefault();const movement=$("movement").value,departureKm=movement==="departure"?Number($("departureKm").value):null;if(movement==="departure"&&(!Number.isFinite(departureKm)||departureKm<0||departureKm>158)){$("formMessage").textContent="Valid departure KM (0–158) enter karein.";return;}const button=$("submitReport");button.disabled=true;$("formMessage").textContent="Submitting securely…";try{const result=await invoke("submit",{stationId:stationSelect.value,direction:$("direction").value,movement,trainType:$("trainType").value,departureKm});if(!result.success)throw Error("Report was not accepted.");$("formMessage").textContent="Report submit ho gayi. Thank you!";$("movementForm").reset();$("departureKmWrap").hidden=true;clock();await refresh();}catch(err){$("formMessage").textContent=err.message||"Report submit nahi hui. Dobara try karein.";}finally{button.disabled=false;}});
auth.onAuthStateChanged(user=>{if(user)refresh();else{$("reportList").textContent="Sign in required.";renderPosition(null);}});
