(function(){
"use strict";
const $=id=>document.getElementById(id);
const money=n=>"₹"+Math.round(n).toLocaleString("en-IN");
const api=window.RailwayMitraEmployeeData;
let activeMode=null;
function todayISO(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function formatDate(value){if(!value)return "—";const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("hi-IN",{day:"2-digit",month:"long",year:"numeric"});}
function fillFromProfile(){
 const p=api&&api.getProfile?api.getProfile():null;
 if(!p){$("employeeName").textContent="प्रोफाइल उपलब्ध नहीं";$("employeeMeta").textContent="पहले Employee Profile में जानकारी सेव करें।";return;}
 $("employeeName").textContent=p.name||"कर्मचारी";
 $("employeeMeta").textContent=[p.post,p.level,p.division,p.zone].filter(Boolean).join(" · ")||"प्रोफाइल विवरण";
 if(p.basicPay!==""&&p.basicPay!=null){$("basicPay").value=p.basicPay;$("basicSource").textContent="Employee Profile से लिया गया";}else{$("basicSource").textContent="Profile में Basic Pay उपलब्ध नहीं";}
 const level=String(p.level||"").match(/\d+/),n=level?Number(level[0]):0,tpta=$("baseTpta");
 if(p.tpa!==""&&p.tpa!=null){const opt=[...tpta.options].find(o=>Number(o.value)===Number(p.tpa));if(opt){tpta.value=opt.value;$("tptaSource").textContent="Profile TPA से मिलान हुआ — कृपया पुष्टि करें";}else $("tptaSource").textContent="Profile TPA विकल्पों से मेल नहीं खाता; सही Base TPTA चुनें।";}
 else if(n>0){tpta.value=n<=2?"1350":n<=8?"1800":"7200";$("tptaSource").textContent="Level के आधार पर प्रारंभिक विकल्प; शहर के अनुसार जाँचें।";}
}
function openMode(mode){
 activeMode=mode;
 $("modeChooser").hidden=true;
 $("calculatorForm").hidden=false;
 $("formModeTitle").textContent=mode==="salary"?"मासिक नए वेतन की गणना":"एरियर की गणना";
 document.querySelectorAll("[data-mode]").forEach(el=>{el.hidden=el.dataset.mode!==mode;});
 $("calculateSalaryBtn").hidden=mode!=="salary";
 $("calculateArrearBtn").hidden=mode!=="arrear";
 $("salaryResultBox").hidden=true;$("arrearResultBox").hidden=true;
 updateHraControls();
 $("calculatorForm").scrollIntoView({behavior:"smooth",block:"start"});
}
function backToModes(){
 activeMode=null;$("calculatorForm").hidden=true;$("modeChooser").hidden=false;
 $("salaryResultBox").hidden=true;$("arrearResultBox").hidden=true;
}
function updateHraControls(){
 const quarter=$("quarterAllotted").value==="yes";
 $("cityClass").disabled=quarter;
 $("cityClassField").classList.toggle("is-disabled",quarter);
 $("cityClassField").setAttribute("aria-disabled",String(quarter));
 $("hraRateNote").textContent=quarter?"सरकारी क्वार्टर आवंटित है — मासिक HRA ₹0; शहर की दर निष्क्रिय है।":"शहर की श्रेणी के अनुसार मासिक HRA अनुमानित होगा।";
}
function readCommon(){
 const basic=Number($("basicPay").value),factor=Number($("fitmentFactor").value),daPercent=Number($("currentDa").value);
 if(!Number.isFinite(basic)||basic<=0){alert("Employee Profile में सही Basic Pay भरें।");return null;}
 if(!Number.isFinite(daPercent)||daPercent<0||daPercent>200){alert("वर्तमान DA प्रतिशत जाँचें।");return null;}
 const newBasic=Math.round(basic*factor/100)*100,newDa=0,oldDa=basic*daPercent/100;
 return {basic,factor,daPercent,oldDa,newBasic,newDa};
}
function calculateSalary(){
 const v=readCommon();if(!v)return;
 const baseTpta=Number($("baseTpta").value),quarter=$("quarterAllotted").value==="yes",cityRate=Number($("cityClass").value);
 const oldHra=quarter?0:v.basic*(cityRate===24?30:cityRate===16?20:10)/100;
 const newHra=quarter?0:v.newBasic*cityRate/100;
 const oldTa=baseTpta*(1+v.daPercent/100),newTa=baseTpta;
 const oldGross=v.basic+v.oldDa+oldHra+oldTa,newGross=v.newBasic+v.newDa+newHra+newTa;
 const oldNps=(v.basic+v.oldDa)*.10,newNps=(v.newBasic+v.newDa)*.10;
 const oldNet=oldGross-oldNps,newNet=newGross-newNps,diff=newNet-oldNet;
 $("netSalaryDisplay").textContent=money(newNet);
 $("salaryJumpDisplay").textContent="वर्तमान अनुमानित Net "+money(oldNet)+" से मासिक अंतर "+(diff>=0?"+":"")+money(diff);
 $("newBasicDisplay").textContent=money(v.newBasic);
 $("newHraDisplay").textContent=money(newHra)+(quarter?" (क्वार्टर)":"");
 $("newTaDisplay").textContent=money(newTa);
 $("npsDisplay").textContent="-"+money(newNps);
 $("oldGrossDisplay").textContent=money(oldGross);$("newGrossDisplay").textContent=money(newGross);
 $("oldNetDisplay").textContent=money(oldNet);$("newNetDisplay").textContent=money(newNet);
 $("salaryResultBox").hidden=false;$("salaryResultBox").scrollIntoView({behavior:"smooth",block:"start"});
}
function calculateArrear(){
 const v=readCommon();if(!v)return;
 const eff=$("effectiveDate").value,endDate=$("arrearEndDate").value;
 if(!eff){alert("संभावित प्रभावी तिथि चुनें।");return;}
 if(!endDate){alert("एरियर की गणना की अंतिम तारीख चुनें।");return;}
 const [year,month]=eff.split("-").map(Number),[endYear,endMonth]=endDate.split("-").map(Number);
 if(endDate<eff+"-01"){alert("एरियर की अंतिम तारीख, प्रभावी तिथि से पहले नहीं हो सकती।");return;}
 const months=Math.max(0,(endYear*12+endMonth-1)-(year*12+month-1)+1);
 const monthlyBasicDaDiff=(v.newBasic+v.newDa)-(v.basic+v.oldDa),monthlyAfterNps=monthlyBasicDaDiff*.90;
 $("totalArrearDisplay").textContent=money(Math.max(0,monthlyAfterNps)*months);
 $("arrearStatus").textContent="केवल Basic + DA अंतर − 10% NPS; TA/HRA शामिल नहीं";
 $("arrearMonthsDisplay").textContent=months+" माह";$("arrearEndDisplay").textContent=formatDate(endDate);
 $("monthlyArrearDisplay").textContent=money(monthlyAfterNps);
 $("arrearResultBox").hidden=false;$("arrearResultBox").scrollIntoView({behavior:"smooth",block:"start"});
}
document.addEventListener("DOMContentLoaded",function(){
 $("arrearEndDate").value=todayISO();fillFromProfile();
 $("chooseSalaryBtn").addEventListener("click",()=>openMode("salary"));
 $("chooseArrearBtn").addEventListener("click",()=>openMode("arrear"));
 $("changeModeBtn").addEventListener("click",backToModes);
 $("quarterAllotted").addEventListener("change",updateHraControls);
 $("calculateSalaryBtn").addEventListener("click",calculateSalary);
 $("calculateArrearBtn").addEventListener("click",calculateArrear);
 ["effectiveDate","arrearEndDate","fitmentFactor","baseTpta","currentDa","basicPay","cityClass","quarterAllotted"].forEach(id=>$(id).addEventListener("change",()=>{$("salaryResultBox").hidden=true;$("arrearResultBox").hidden=true;}));
 window.addEventListener("railwaymitra:profile-updated",fillFromProfile);
});
})();