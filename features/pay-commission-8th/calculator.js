(function(){
"use strict";
const $=id=>document.getElementById(id);
const money=n=>"₹"+Math.round(n).toLocaleString("en-IN");
const api=window.RailwayMitraEmployeeData;
function todayISO(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function formatDate(value){
  if(!value)return "—";
  const [y,m,d]=value.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("hi-IN",{day:"2-digit",month:"long",year:"numeric"});
}
function fillFromProfile(){
  const p=api&&api.getProfile?api.getProfile():null;
  if(!p){$("employeeName").textContent="प्रोफाइल उपलब्ध नहीं";$("employeeMeta").textContent="पहले Employee Profile में जानकारी सेव करें।";return;}
  $("employeeName").textContent=p.name||"कर्मचारी";
  $("employeeMeta").textContent=[p.post,p.level,p.division,p.zone].filter(Boolean).join(" · ")||"प्रोफाइल विवरण";
  if(p.basicPay!==""&&p.basicPay!=null){$("basicPay").value=p.basicPay;$("basicSource").textContent="Employee Profile से लिया गया";}else{$("basicSource").textContent="Profile में Basic Pay उपलब्ध नहीं";}
  const level=String(p.level||"").match(/\d+/);const n=level?Number(level[0]):0;
  const tptaSelect=$("baseTpta");let chosen="";
  if(p.tpa!==""&&p.tpa!=null){
    chosen=[...tptaSelect.options].find(o=>Number(o.value)===Number(p.tpa));
    if(chosen){tptaSelect.value=chosen.value;$("tptaSource").textContent="Profile के TPA से मिलान किया गया — कृपया पुष्टि करें";}
    else $("tptaSource").textContent="Profile TPA दिए गए विकल्पों से मेल नहीं खाता; सही Base TPTA चुनें।";
  }else if(n>0){
    const value=n<=2?"1350":n<=8?"1800":"7200";
    tptaSelect.value=value;$("tptaSource").textContent="Level के आधार पर प्रारंभिक विकल्प चुना गया; शहर के अनुसार जाँचें।";
  }
}
function updateHraRateControl(){
  const quarterAllotted=$("quarterAllotted").value==="yes";
  const field=$("cityClassField");
  const select=$("cityClass");
  select.disabled=quarterAllotted;
  select.setAttribute("aria-disabled",String(quarterAllotted));
  field.classList.toggle("is-disabled",quarterAllotted);
  field.setAttribute("aria-disabled",String(quarterAllotted));
  $("hraRateNote").textContent=quarterAllotted
    ?"क्वार्टर आवंटित है — HRA लागू नहीं, इसलिए शहर की दर निष्क्रिय है।"
    :"शहर के अनुसार HRA दर चुनें।";
}
function calculate(){
  const oldBasic=Number($("basicPay").value);
  const factor=Number($("fitmentFactor").value);
  const hraPercent=Number($("cityClass").value);
  const baseTpta=Number($("baseTpta").value);
  const oldDaPercent=Number($("currentDa").value);
  const eff=$("effectiveDate").value;
  const endDate=$("arrearEndDate").value;
  const quarterAllotted=$("quarterAllotted").value==="yes";
  if(!Number.isFinite(oldBasic)||oldBasic<=0){alert("Employee Profile में सही Basic Pay सेव करें।");return;}
  if(!Number.isFinite(oldDaPercent)||oldDaPercent<0||oldDaPercent>200){alert("वर्तमान DA प्रतिशत जाँचें।");return;}
  if(!eff){alert("संभावित प्रभावी तिथि चुनें।");return;}
  if(!endDate){alert("एरियर की गणना की अंतिम तारीख चुनें।");return;}
  const [year,month]=eff.split("-").map(Number);
  const [endYear,endMonth,endDay]=endDate.split("-").map(Number);
  const effectiveMonthIndex=year*12+(month-1);
  const endMonthIndex=endYear*12+(endMonth-1);
  if(endDate<eff+"-01"){alert("एरियर की अंतिम तारीख, प्रभावी महीने से पहले नहीं हो सकती।");return;}
  const oldDa=oldBasic*oldDaPercent/100;
  const oldHra=quarterAllotted?0:oldBasic*(hraPercent===24?30:hraPercent===16?20:10)/100;
  const oldTa=baseTpta*(1+oldDaPercent/100);
  const oldGross=oldBasic+oldDa+oldHra+oldTa;
  const oldNps=(oldBasic+oldDa)*.10;
  const oldNet=oldGross-oldNps;
  const newBasic=Math.round(oldBasic*factor/100)*100;
  const newHra=quarterAllotted?0:newBasic*hraPercent/100;
  const newTa=baseTpta;
  const newGross=newBasic+newHra+newTa;
  const newNps=newBasic*.10;
  const newNet=newGross-newNps;
  const monthlyNetDiff=newNet-oldNet;
  const months=Math.max(0,endMonthIndex-effectiveMonthIndex+1);
  const arrears=Math.max(0,monthlyNetDiff)*months;
  $("netSalaryDisplay").textContent=money(newNet);
  $("salaryJumpDisplay").textContent="वर्तमान अनुमानित Net "+money(oldNet)+" से मासिक अंतर "+(monthlyNetDiff>=0?"+":"")+money(monthlyNetDiff);
  $("newBasicDisplay").textContent=money(newBasic);
  $("totalArrearDisplay").textContent=money(arrears);
  $("arrearStatus").textContent=months===0?"चुनी गई तारीख प्रभावी तिथि से पहले है।":months+" माह की अनुमानित गणना";
  $("newHraDisplay").textContent=money(newHra)+(quarterAllotted?" (क्वार्टर — 0%)":" ("+hraPercent+"%)");
  $("npsDisplay").textContent="-"+money(newNps);
  $("oldGrossDisplay").textContent=money(oldGross);
  $("newGrossDisplay").textContent=money(newGross);
  $("arrearMonthsDisplay").textContent=months+" माह";
  $("arrearEndDisplay").textContent=formatDate(endDate);
  $("netGainDisplay").textContent=(monthlyNetDiff>=0?"+":"")+money(monthlyNetDiff)+" / माह";
  $("resultBox").hidden=false;
  $("resultBox").scrollIntoView({behavior:"smooth",block:"start"});
}
document.addEventListener("DOMContentLoaded",function(){
  $("arrearEndDate").value=todayISO();
  fillFromProfile();
  updateHraRateControl();
  ["change","input"].forEach(eventName=>$("quarterAllotted").addEventListener(eventName,function(){
    updateHraRateControl();
    $("resultBox").hidden=true;
  }));
  $("calculateBtn").addEventListener("click",calculate);
  ["effectiveDate","arrearEndDate","quarterAllotted","cityClass","fitmentFactor","baseTpta","currentDa","basicPay"].forEach(id=>{
    $(id).addEventListener("change",()=>{$("resultBox").hidden=true;});
  });
  window.addEventListener("railwaymitra:profile-updated",fillFromProfile);
});
})();