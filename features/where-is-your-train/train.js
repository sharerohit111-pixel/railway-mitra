import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { auth } from "../../assets/js/firebase.js";

const ROUTE=[["Lalgarh Junction",0,"07:25"],["Nal Halt",10,"07:39"],["Gajner",30,"07:56"],["Kolayat",46,"08:11"],["Diyatara Road",62,"08:26"],["Nokhra",84,"08:45"],["Sird",105,"09:02"],["Bap",122,"09:18"],["Malar",145,"09:37"],["Phalodi Junction",158,"10:00"]];
const TRAIN_APPROACH_ALERT_KM=5;
const NONSTOP_EARLY_MINUTES=5;
const TRAIN_SPEED_KMH={passenger:105,goods:60};
const ROUTE_GPS=[
 [28.04343,73.31454],[28.03822,73.21651],[27.93577,73.0614],[27.83622,72.95544],
 [27.7336,72.83992],[27.6080,72.6654],[27.48666,72.50906],[27.37879,72.38547],
 [27.20412,72.37554],[27.12491,72.36686]
];
let latestReport=null,lastAlertKey="",gpsWatch=null,alarmContext=null;
function estimatePassTime(stationIndex){const scheduled=ROUTE[stationIndex]?.[2];if(!scheduled)return null;const [h,m]=scheduled.split(":").map(Number);const d=new Date();d.setHours(h,m,0,0);d.setMinutes(d.getMinutes()-NONSTOP_EARLY_MINUTES);return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}
const functions=getFunctions(undefined,"asia-south1");
const submitMovement=httpsCallable(functions,"submitTrainMovementReport");
const listMovement=httpsCallable(functions,"listTrainMovementReports");
const $=id=>document.getElementById(id);
const stationSelect=$("station");
ROUTE.forEach(([name,km],i)=>{const o=document.createElement("option");o.value=String(i);o.textContent=name+" · "+km+" km";stationSelect.appendChild(o)});
const nodes=$("stationNodes");
ROUTE.forEach(([name],i)=>{const n=document.createElement("span");n.className="rm-station-node";n.style.left=(i/(ROUTE.length-1)*100)+"%";n.dataset.label=name;n.title=name;nodes.appendChild(n)});
function updateClock(){$("capturedTime").textContent=new Date().toLocaleString(undefined,{dateStyle:"medium",timeStyle:"medium"})}
updateClock();setInterval(updateClock,1000);
$("movement").addEventListener("change",()=>{$("departureKmWrap").hidden=$("movement").value!=="departure"});
function kmForReport(r){if(r.movement==="departure"&&Number.isFinite(Number(r.departureKm)))return Number(r.departureKm);return Number(r.stationKm)}
function estimatedKm(r){const start=kmForReport(r);const elapsedHours=Math.max(0,(Date.now()-r.createdAt)/3600000);const speed=Number(r.speedKmh)||TRAIN_SPEED_KMH[r.trainType]||0;const sign=r.direction==="UP"?1:-1;return Math.max(0,Math.min(158,start+sign*speed*elapsedHours));}
function renderPosition(r){latestReport=r;if(!r){$("trainStatus").textContent="Waiting for report";$("positionName").textContent="No movement report yet";$("positionMeta").textContent="Submit the first community report.";return}
 const km=estimatedKm(r);const pct=km/158*100;
 $("routeProgress").style.width=pct+"%";$("trainMarker").style.left=pct+"%";
 $("trainStatus").textContent="Last reported · "+r.direction;
 $("positionName").textContent=r.stationName+" · "+km+" km";
 const stationIndex=ROUTE.findIndex(x=>x[0]===r.stationName);const passTime=r.movement==="pass"?estimatePassTime(stationIndex):null;$("positionMeta").textContent=(r.movementLabel||r.movement)+" · Report: "+new Date(r.createdAt).toLocaleString()+(passTime?" · Timetable-based estimated pass: "+passTime+" (5 min early)":"")+" · "+(r.trainType==="goods"?"Goods 60":"Passenger 105")+" km/h estimate";
}
function renderReports(reports){const list=$("reportList");list.replaceChildren();if(!reports.length){const li=document.createElement("li");li.textContent="Abhi koi report nahi hai.";list.appendChild(li);return}
 reports.forEach(r=>{const li=document.createElement("li");const title=document.createElement("strong");title.textContent=r.stationName+" · "+r.direction+" · "+(r.movementLabel||r.movement);const meta=document.createElement("small");const stationIndex=ROUTE.findIndex(x=>x[0]===r.stationName);const passTime=r.movement==="pass"?estimatePassTime(stationIndex):null;meta.textContent=new Date(r.createdAt).toLocaleString()+" · "+r.stationKm+" km"+(passTime?" · Estimated non-stop pass "+passTime:"")+(r.movement==="departure"&&r.departureKm!=null?" · Departure KM "+r.departureKm:"");li.append(title,meta);list.appendChild(li)})}
async function refresh(){try{const result=await listMovement({limit:30});const reports=result.data.reports||[];renderReports(reports);renderPosition(reports[0]||null)}catch(e){$("reportList").textContent=e.code==="unauthenticated"?"Sign in to Railway Mitra to view employee reports.":"Reports load nahi ho paaye. Internet aur login check karein.";}}
$("refreshReports").addEventListener("click",refresh);
$("movementForm").addEventListener("submit",async event=>{event.preventDefault();const user=auth.currentUser;if(!user){$("formMessage").textContent="Please sign in to Railway Mitra first.";return}
 const index=Number(stationSelect.value),[stationName,stationKm]=ROUTE[index],movement=$("movement").value;
 const departureKm=movement==="departure"?Number($("departureKm").value):null;
 if(movement==="departure"&&(!Number.isFinite(departureKm)||departureKm<0||departureKm>158)){$("formMessage").textContent="Valid departure KM (0–158) enter karein.";return}
 const trainType=$("trainType").value;const button=$("submitReport");button.disabled=true;$("formMessage").textContent="Submitting securely…";
 try{await submitMovement({stationId:String(index),direction:$("direction").value,movement,departureKm,trainType});$("formMessage").textContent="Report submit ho gayi. Thank you!";$("movementForm").reset();$("departureKmWrap").hidden=true;updateClock();await refresh()}
 catch(e){$("formMessage").textContent=e.code==="unauthenticated"?"Session expire ho gaya. Dobara sign in karein.":(e.message||"Report submit nahi hui. Dobara try karein.")}
 finally{button.disabled=false}
});

function haversineKm(a,b){const rad=x=>x*Math.PI/180;const dLat=rad(b[0]-a[0]),dLon=rad(b[1]-a[1]);const q=Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
function trainCoordinateAtKm(km){const direction=latestReport?.direction==="DOWN"?-1:1;const base=kmForReport(latestReport);const elapsed=Math.max(0,(Date.now()-latestReport.createdAt)/3600000);const trainKm=Math.max(0,Math.min(158,base+direction*(Number(latestReport.speedKmh)||105)*elapsed));let i=0;while(i<ROUTE.length-2&&ROUTE[i+1][1]<trainKm)i++;const span=ROUTE[i+1][1]-ROUTE[i][1]||1;const t=Math.max(0,Math.min(1,(trainKm-ROUTE[i][1])/span));return [ROUTE_GPS[i][0]+(ROUTE_GPS[i+1][0]-ROUTE_GPS[i][0])*t,ROUTE_GPS[i][1]+(ROUTE_GPS[i+1][1]-ROUTE_GPS[i][1])*t];}
async function playAlarmTest(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw new Error("Audio unavailable");const ctx=new Ctx();await ctx.resume();const start=ctx.currentTime;[0,0.42,0.84].forEach((offset,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type="sine";osc.frequency.value=i===1?880:660;gain.gain.setValueAtTime(0.0001,start+offset);gain.gain.exponentialRampToValueAtTime(0.28,start+offset+0.03);gain.gain.setValueAtTime(0.28,start+offset+0.22);gain.gain.exponentialRampToValueAtTime(0.0001,start+offset+0.32);osc.connect(gain);gain.connect(ctx.destination);osc.start(start+offset);osc.stop(start+offset+0.34)});if(navigator.vibrate)navigator.vibrate([250,120,250,120,450]);$("alarmPermission").textContent="Alarm tone and vibration test played.";}catch(e){$("alarmPermission").textContent="Tap again after allowing audio in browser.";}}
$("testAlarm").addEventListener("click",playAlarmTest);
if("Notification" in window){$("alarmPermission").textContent="Notification permission: "+Notification.permission;}
function triggerTrainAlarm(distance){const key=latestReport?.createdAt+":"+Math.floor(Date.now()/600000);if(key===lastAlertKey)return;lastAlertKey=key;playAlarmTest();if("Notification" in window&&Notification.permission==="granted"){try{new Notification("🚆 Train alert · 5 km",{body:"Estimated train is about "+distance.toFixed(1)+" km from your GPS location. Stay alert.",tag:"railway-mitra-train-5km",renotify:false});}catch(e){}}}
function startDutyMode(){if(!navigator.geolocation){$("alarmPermission").textContent="GPS is not supported on this phone.";return;}if(!("Notification" in window)){$("alarmPermission").textContent="Notifications are not supported in this browser.";return;}
 Notification.requestPermission().then(permission=>{if(permission!=="granted"){$("alarmPermission").textContent="Allow notifications to enable alerts.";return;}
 if(gpsWatch!==null)navigator.geolocation.clearWatch(gpsWatch);
 gpsWatch=navigator.geolocation.watchPosition(pos=>{if(!latestReport){$("alarmPermission").textContent="GPS active · waiting for employee train report.";return;}const train= trainCoordinateAtKm(kmForReport(latestReport));const employee=[pos.coords.latitude,pos.coords.longitude];const distance=haversineKm(employee,train);$("alarmPermission").textContent="Duty GPS active · estimated train distance "+distance.toFixed(1)+" km · 5 km alert";if(distance<=TRAIN_APPROACH_ALERT_KM)triggerTrainAlarm(distance);},err=>{$("alarmPermission").textContent="GPS error: "+err.message;},{enableHighAccuracy:true,maximumAge:10000,timeout:20000});$("alarmPermission").textContent="Duty mode active · GPS tracking while this page stays open.";});}
$("enableDuty").addEventListener("click",startDutyMode);
setInterval(()=>{if(latestReport){renderPosition(latestReport);}},15000);
if(auth.currentUser)refresh();else auth.onAuthStateChanged(user=>{if(user)refresh();else $("reportList").textContent="Sign in required."});
