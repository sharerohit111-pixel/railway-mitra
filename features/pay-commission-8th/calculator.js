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
  const tptaSelect=$("baseTpta");
  if(p.tpa!==""&&p.tpa!=null){
    const chosen=[...tptaSelect.options].find(o=>Number(o.value)===Number(p.tpa));
    if(chosen){tptaSelect.value=chosen.value;$("tptaSource").textContent="Profile के TPA से मिलान किया गया — कृपया पुष्टि करें";}
    else $("tptaSource").textContent="Profile TPA दिए गए विकल्पों से मेल नहीं खाता; सही Base TPTA चुनें।";
  }else if(n>0){
    const value=n<=2?"1350":n<=8?"1800":"7200";
    tptaSelect.value=value;$("tptaSource").textContent="Level के आधार पर प्रारंभिक विकल्प चुना गया; शहर के अनुसार जाँचें।";
  }
}
function readInputs(){
  const oldBasic=Number($("basicPay").value);
  const factor=Number($("fitmentFactor").value);
  const baseTpta=Number($("baseTpta").value);
  const oldDaPercent=Number($("currentDa").value);
  if(!Number.isFinite(oldBasic)||oldBasic<=0){alert("Employee Profile में सही Basic Pay सेव करें।");return null;}
  if(!Number.isFinite(oldDaPercent)||oldDaPercent<0||oldDaPercent>200){alert("वर्तमान DA प्रतिशत जाँचें।");return null;}
  const quarter=$("quarterAllotted").value==="yes";
  const cityRate=Number($("cityClass").value);
  const oldHra=quarter?0:oldBasic*(cityRate===24?30:cityRate===16?20:10)/100;
  const newBasic=Math.round(oldBasic*factor/100)*100;
  const newDa=0;
  const newHra=quarter?0:newBasic*cityRate/100;
  const oldDa=oldBasic*oldDaPercent/100;
  const oldTa=baseTpta*(1+oldDaPercent/100);
  const newTa=baseTpta*(1+newDa/100);
  const oldGross=oldBasic+oldDa+oldHra+oldTa;
  const newGross=newBasic+newDa+newHra+newTa;
  const oldNps=(oldBasic+oldDa)*.10;
  const newNps=(newBasic+newDa)*.10;
  return {oldBasic,oldDa,newBasic,newDa,oldHra,newHra,oldTa,newTa,oldGross,newGross,oldNps,newNps,oldNet:oldGross-oldNps,newNet:newGross-newNps};
}
function calculateSalary(){
  const v=readInputs();if(!v)return;
  const diff=v.newNet-v.oldNet;
  $("netSalaryDisplay").textContent=money(v.newNet);
  $("salaryJumpDisplay").textContent="वर्तमान अनुमानित Net "+money(v.oldNet)+" से मासिक अंतर "+(diff>=0?"+":"")+money(diff);
  $("newBasicDisplay").textContent=money(v.newBasic);
  $("newHraDisplay").textContent=money(v.newHra)+(v.newHra===0?" (लागू नहीं)":"");
  $("newTaDisplay").textContent=money(v.newTa);
  $("npsDisplay").textContent="-"+money(v.newNps);
  $("oldGrossDisplay").textContent=money(v.oldGross);
  $("newGrossDisplay").textContent=money(v.newGross);
  $("oldNetDisplay").textContent=money(v.oldNet);
  $("newNetDisplay").textContent=money(v.newNet);
  $("salaryResultBox").hidden=false;
  $("salaryResultBox").scrollIntoView({behavior:"smooth",block:"start"});
}
function calculateArrear(){
  const v=readInputs();if(!v)return;
  const eff=$("effectiveDate").value;
  const endDate=$("arrearEndDate").value;
  if(!eff){alert("संभावित प्रभावी तिथि चुनें।");return;}
  if(!endDate){alert("एरियर की गणना की अंतिम तारीख चुनें।");return;}
  const [year,month]=eff.split("-").map(Number);
  const [endYear,endMonth]=endDate.split("-").map(Number);
  if(endDate<eff+"-01"){alert("एरियर की अंतिम तारीख, प्रभावी महीने से पहले नहीं हो सकती।");return;}
  const startIndex=year*12+(month-1);
  const endIndex=endYear*12+(endMonth-1);
  const months=Math.max(0,endIndex-startIndex+1);
  const monthlyBasicDaDiff=(v.newBasic+v.newDa)-(v.oldBasic+v.oldDa);
  const monthlyAfterNps=monthlyBasicDaDiff*.90;
  const arrears=Math.max(0,monthlyAfterNps)*months;
  $("totalArrearDisplay").textContent=money(arrears);
  $("arrearStatus").textContent="केवल Basic + DA अंतर − 10% NPS; TA/HRA शामिल नहीं";
  $("arrearMonthsDisplay").textContent=months+" माह";
  $("arrearEndDisplay").textContent=formatDate(endDate);
  $("monthlyArrearDisplay").textContent=money(monthlyAfterNps);
  $("arrearResultBox").hidden=false;
  $("arrearResultBox").scrollIntoView({behavior:"smooth",block:"start"});
}
function updateHraControls(){
  const quarter=$("quarterAllotted").value==="yes";
  $("cityClass").disabled=quarter;
  $("cityClassField").classList.toggle("is-disabled",quarter);
  $("hraRateNote").textContent=quarter
    ?"सरकारी क्वार्टर आवंटित है — मासिक HRA ₹0; शहर की दर लागू नहीं।"
    :"शहर की श्रेणी के अनुसार मासिक HRA अनुमानित होगा।";
}
document.addEventListener("DOMContentLoaded",function(){
  $("arrearEndDate").value=todayISO();
  fillFromProfile();
  updateHraControls();
  $("quarterAllotted").addEventListener("change",updateHraControls);
  $("calculateSalaryBtn").addEventListener("click",calculateSalary);
  $("calculateArrearBtn").addEventListener("click",calculateArrear);
  ["effectiveDate","arrearEndDate","fitmentFactor","baseTpta","currentDa","basicPay","cityClass","quarterAllotted"].forEach(id=>{
    $(id).addEventListener("change",()=>{
      $("salaryResultBox").hidden=true;
      $("arrearResultBox").hidden=true;
    });
  });
  window.addEventListener("railwaymitra:profile-updated",fillFromProfile);
});
})();