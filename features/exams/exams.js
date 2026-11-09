/* Railway Mitra Exam Preparation - isolated navigation module */
(() => {
  "use strict";
  const root = document.querySelector("[data-exam-page]");
  if (!root) return;
  const page = root.dataset.examPage;
  const base = "./";
  const params = new URLSearchParams(location.search);
  const streamId = params.get("stream") || "gdce-je-civil";
  const typeId = params.get("type") || "mock";
  const streams = {
    "gdce-je-civil": { name:"GDCE JE Civil Engineering", group:"GDCE JE", icon:"🏗️", freeMock:true },
    "gdce-je-electrical": { name:"GDCE JE Electrical Engineering", group:"GDCE JE", icon:"⚡", freeMock:true },
    "gdce-je-mechanical": { name:"GDCE JE Mechanical Engineering", group:"GDCE JE", icon:"⚙️", freeMock:true },
    "gdce-train-manager": { name:"GDCE Train Manager", group:"GDCE", icon:"🚆", freeMock:true }
  };
  const types = {
    mock:{name:"Mock Test",plural:"Mock Tests",icon:"📝",description:"Full-length computer-based examination practice."},
    previous:{name:"Previous Year Paper Test",plural:"Previous Year Papers",icon:"📄",description:"Attempt verified previous departmental question papers."},
    practice:{name:"Practice Sets",plural:"Practice Sets",icon:"🎯",description:"Topic-wise and mixed practice question sets."}
  };
  const stream = streams[streamId] || streams["gdce-je-civil"];
  const type = types[typeId] || types.mock;
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const header = (title, subtitle, back) => `
    <div class="exam-topbar"><a class="exam-back" href="${back}">← Back</a><span class="exam-brand">RAILWAY MITRA • EXAMS</span></div>
    <section class="exam-hero"><div class="exam-kicker">Departmental Examination Preparation</div><h1>${title}</h1><p>${subtitle}</p></section>`;
  const card = (icon,title,description,href,meta="Open section") => `
    <a class="exam-card" href="${href}"><span class="exam-card-icon">${icon}</span><h3>${title}</h3><p>${description}</p><span class="exam-card-meta"><span>${meta}</span><span>→</span></span></a>`;
  async function loadCatalog(){
    try { const res=await fetch("catalog.json",{cache:"no-store"}); if(!res.ok) throw new Error("Catalog unavailable"); return await res.json(); }
    catch(error){ console.warn("Exam catalog not loaded:",error); return {streams:{}}; }
  }
  async function render(){
    if(page==="home"){
      root.innerHTML = header("Exam Preparation","Choose Railway Departmental examinations or explore the separate Other Exams app when it becomes available.","../../index.html") + `
        <h2 class="exam-section-title">A. Railway Departmental Exams</h2>
        <div class="exam-card-grid">${card("🚆","Railway Departmental Exams","GDCE and LDCE examination preparation, question papers and study resources.","gdce.html","Departmental only")}</div>
        <h2 class="exam-section-title">B. Other Exams</h2>
        <div class="exam-card-grid"><div class="exam-card"><span class="exam-card-icon">🌐</span><h3>Other Exams</h3><p>A separate app for other competitive examinations, mock tests, practice sets and study material.</p><span class="exam-card-meta"><span class="exam-pill pending">Under Progress</span><span>Coming soon</span></span></div></div>
        <div class="exam-notice">Other Exams will open through a separate app link after that app is developed. This section is intentionally shown as Under Progress for now.</div>`;
      return;
    }
    if(page==="gdce"){
      root.innerHTML = header("GDCE Mock Test, Practice Sets & Previous Year Papers","Select the departmental GDCE post or stream. Each stream keeps its own test library and settings.","index.html") + `
        <h2 class="exam-section-title">GDCE JE</h2><div class="exam-card-grid">
          ${card("🏗️","GDCE JE Civil Engineering","Civil engineering departmental exam tests and papers.","stream.html?stream=gdce-je-civil")}
          ${card("⚡","GDCE JE Electrical Engineering","Electrical engineering departmental exam tests and papers.","stream.html?stream=gdce-je-electrical")}
          ${card("⚙️","GDCE JE Mechanical Engineering","Mechanical engineering departmental exam tests and papers.","stream.html?stream=gdce-je-mechanical")}
        </div>
        <h2 class="exam-section-title">Other GDCE Posts</h2><div class="exam-card-grid">
          ${card("🚆","GDCE Train Manager","Train Manager departmental exam tests and papers.","stream.html?stream=gdce-train-manager")}
        </div>
        <div class="exam-admin-note">LDCE JE and other LDCE modules will be added separately after their requirements are finalised. This first development phase is for GDCE only.</div>`;
      return;
    }
    if(page==="stream"){
      root.innerHTML = header(esc(stream.name),"Choose the type of preparation you want. Mock Tests, Previous Year Papers and Practice Sets remain separate.","gdce.html") + `
        <h2 class="exam-section-title">Choose Test Category</h2><div class="exam-card-grid">
          ${Object.entries(types).map(([id,t])=>card(t.icon,t.plural,t.description,`tests.html?stream=${encodeURIComponent(streamId)}&type=${id}`,id==="mock"?"First mock test planned as free":"Separate test library")).join("")}
        </div><div class="exam-notice">Every paper will have its own question count, duration, marks per question, negative marking, solution availability and access setting.</div>`;
      return;
    }
    if(page==="tests"){
      const catalog=await loadCatalog();
      const streamData=catalog.streams?.[streamId];
      const items=streamData?.[typeId] || [];
      root.innerHTML = header(esc(stream.name)+" — "+esc(type.plural),type.description,"stream.html?stream="+encodeURIComponent(streamId)) + `
        <h2 class="exam-section-title">${esc(type.plural)}</h2>
        <div id="examTestList" class="exam-list"></div>
        <div class="exam-notice">No question paper is published here yet. When you provide a PDF, we will solve and verify every question with its explanation before publishing the test.</div>`;
      const list=root.querySelector("#examTestList");
      if(items.length){
        list.innerHTML=items.map(item=>`<div class="exam-list-item"><div><strong>${esc(item.title)}</strong><small>${Number(item.totalQuestions)||0} questions • ${Number(item.durationMinutes)||0} minutes</small></div><span class="exam-pill">${item.access==="free"?"FREE":"PAID"}</span></div>`).join("");
      } else {
        list.innerHTML='<div class="exam-empty"><div class="exam-empty-icon">📚</div><h3>No tests published yet</h3><p>This category is ready for unlimited future papers and tests. Your first PDF will be processed and added after answer verification.</p></div>';
      }
      return;
    }
    if(page==="admin"){
      root.innerHTML = header("Exam Admin Workspace","A separate owner-only control centre for managing exam content and settings.","index.html") + `
        <div class="exam-admin-note"><strong>Secure setup required before activation.</strong><br>Admin editing is not enabled in this preview. Firebase currently requires its security rules and an owner-only admin role to be configured first. We will not store admin passwords or payment controls in browser code.</div>
        <h2 class="exam-section-title">Planned Admin Controls</h2><div class="exam-card-grid">
          ${card("🗂️","Exam & Stream Management","Add and organise GDCE posts, streams and test categories.","#")}
          ${card("➕","Question & Solution Bank","Import approved questions, options, correct answers and explanations.","#")}
          ${card("⏱️","Test Configuration","Set questions, duration, positive marks and negative marking per test.","#")}
          ${card("🔐","Access & Subscription","Configure free tests, ₹300 all-tests subscription and separate study-material prices.","#")}
          ${card("📈","Candidate Records","Review attempts, scores, accuracy and paper-wise history.","#")}
          ${card("📚","Study Material","Upload, organise and price departmental study resources.","#")}
        </div><div class="exam-notice">This page is a structural preview only; no fake save buttons or insecure client-side admin actions are provided.</div>`;
    }
  }
  render();
})();