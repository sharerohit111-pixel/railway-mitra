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
    "gdce-train-manager": { name:"GDCE Train Manager", group:"GDCE", icon:"🚆", freeMock:true },
    "ldce-je-civil": { name:"LDCE JE Civil Engineering", group:"LDCE JE", icon:"🏗️", freeMock:true },
    "ldce-je-electrical": { name:"LDCE JE Electrical Engineering", group:"LDCE JE", icon:"⚡", freeMock:true },
    "ldce-je-mechanical": { name:"LDCE JE Mechanical Engineering", group:"LDCE JE", icon:"⚙️", freeMock:true },
    "ldce-other-posts": { name:"LDCE Other Departmental Posts", group:"LDCE", icon:"🚉", freeMock:true }
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
  async function loadPublishedTests(streamId, category){
    const [{auth,app},{getFunctions,httpsCallable},{onAuthStateChanged}] = await Promise.all([
      import("../../assets/js/firebase.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js")
    ]);
    const user = auth.currentUser || await new Promise(resolve=>{const unsub=onAuthStateChanged(auth,u=>{unsub();resolve(u);});});
    if(!user) throw new Error("Please sign in to view published GDCE tests.");
    const fn=httpsCallable(getFunctions(app,"asia-south1"),"listPublishedTests");
    const response=await fn({streamId,category});
    return response.data.tests || [];
  }
  async function render(){
    if(page==="home"){
      root.innerHTML = header("Exam Preparation","Choose Railway Departmental examinations or explore the separate Other Exams app when it becomes available.","../../index.html") + `
        <h2 class="exam-section-title">A. Railway Departmental Exams</h2>
        <div class="exam-card-grid">${card("🚆","GDCE Departmental Exams","GDCE JE and other GDCE posts: mock tests, previous papers and practice sets.","gdce.html","GDCE")}${card("📘","LDCE Departmental Exams","Separate LDCE streams, mock tests, previous papers and practice sets.","ldce.html","LDCE")}${card("💳","Subscription & Study Material","Buy all-tests access or separately priced study PDFs using verified UPI payments.","store.html","Candidate Store")}${card("📊","My Test Results","View your submitted tests, scores and accuracy from your online account.","my-results.html","My Results")}</div>
        <h2 class="exam-section-title">B. Other Exams</h2>
        <div class="exam-card-grid"><a class="exam-card" href="../../other-exams/index.html"><span class="exam-card-icon">🌐</span><h3>Other Exams App</h3><p>Open the separate competitive-exam app for UPSC, SSC, Banking, State, Defence and Teaching categories.</p><span class="exam-card-meta"><span class="exam-pill pending">Content Under Preparation</span><span>Open App →</span></span></a></div>
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
    if(page==="ldce"){
      root.innerHTML = header("LDCE Departmental Exams","LDCE has its own independent streams and separate Mock Tests, Previous Year Papers and Practice Sets. Only owner-published papers appear in candidate lists.","index.html") + `
        <h2 class="exam-section-title">LDCE JE Streams</h2><div class="exam-card-grid">
          ${card("🏗️","LDCE JE Civil Engineering","Civil engineering LDCE preparation and papers.","stream.html?stream=ldce-je-civil")}
          ${card("⚡","LDCE JE Electrical Engineering","Electrical engineering LDCE preparation and papers.","stream.html?stream=ldce-je-electrical")}
          ${card("⚙️","LDCE JE Mechanical Engineering","Mechanical engineering LDCE preparation and papers.","stream.html?stream=ldce-je-mechanical")}
        </div><h2 class="exam-section-title">Other LDCE Posts</h2><div class="exam-card-grid">
          ${card("🚉","Other Departmental Posts","Separate LDCE category for additional posts as approved papers become available.","stream.html?stream=ldce-other-posts")}
        </div><div class="exam-notice">LDCE papers are kept separate from GDCE. The owner must upload and verify each paper before it becomes visible to candidates.</div>`;
      return;
    }
    if(page==="stream"){
      root.innerHTML = header(esc(stream.name),"Choose the type of preparation you want. Mock Tests, Previous Year Papers and Practice Sets remain separate.",streamId.startsWith("ldce-")?"ldce.html":"gdce.html") + `
        <h2 class="exam-section-title">Choose Test Category</h2><div class="exam-card-grid">
          ${Object.entries(types).map(([id,t])=>card(t.icon,t.plural,t.description,`tests.html?stream=${encodeURIComponent(streamId)}&type=${id}`,id==="mock"?"First mock test planned as free":"Separate test library")).join("")}
        </div><div class="exam-notice">Every paper will have its own question count, duration, marks per question, negative marking, solution availability and access setting.</div>`;
      return;
    }
    if(page==="tests"){
      let items=[];
      let loadError="";
      try { items=await loadPublishedTests(streamId,typeId); }
      catch(error) { loadError=error.message || "Could not load published tests."; }
      root.innerHTML = header(esc(stream.name)+" — "+esc(type.plural),type.description,"stream.html?stream="+encodeURIComponent(streamId)) + `
        <h2 class="exam-section-title">${esc(type.plural)}</h2>
        <div id="examTestList" class="exam-list"></div>
        <div class="exam-notice">Only verified papers published by the owner will appear here. Questions and answer keys are delivered securely by Firebase.</div>`;
      const list=root.querySelector("#examTestList");
      if(loadError){
        list.innerHTML=`<div class="exam-empty"><div class="exam-empty-icon">🔐</div><h3>Sign in / connection required</h3><p>${esc(loadError)}</p></div>`;
      } else if(items.length){
        list.innerHTML=items.map(item=>`<div class="exam-list-item"><div><strong>${esc(item.title)}</strong><small>${Number(item.totalQuestions)||0} questions • ${Number(item.durationMinutes)||0} minutes${item.sourceLabel?" • "+esc(item.sourceLabel):""}${item.sourceYear?" • "+esc(item.sourceYear):""}</small></div><div style="display:flex;align-items:center;gap:9px"><span class="exam-pill">${item.access==="free"?"FREE":"PAID"}</span><a class="exam-back" href="runner.html?test=${encodeURIComponent(item.testId)}">Start →</a></div></div>`).join("");
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