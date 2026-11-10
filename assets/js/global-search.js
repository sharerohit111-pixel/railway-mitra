(() => {
  "use strict";
  const header=document.querySelector(".app-header");
  if(document.getElementById("rmGlobalSearch"))return;
  const segments=location.pathname.split("/").filter(Boolean);
  const featureAt=segments.indexOf("features");
  const rootPrefix=featureAt>=0?"../".repeat(segments.length-featureAt-1):"./";
  const pages=[
    ["My Profile","Employee details and profile settings","👤","features/profile/index.html"],
    ["8th Pay Commission","8th CPC salary and arrear estimate","📈","features/pay-commission-8th/index.html"],
    ["Allowances","DA, HRA, TA, NDA, OTA, KMA","📊","features/allowances/index.html"],
    ["DA Calculator","Dearness allowance calculator","₹","features/allowances/da/index.html"],
    ["DA Arrear","Dearness allowance arrear calculator","🧮","features/allowances/da-arrear/index.html"],
    ["HRA Calculator","House rent allowance calculator","🏠","features/allowances/hra/index.html"],
    ["TA Calculator","Transport allowance calculator","🚕","features/allowances/ta/index.html"],
    ["NDA Calculator","Night duty allowance calculator","🌙","features/allowances/nda/index.html"],
    ["OTA Calculator","Overtime allowance calculator","⏱️","features/allowances/ota/index.html"],
    ["KMA Calculator","Kilometrage allowance calculator","🚆","features/allowances/kma/index.html"],
    ["Duty Roster & Allowance Diary","Daily duty records and monthly allowance ledger","🕒","features/duty-diary/index.html"],
    ["Railway Rules","Railway rules, manuals and circulars","📚","features/rules/index.html"],
    ["India Map","Interactive map and location","🗺️","features/map/index.html"],
    ["Exam Preparation","GDCE, LDCE, mock tests, papers and study material","🎓","features/exams/index.html"],
    ["GDCE Exams","GDCE JE Civil, Electrical, Mechanical and Train Manager","🚆","features/exams/gdce.html"],
    ["Mock Tests","GDCE computer based mock tests","📝","features/exams/tests.html?type=mock"],
    ["Previous Year Papers","Previous departmental question papers","📄","features/exams/tests.html?type=previous"],
    ["Practice Sets","Topic wise GDCE practice sets","🎯","features/exams/tests.html?type=practice"],
    ["GDCE JE Civil","Civil engineering mock tests and previous papers","🏗️","features/exams/stream.html?stream=gdce-je-civil"],
    ["GDCE JE Electrical","Electrical engineering mock tests and previous papers","⚡","features/exams/stream.html?stream=gdce-je-electrical"],
    ["GDCE JE Mechanical","Mechanical engineering mock tests and previous papers","⚙️","features/exams/stream.html?stream=gdce-je-mechanical"],
    ["GDCE Train Manager","Train Manager mock tests and previous papers","🚆","features/exams/stream.html?stream=gdce-train-manager"]
  ];
  const wrap=document.createElement("section");wrap.id="rmGlobalSearch";wrap.className="rm-global-search";
  wrap.innerHTML='<div class="rm-search-inner"><label class="rm-search-field"><span>⌕</span><input id="rmSearchInput" type="search" autocomplete="off" placeholder="Search Railway Mitra features, calculators, exams…" aria-label="Search all Railway Mitra features"><span aria-hidden="true">⌘ K</span></label><div id="rmSearchResults" class="rm-search-results" role="listbox"></div><p class="rm-search-hint">Search all available app sections. Private owner files appear only in verified admin sessions.</p></div>';
  if(header){header.appendChild(wrap);}else{wrap.style.position="sticky";wrap.style.top="0";wrap.style.zIndex="150";document.body.insertBefore(wrap,document.body.firstChild);}
  const style=document.createElement("link");style.rel="stylesheet";style.href=rootPrefix+"assets/css/global-search.css";document.head.appendChild(style);
  const input=wrap.querySelector("#rmSearchInput"),results=wrap.querySelector("#rmSearchResults");
  let owner=false,searchFn=null,storageApi=null,debounce=null;
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function render(items){results.innerHTML=items.length?items.map(x=>'<a class="rm-search-result" role="option" href="'+esc(x.href)+'"><span class="rm-search-result-icon">'+esc(x.icon||"🔎")+'</span><span><strong>'+esc(x.title)+'</strong><small>'+esc(x.description||"Open section")+'</small></span></a>').join(""):'<div class="rm-search-empty">No matching section found.</div>';results.classList.add("open");}
  function localSearch(q){const terms=q.toLocaleLowerCase().split(/\s+/).filter(Boolean);return pages.filter(p=>terms.every(t=>(p[0]+" "+p[1]).toLocaleLowerCase().includes(t))).slice(0,12).map(p=>({title:p[0],description:p[1],icon:p[2],href:rootPrefix+p[3]}));}
  async function search(q){const matches=localSearch(q);if(owner&&searchFn&&q.length>=3){try{const data=(await searchFn({query:q})).data;for(const f of data.folders||[])matches.push({title:f.name,description:"Private folder • "+(f.category||"Exam Content"),icon:"📁",href:rootPrefix+"features/exams/content-library.html?folder="+encodeURIComponent(f.id)});for(const f of data.files||[])matches.push({title:f.name,description:"Private PDF • open in Content Manager",icon:"📄",href:rootPrefix+"features/exams/content-library.html?file="+encodeURIComponent(f.id)});}catch(_e){/* Keep local app search available if private search is unavailable. */}}render(matches.slice(0,20));}
  input.addEventListener("input",()=>{clearTimeout(debounce);const q=input.value.trim();if(!q){results.classList.remove("open");results.replaceChildren();return;}debounce=setTimeout(()=>search(q),650);});
  input.addEventListener("focus",()=>{if(input.value.trim())search(input.value.trim());});
  document.addEventListener("click",e=>{if(!wrap.contains(e.target))results.classList.remove("open");});
  document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();input.focus();input.select();}if(e.key==="Escape"){results.classList.remove("open");input.blur();}});
  import(rootPrefix+"assets/js/firebase.js").then(async ({auth,app})=>{
    const {onAuthStateChanged}=await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js");
    onAuthStateChanged(auth,async user=>{
      owner=false;searchFn=null;
      if(!user)return;
      try{
        const token=await user.getIdTokenResult();
        owner=token.claims.admin===true;
        if(owner){
          const {getFunctions,httpsCallable}=await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js");
          searchFn=httpsCallable(getFunctions(app,"asia-south1"),"searchExamContent");
          if(input.value.trim().length>=2)search(input.value.trim());
        }
      }catch(_e){owner=false;searchFn=null;}
    });
  }).catch(()=>{/* Local feature search remains available without Firebase. */});
})();
