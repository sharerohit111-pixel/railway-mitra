(() => {
  "use strict";
  const header=document.querySelector(".app-header");
  if(!header||document.getElementById("rmGlobalSearch"))return;
  const segments=location.pathname.split("/").filter(Boolean);\n  const featureAt=segments.indexOf("features");\n  const rootPrefix=featureAt>=0?"../".repeat(segments.length-featureAt-1):"./";
  const pages=[
    ["My Profile","Employee details and profile settings","👤","features/profile/index.html"],\n    ["8th Pay Commission","8th CPC salary and arrear estimate","📈","features/pay-commission-8th/index.html"],
    ["Allowances","DA, HRA, TA, NDA, OTA, KMA","📊","features/allowances/index.html"],
    ["DA Arrear Calculator","DA arrears and difference calculation","🧮","features/allowances/da-arrear/index.html"],
    ["Duty Roster & Allowance Diary","Daily duty records and monthly allowance ledger","🕒","features/duty-diary/index.html"],
    ["Leave Management","Leave balance and leave calculator","📅","features/leave/index.html"],
    ["NPS & Pension","NPS and retirement planning","🏦","features/retirement/index.html"],
    ["Loan & Finance","Loan EMI and financial tools","💳","features/finance/index.html"],
    ["Railway Rules","Railway rules, manuals and circulars","📚","features/rules/index.html"],
    ["Engineering Tools","Track, P-Way and engineering","🛤️","features/engineering/index.html"],
    ["Documents & PDF","Documents and PDF utilities","📁","features/documents/index.html"],
    ["Railway Updates","Railway orders and notifications","🔔","features/updates/index.html"],
    ["IMD Weather","Weather forecasts and district warnings","🌦️","features/weather/index.html"],
    ["India Map","Interactive map and location","🗺️","features/map/index.html"],
    ["Exam Preparation","GDCE, LDCE, mock tests, papers and study material","🎓","features/exams/index.html"],
    ["GDCE Exams","GDCE JE Civil, Electrical, Mechanical and Train Manager","🚆","features/exams/gdce.html"],
    ["GDCE JE Civil","Civil engineering mock tests and previous papers","🏗️","features/exams/stream.html?stream=gdce-je-civil"],
    ["GDCE JE Electrical","Electrical engineering mock tests and previous papers","⚡","features/exams/stream.html?stream=gdce-je-electrical"],
    ["GDCE JE Mechanical","Mechanical engineering mock tests and previous papers","⚙️","features/exams/stream.html?stream=gdce-je-mechanical"],
    ["GDCE Train Manager","Train Manager mock tests and previous papers","🚆","features/exams/stream.html?stream=gdce-train-manager"]
  ];
  const wrap=document.createElement("section");wrap.id="rmGlobalSearch";wrap.className="rm-global-search";
  wrap.innerHTML='<div class="rm-search-inner"><label class="rm-search-field"><span>⌕</span><input id="rmSearchInput" type="search" autocomplete="off" placeholder="Search Railway Mitra features, calculators, exams…" aria-label="Search all Railway Mitra features"><span aria-hidden="true">⌘ K</span></label><div id="rmSearchResults" class="rm-search-results" role="listbox"></div><p class="rm-search-hint">Search all available app sections. Private owner files appear only in verified admin sessions.</p></div>';
  if(header){header.appendChild(wrap);}else{wrap.style.position="sticky";wrap.style.top="0";wrap.style.zIndex="150";document.body.insertBefore(wrap,document.body.firstChild);}\n  const style=document.createElement("link");style.rel="stylesheet";style.href=rootPrefix+"assets/css/global-search.css";document.head.appendChild(style);
  const input=wrap.querySelector("#rmSearchInput"),results=wrap.querySelector("#rmSearchResults");
  let owner=false,searchFn=null,storageApi=null,debounce=null;
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function render(items){results.innerHTML=items.length?items.map(x=>'<a class="rm-search-result" role="option" href="'+esc(x.href)+'"><span class="rm-search-result-icon">'+esc(x.icon||"🔎")+'</span><span><strong>'+esc(x.title)+'</strong><small>'+esc(x.description||"Open section")+'</small></span></a>').join(""):'<div class="rm-search-empty">No matching section found.</div>';results.classList.add("open");}
  function localSearch(q){const terms=q.toLocaleLowerCase().split(/\s+/).filter(Boolean);return pages.filter(p=>terms.every(t=>(p[0]+" "+p[1]).toLocaleLowerCase().includes(t))).slice(0,12).map(p=>({title:p[0],description:p[1],icon:p[2],href:rootPrefix+p[3]}));}
  async function search(q){const matches=localSearch(q);if(owner&&searchFn&&q.length>=2){try{const data=(await searchFn({query:q})).data;for(const f of data.folders||[])matches.push({title:f.name,description:"Private folder • "+(f.category||"Exam Content"),icon:"📁",href:rootPrefix+"features/exams/content-library.html?folder="+encodeURIComponent(f.id)});for(const f of data.files||[])matches.push({title:f.name,description:"Private PDF • open in Content Manager",icon:"📄",href:rootPrefix+"features/exams/content-library.html?file="+encodeURIComponent(f.id)});}catch(_e){/* Keep local app search available if private search is unavailable. */}}render(matches.slice(0,20));}
  input.addEventListener("input",()=>{clearTimeout(debounce);const q=input.value.trim();if(!q){results.classList.remove("open");results.replaceChildren();return;}debounce=setTimeout(()=>search(q),220);});
  input.addEventListener("focus",()=>{if(input.value.trim())search(input.value.trim());});
  document.addEventListener("click",e=>{if(!wrap.contains(e.target))results.classList.remove("open");});
  document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();input.focus();input.select();}if(e.key==="Escape"){results.classList.remove("open");input.blur();}});
  if(location.pathname.includes("/features/exams/")||location.pathname.endsWith("/index.html")||location.pathname==="/"){
    import(rootPrefix+"assets/js/firebase.js").then(async ({auth,app})=>{if(!auth.currentUser)await new Promise(resolve=>{let done=false;import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js").then(({onAuthStateChanged})=>{const unsub=onAuthStateChanged(auth,u=>{if(done)return;done=true;unsub();resolve(u);});});setTimeout(()=>{if(!done){done=true;resolve(null);}},1800);});const user=auth.currentUser;if(!user)return;try{const token=await user.getIdTokenResult();owner=token.claims.admin===true;if(owner){const {getFunctions,httpsCallable}=await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js");searchFn=httpsCallable(getFunctions(app,"asia-south1"),"searchExamContent");}}catch(_e){owner=false;}});
  }
})();