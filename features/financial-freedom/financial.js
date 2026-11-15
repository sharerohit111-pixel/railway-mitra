(() => {
"use strict";
const KEY="rm_financial_freedom_v1";
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(n)||0);
let data={income:0,loans:[]},editing=null;
try{const saved=JSON.parse(localStorage.getItem(KEY)||"null");if(saved&&Array.isArray(saved.loans))data=saved;}catch(e){console.warn("Could not load saved finance data",e);}
function save(){localStorage.setItem(KEY,JSON.stringify(data));render();}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function remainingDate(day,count){if(!count)return "Completed";const now=new Date();let y=now.getFullYear(),m=now.getMonth();let d=Math.min(day,new Date(y,m+1,0).getDate());if(new Date(y,m,d)<new Date(y,m,now.getDate()))m++;const target=new Date(y,m+count-1,Math.min(day,new Date(y,m+count,0).getDate()));return target.toLocaleDateString("en-IN",{month:"short",year:"numeric"});}
function render(){
 const income=Number(data.income)||0,emi=data.loans.reduce((s,l)=>s+Number(l.emi),0),left=data.loans.reduce((s,l)=>s+Math.max(0,l.totalEmis-l.paidEmis),0);
 $("sumIncome").textContent=money(income);$("sumEmi").textContent=money(emi);$("sumBalance").textContent=money(income-emi);$("sumCount").textContent=left.toLocaleString("en-IN");
 const ratio=income?Math.round(emi/income*100):0;$("emiRatio").textContent=ratio+"%";$("emiBar").style.width=Math.min(100,Math.max(0,ratio))+"%";
 $("overallNote").textContent=!data.loans.length?"Add your loans to see the total repayment picture.":emi>income?"Your listed EMIs are higher than your entered monthly income. Review your figures.":("After listed EMIs, approximately "+money(income-emi)+" remains each month. This does not include other household expenses.");
 $("loanList").innerHTML=data.loans.length?data.loans.map((l,i)=>{const rem=Math.max(0,l.totalEmis-l.paidEmis),paid=Number(l.amountPaid)||Number(l.emi)*Number(l.paidEmis),due=rem*Number(l.emi);return '<article class="loan-card"><div class="loan-head"><div><h3>'+esc(l.bank)+' · '+esc(l.type)+'</h3><p>EMI due: '+esc(l.dueDay)+'th of each month</p></div><div class="loan-actions"><button data-edit="'+i+'" type="button">Edit</button><button data-delete="'+i+'" type="button">Delete</button></div></div><div class="loan-metrics"><div class="metric"><span>Monthly EMI</span><strong>'+money(l.emi)+'</strong></div><div class="metric"><span>Paid instalments</span><strong>'+l.paidEmis+' / '+l.totalEmis+'</strong></div><div class="metric"><span>Instalments remaining</span><strong>'+rem+'</strong></div><div class="metric"><span>Paid so far</span><strong>'+money(paid)+'</strong></div><div class="metric"><span>Remaining scheduled EMIs</span><strong>'+money(due)+'</strong></div><div class="metric"><span>Outstanding principal</span><strong>'+(l.outstanding!==""&&l.outstanding!=null?money(l.outstanding):"Not entered")+'</strong></div></div><div class="loan-foot">Estimated final EMI: <strong>'+remainingDate(Number(l.dueDay),rem)+'</strong>'+(l.rate!==""&&l.rate!=null?' · Interest: '+esc(l.rate)+'% p.a.':'')+'</div></article>';}).join(""):'<div class="empty">No loans added yet. Select “Add Loan” to enter your first loan.</div>';
 $("loanTimeline").innerHTML=data.loans.map(l=>'<div class="timeline-row"><strong>'+esc(l.bank)+' · '+esc(l.type)+'</strong><span>'+Math.max(0,l.totalEmis-l.paidEmis)+' EMIs left · '+remainingDate(Number(l.dueDay),Math.max(0,l.totalEmis-l.paidEmis))+'</span></div>').join("");
}
$("monthlyIncome").value=data.income||"";$("monthlyIncome").addEventListener("change",e=>{data.income=Math.max(0,Number(e.target.value)||0);save();});
const dlg=$("loanDialog"),form=$("loanForm");
function openForm(index=null){editing=index;form.reset();$("dialogTitle").textContent=index===null?"Add a loan":"Edit loan";if(index!==null){const l=data.loans[index];Object.entries(l).forEach(([k,v])=>{if(form.elements[k])form.elements[k].value=v;});}dlg.showModal();}
$("addLoan").addEventListener("click",()=>openForm());$("closeDialog").addEventListener("click",()=>dlg.close());$("cancelLoan").addEventListener("click",()=>dlg.close());
form.addEventListener("submit",e=>{e.preventDefault();const f=new FormData(form),l=Object.fromEntries(f.entries());l.principal=Number(l.principal);l.emi=Number(l.emi);l.totalEmis=Number(l.totalEmis);l.paidEmis=Number(l.paidEmis);l.dueDay=Number(l.dueDay);if(l.paidEmis>l.totalEmis){alert("Paid EMIs cannot exceed total EMIs.");return;}if(l.outstanding!=="")l.outstanding=Number(l.outstanding);if(l.rate!=="")l.rate=Number(l.rate);if(l.amountPaid!=="")l.amountPaid=Number(l.amountPaid);if(editing===null)data.loans.push(l);else data.loans[editing]=l;dlg.close();save();});
$("loanList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit)openForm(Number(edit.dataset.edit));if(del&&confirm("Delete this loan from this device?")){data.loans.splice(Number(del.dataset.delete),1);save();}});
$("exportPdf").addEventListener("click",()=>window.print());
window.addEventListener("beforeprint",()=>{document.querySelectorAll(".loan-actions").forEach(x=>x.style.display="none");});
window.addEventListener("afterprint",()=>{document.querySelectorAll(".loan-actions").forEach(x=>x.style.display="flex");});
render();
})();