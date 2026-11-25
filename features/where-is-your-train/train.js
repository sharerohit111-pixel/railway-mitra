import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { auth } from "../../assets/js/firebase.js";

const ROUTE=[["Lalgarh Junction",0],["Nal Halt",10],["Gajner",30],["Kolayat",46],["Diyatara Road",62],["Nokhra",84],["Sird",105],["Bap",122],["Malar",145],["Phalodi Junction",158]];
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
function renderPosition(r){if(!r){$("trainStatus").textContent="Waiting for report";$("positionName").textContent="No movement report yet";$("positionMeta").textContent="Submit the first community report.";return}
 const km=Math.max(0,Math.min(158,kmForReport(r)));const pct=km/158*100;
 $("routeProgress").style.width=pct+"%";$("trainMarker").style.left=pct+"%";
 $("trainStatus").textContent="Last reported · "+r.direction;
 $("positionName").textContent=r.stationName+" · "+km+" km";
 $("positionMeta").textContent=(r.movementLabel||r.movement)+" · "+new Date(r.createdAt).toLocaleString();
}
function renderReports(reports){const list=$("reportList");list.replaceChildren();if(!reports.length){const li=document.createElement("li");li.textContent="Abhi koi report nahi hai.";list.appendChild(li);return}
 reports.forEach(r=>{const li=document.createElement("li");const title=document.createElement("strong");title.textContent=r.stationName+" · "+r.direction+" · "+(r.movementLabel||r.movement);const meta=document.createElement("small");meta.textContent=new Date(r.createdAt).toLocaleString()+" · "+r.stationKm+" km"+(r.movement==="departure"&&r.departureKm!=null?" · Departure KM "+r.departureKm:"");li.append(title,meta);list.appendChild(li)})}
async function refresh(){try{const result=await listMovement({limit:30});const reports=result.data.reports||[];renderReports(reports);renderPosition(reports[0]||null)}catch(e){$("reportList").textContent=e.code==="unauthenticated"?"Sign in to Railway Mitra to view employee reports.":"Reports load nahi ho paaye. Internet aur login check karein.";}}
$("refreshReports").addEventListener("click",refresh);
$("movementForm").addEventListener("submit",async event=>{event.preventDefault();const user=auth.currentUser;if(!user){$("formMessage").textContent="Please sign in to Railway Mitra first.";return}
 const index=Number(stationSelect.value),[stationName,stationKm]=ROUTE[index],movement=$("movement").value;
 const departureKm=movement==="departure"?Number($("departureKm").value):null;
 if(movement==="departure"&&(!Number.isFinite(departureKm)||departureKm<0||departureKm>158)){$("formMessage").textContent="Valid departure KM (0–158) enter karein.";return}
 const button=$("submitReport");button.disabled=true;$("formMessage").textContent="Submitting securely…";
 try{await submitMovement({stationId:String(index),direction:$("direction").value,movement,departureKm});$("formMessage").textContent="Report submit ho gayi. Thank you!";$("movementForm").reset();$("departureKmWrap").hidden=true;updateClock();await refresh()}
 catch(e){$("formMessage").textContent=e.code==="unauthenticated"?"Session expire ho gaya. Dobara sign in karein.":(e.message||"Report submit nahi hui. Dobara try karein.")}
 finally{button.disabled=false}
});
if(auth.currentUser)refresh();else auth.onAuthStateChanged(user=>{if(user)refresh();else $("reportList").textContent="Sign in required."});
