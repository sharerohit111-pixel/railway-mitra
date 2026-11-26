import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
const PROJECT_ID="6b070890000e2fca34fd", DATABASE_ID="railway_mitra", TABLE_ID="train_movement_reports";
const ROUTE_ID="14704-lgh-phl", FIREBASE_PROJECT_ID=process.env.FIREBASE_PROJECT_ID||"railway-mitra";
const ENDPOINT="https://sgp.cloud.appwrite.io/v1";
const jwks=createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const ROUTE=[["Lalgarh Junction",0,true],["Nal Halt",11.19,true],["Darbari",25,false],["Gajner",30.9,true],["Channi",39,false],["Kolayat",46.15,true],["Diyatra Road",62.5,true],["Nokhra",84.85,true],["Sird",105,true],["Bap",122.74,true],["Malar",145.35,true],["Phalodi Junction",158.15,true]];
// Legacy schema column only. This nominal value is never used as measured train speed or for alert decisions.\nconst LEGACY_SPEED_KMH={passenger:105,goods:60};
function parseObject(value){if(value&&typeof value==="object"&&!Array.isArray(value))return value;if(typeof value==="string"){try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed;}catch{}}return null;}
function getBody(req){
  let body=parseObject(req.bodyJson)||parseObject(req.body)||parseObject(req.bodyRaw);
  if(body&&typeof body.body==="string"){const nested=parseObject(body.body);if(nested)body=nested;}
  if(!body&&req.body&&typeof req.body==="string")body=parseObject(req.body);
  return body||{};
}
async function verify(body){
  const authHeader=Array.isArray(body.headers)?body.headers.find(h=>String(h.name).toLowerCase()==="authorization")?.value:"";
  const token=String(body.firebaseIdToken||body.idToken||authHeader.replace(/^Bearer\s+/i,"")).trim();
  if(!token||token.split(".").length!==3)throw Object.assign(new Error("Firebase sign-in token is missing. Please sign in again."),{status:401});
  try{
    const {payload}=await jwtVerify(token,jwks,{issuer:`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,audience:FIREBASE_PROJECT_ID,algorithms:["RS256"]});
    if(typeof payload.sub!=="string"||!payload.sub)throw Error("Missing Firebase UID");
    return payload.sub;
  }catch(e){throw Object.assign(new Error("Firebase session could not be verified. Refresh sign-in and try again."),{status:401});}
}
async function db(path,options={}){
  const key=process.env.APPWRITE_API_KEY;if(!key)throw Error("Backend configuration is incomplete.");
  const r=await fetch(ENDPOINT+path,{...options,headers:{"X-Appwrite-Project":PROJECT_ID,"X-Appwrite-Key":key,"Content-Type":"application/json",...(options.headers||{})}});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok){const e=Error(data.message||"Database request failed.");e.status=r.status>=500?502:r.status;throw e;}return data;
}
export default async({req,res,log,error})=>{
  if(req.method!=="POST")return res.json({error:"Method not allowed."},405);
  try{
    const body=getBody(req);
    const uid=await verify(body);
    if(body.action==="submit"){
      const station=ROUTE[Number(body.stationId)],direction=body.direction,movement=body.movement,trainType=body.trainType;
      if(!station||String(Number(body.stationId))!==String(body.stationId))return res.json({error:"Choose a valid route station."},400);
      if(!["UP","DOWN"].includes(direction)||!["pass","halt","departure"].includes(movement)||!["passenger","goods"].includes(trainType))return res.json({error:"Invalid report details."},400);
      const trainNumber=String(body.trainNumber||"").trim().toUpperCase();
      if(trainNumber&&(trainType==="passenger"?!/^\\d{4,6}$/.test(trainNumber):!/^[A-Z0-9-]{2,10}$/.test(trainNumber)))return res.json({error:"Enter a valid train number. Passenger trains use 4–6 digits; goods identifiers may use 2–10 letters, digits or hyphens."},400);
      const hasReportedKm=body.departureKm!==null&&body.departureKm!==undefined&&String(body.departureKm).trim()!=="";
      const departureKm=hasReportedKm?Number(body.departureKm):station[1];
      if(!Number.isFinite(departureKm)||departureKm<0||departureKm>158)return res.json({error:"Reported KM must be between 0 and 158."},400);
      const createdAtMs=Date.now();
      await db(`/tablesdb/${DATABASE_ID}/tables/${TABLE_ID}/rows`,{method:"POST",body:JSON.stringify({rowId:randomUUID().replaceAll("-","").slice(0,32),data:{uid,routeId:ROUTE_ID,stationId:String(Number(body.stationId)),stationName:station[0],stationKm:station[1],direction,movement,trainType,trainNumber:trainNumber||null,speedKmh:LEGACY_SPEED_KMH[trainType],movementLabel:movement==="pass"?"Passed without stop":movement==="halt"?"Halted":"Departed",departureKm,createdAtMs,schemaVersion:3},permissions:[]})});
      return res.json({success:true,createdAtMs,trainNumber:trainNumber||null,alertEligible:Boolean(trainNumber)});
    }
    if(body.action==="list"){
      const n=Number(body.limit),limit=Number.isFinite(n)?Math.min(50,Math.max(1,Math.floor(n))):30;
      const qs=[{method:"equal",attribute:"routeId",values:[ROUTE_ID]},{method:"orderDesc",attribute:"createdAtMs"},{method:"limit",values:[limit]}];
      const p=new URLSearchParams();qs.forEach(q=>p.append("queries[]",JSON.stringify(q)));p.set("total","false");
      const data=await db(`/tablesdb/${DATABASE_ID}/tables/${TABLE_ID}/rows?${p}`,{method:"GET"});
      return res.json({reports:(data.rows||[]).map(r=>({stationName:r.stationName,stationKm:r.stationKm,direction:r.direction,movement:r.movement,movementLabel:r.movementLabel,trainType:r.trainType,trainNumber:r.trainNumber||null,alertEligible:Boolean(r.trainNumber),departureKm:r.departureKm,createdAt:r.createdAtMs}))});
    }
    return res.json({error:"Unknown action."},400);
  }catch(e){
    if(e.status===401)return res.json({error:e.message},401);
    error?.(e);log?.("Train movement API request failed: "+String(e.message||"unknown error").slice(0,180));
    return res.json({error:e.status&&e.status<500?e.message:"Unable to process the report right now."},e.status||500);
  }
};
