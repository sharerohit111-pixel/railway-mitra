import { startCbtExam, getCbtExamQuestions, saveCbtAnswer, submitCbtExam, getCbtAttemptResult, getStudentActiveCbtAttempt, enterCbtSection, getCbtQuestionMediaUrl } from "../cloud/student-client.js";
import { readPendingAnswerDraft, writePendingAnswerDraft } from "./answer-draft-store.mjs";
import { buildCbtStorageKey } from "./attempt-storage-key.mjs";
import { lockCbtExamControls } from "./exam-interaction-lock.mjs";
import { restoreCbtOptionFocus } from "./exam-focus.mjs";
import { createCbtExamLifecycle } from "./exam-lifecycle.mjs";
import { classifyCbtAttemptResultError } from "./attempt-recovery.mjs";
import { createStudentAnswerState } from "./student-answer-state.mjs";

export function initStudentCbtExam({ app, testId, studentUid, root = document }) {
  if (typeof studentUid !== "string" || !studentUid.trim()) {
    throw new Error("A verified student UID is required for local CBT recovery.");
  }
  if (typeof testId !== "string" || !testId.trim()) {
    throw new Error("A valid test ID is required for local CBT recovery.");
  }
  const el = id => root.getElementById(id);
  const startPanel=el("rm-cbt-start-panel"), workspace=el("rm-cbt-workspace"), resultPanel=el("rm-cbt-result");
  let attemptId=null, paper=null, index=0, answers=createStudentAnswerState(), pendingAnswers=new Map(), expiresAt=0, sectionExpiresAt=0, timer=null, saving=Promise.resolve(), retrying=null, inFlightSaves=new Map(), finished=false, sectionTransitioning=false;
  const lifecycle = createCbtExamLifecycle();
  const isActive = () => lifecycle.isActive();
  const status = message => { if (isActive()) el("rm-cbt-status").textContent=message; };
  const storageIdentity = { appId: app?.options?.appId || "app", studentUid, testId };
  const attemptKey = () => buildCbtStorageKey({ ...storageIdentity, purpose: "attempt" });
  const draftKey = () => buildCbtStorageKey({ ...storageIdentity, purpose: "pending", attemptId });
  const positionKey = () => buildCbtStorageKey({ ...storageIdentity, purpose: "position", attemptId });
  function showResult(score, warning=""){
    if (!isActive()) return;
    clearInterval(timer);
    startPanel.hidden=true;workspace.hidden=true;resultPanel.hidden=false;
    try{if(attemptId)localStorage.removeItem(draftKey());}catch(_){}
    el("rm-cbt-score").textContent="Score: "+score.score+" · Correct: "+score.correct+" · Wrong: "+score.wrong+" · Unattempted: "+score.unattempted+(score.timedOut?" · Time expired":"")+(warning?" · "+warning:"");
  }
  function persistPending(){
    if(!isActive() || !attemptId)return;
    let storage;
    try { storage=window.localStorage; } catch (_) {}
    const saved=writePendingAnswerDraft({storage,key:draftKey(),entries:[...pendingAnswers.entries()]});
    if(!saved)status("स्थानीय Draft सुरक्षित नहीं हो सका। परीक्षा खुली रखें और सेव स्थिति जाँचें।");
  }
  function restorePending(){
    let storage;
    try { storage=window.localStorage; } catch (_) {}
    const restored=readPendingAnswerDraft({storage,key:draftKey(),questions:paper.questions});
    for(const [qid,value] of restored.answers)pendingAnswers.set(qid,value);
    if(restored.unavailable)status("स्थानीय Draft पढ़ा नहीं जा सका। सर्वर पर सेव उत्तर उपलब्ध रहेंगे।");
    else if(restored.discarded)status("कुछ पुराने/अमान्य Draft हटाए गए; सर्वर पर सेव उत्तर सुरक्षित हैं।");
  }
  const remaining = () => Math.max(0, Math.ceil((expiresAt-Date.now())/1000));
  function isQuestionAvailable(question) {
    if (!question?.section) return true;
    const timing = paper?.sectionTimings?.[question.section];
    return !timing || (timing.expiresAt && new Date(timing.expiresAt).getTime() > Date.now());
  }
  function findAvailableIndex(start, direction) {
    for (let i = start; i >= 0 && i < paper.questions.length; i += direction) {
      if (isQuestionAvailable(paper.questions[i])) return i;
    }
    return -1;
  }
  let navigationRequest = 0;
  async function activateQuestion(nextIndex){
    if (!isActive() || finished) return;
    const request = ++navigationRequest;
    const question = paper.questions[nextIndex];
    if (!isQuestionAvailable(question)) throw new Error("इस सेक्शन का समय समाप्त हो चुका है।");
    if (question?.section) {
      const timing = await enterCbtSection(app, attemptId, question.section);
      // A slower response from an earlier click must never override a newer navigation.
      if(!isActive() || finished || request !== navigationRequest) return;
      sectionExpiresAt = timing.timeLimitMinutes ? new Date(timing.expiresAt).getTime() : 0;
      paper.sectionTimings = paper.sectionTimings || {};
      if (timing.timeLimitMinutes) paper.sectionTimings[question.section] = { startedAt: timing.startedAt, expiresAt: timing.expiresAt };
    } else {
      if(!isActive() || finished || request !== navigationRequest) return;
      sectionExpiresAt = 0;
    }
    index = nextIndex;
    try { localStorage.setItem(positionKey(), String(index)); } catch (_) {}
    render(); tick();
  }
  function tick(){ if(!isActive()) return; const s=remaining(); el("rm-cbt-clock").textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); const sectionClock=el("rm-cbt-section-clock"); if(sectionClock){ const left=sectionExpiresAt?Math.max(0,Math.ceil((sectionExpiresAt-Date.now())/1000)):0; sectionClock.textContent=sectionExpiresAt?("सेक्शन समय "+String(Math.floor(left/60)).padStart(2,"0")+":"+String(left%60).padStart(2,"0")):""; if(sectionExpiresAt&&!left){ sectionClock.textContent="सेक्शन समय समाप्त"; if(!sectionTransitioning&&!finished){ sectionTransitioning=true; const currentSection=paper.questions[index]?.section; const expired=new Set(Object.entries(paper.sectionTimings||{}).filter(([,timing])=>!timing.expiresAt||new Date(timing.expiresAt).getTime()<=Date.now()).map(([name])=>name)); if(currentSection)expired.add(currentSection); const nextIndex=paper.questions.findIndex((item,i)=>i>index&&(!item.section||!expired.has(item.section))); if(nextIndex>=0){ status("इस सेक्शन का समय समाप्त। अगले उपलब्ध सेक्शन में जा रहे हैं…"); activateQuestion(nextIndex).catch(error=>status(error.message||"अगला सेक्शन नहीं खुला।")).finally(()=>{sectionTransitioning=false;}); } else { status("सभी उपलब्ध सेक्शन का समय समाप्त। शेष प्रश्न लॉक हैं।"); const options=el("rm-cbt-options"); options.querySelectorAll("button").forEach(button=>button.disabled=true); } } } } if(!s&&!finished) finish(true); }
  function queueSave(qid,value){
    if (!isActive()) return Promise.resolve();
    const active=inFlightSaves.get(qid);
    if(active&&active.value===value) return active.promise;
    pendingAnswers.set(qid,value);
    persistPending();
    el("rm-cbt-saved").textContent="Saving…";
    const entry={value,promise:null};
    entry.promise=saving=saving.catch(()=>{}).then(()=>{
      if (!isActive()) return;
      return saveCbtAnswer(app,attemptId,qid,value);
    }).then(()=>{
      if(pendingAnswers.get(qid)===value)pendingAnswers.delete(qid);
      if (!isActive()) return;
      persistPending();
      el("rm-cbt-saved").textContent=pendingAnswers.size?"Some answers pending":"All changes saved";
      el("rm-cbt-retry").hidden=pendingAnswers.size===0;
    }).catch(e=>{
      if (!isActive()) throw e;
      el("rm-cbt-saved").textContent="Save failed · "+pendingAnswers.size+" pending";
      el("rm-cbt-retry").hidden=false;
      status(e.message||"उत्तर सेव नहीं हुआ। इंटरनेट जाँचकर Retry दबाएँ।");
      throw e;
    }).finally(()=>{
      if(inFlightSaves.get(qid)===entry) inFlightSaves.delete(qid);
    });
    inFlightSaves.set(qid,entry);
    return entry.promise;
  }
  async function retryPending(){
    // Online events, the Retry button, and refresh recovery can request a retry
    // at nearly the same time. Share one in-flight pass to avoid duplicate writes.
    if(retrying) return retrying;
    retrying=(async()=>{
      const entries=[...pendingAnswers.entries()];
      for(const [qid,value] of entries){
        if (!isActive()) return;
        // A newer selection may have replaced this snapshot while retry was waiting.
        if(pendingAnswers.get(qid)!==value) continue;
        await queueSave(qid,value);
        if (!isActive()) return;
      }
      if (!isActive()) return;
      if(pendingAnswers.size) throw new Error("कुछ उत्तर अभी सर्वर पर सेव नहीं हुए हैं।");
    })();
    try { return await retrying; }
    finally { retrying=null; }
  }
  let mediaRenderVersion = 0;
  async function renderQuestionMedia(question, host, requestVersion) {
    const media = Array.isArray(question.media) ? question.media : [];
    if (!media.length) return;
    host.hidden = false;
    host.textContent = "चित्र लोड हो रहे हैं…";
    const figures = await Promise.all(media.map(async descriptor => {
      const response = await getCbtQuestionMediaUrl(app, attemptId, question.id, descriptor.id);
      if (!response || typeof response.url !== "string" || !response.url.startsWith("https://") ||
          response.mimeType !== descriptor.mimeType ||
          !["image/jpeg", "image/png", "image/webp"].includes(response.mimeType)) {
        throw new Error("चित्र का सुरक्षित लिंक मान्य नहीं है।");
      }
      const figure = document.createElement("figure");
      figure.className = "rm-cbt-question-figure";
      const image = document.createElement("img");
      image.src = response.url;
      image.alt = response.altText || descriptor.altText;
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => {
        if (isActive() && requestVersion === mediaRenderVersion) {
          figure.textContent = "चित्र लोड नहीं हो सका। कृपया इंटरनेट जाँचें।";
        }
      }, { once: true });
      figure.append(image);
      return figure;
    }));
    if (!isActive() || requestVersion !== mediaRenderVersion || paper.questions[index]?.id !== question.id) return;
    host.replaceChildren(...figures);
  }
  function render({ focusOptionIndex = null } = {}){
    if (!isActive() || !paper) return;
    const q=paper.questions[index]; el("rm-cbt-count").textContent="Question "+(index+1)+" of "+paper.questions.length;
    const sectionHeading = el("rm-cbt-section");
    sectionHeading.querySelector("span").textContent = q.section || "";
    sectionHeading.hidden = !q.section;
    el("rm-cbt-question").textContent=q.text;
    const mediaVersion = ++mediaRenderVersion;
    let mediaHost = el("rm-cbt-question-media");
    if (!mediaHost) {
      mediaHost = document.createElement("div");
      mediaHost.id = "rm-cbt-question-media";
      mediaHost.className = "rm-cbt-question-media";
      el("rm-cbt-question").after(mediaHost);
    }
    mediaHost.replaceChildren();
    mediaHost.hidden = !(Array.isArray(q.media) && q.media.length);
    if (mediaHost.hidden === false) {
      renderQuestionMedia(q, mediaHost, mediaVersion).catch(error => {
        if (isActive() && mediaVersion === mediaRenderVersion) {
          mediaHost.textContent = "चित्र उपलब्ध नहीं है: " + (error.message || "सुरक्षित लोड असफल");
          status("प्रश्न का चित्र सुरक्षित रूप से लोड नहीं हो सका।");
        }
      });
    }
    const options=el("rm-cbt-options"); options.replaceChildren();
    q.options.forEach((value,i)=>{const b=document.createElement("button");b.type="button";b.className="rm-cbt-option";b.setAttribute("aria-pressed",String(Object.hasOwn(answers,q.id)&&String(answers[q.id])===String(i)));const mark=document.createElement("b");mark.textContent=String.fromCharCode(65+i)+".";
      const label=document.createElement("span");label.textContent=value;b.append(mark,label);b.addEventListener("click",()=>{if(finished)return;answers[q.id]=String(i);render({ focusOptionIndex: i });queueSave(q.id,String(i)).catch(()=>{});});options.append(b);});
    el("rm-cbt-prev").disabled=index===0;el("rm-cbt-next").disabled=index===paper.questions.length-1;
    const palette=el("rm-cbt-palette");palette.replaceChildren();
    paper.questions.forEach((item,i)=>{const b=document.createElement("button");b.type="button";b.textContent=String(i+1);b.setAttribute("aria-current",String(i===index));b.dataset.answered=String(Object.hasOwn(answers,item.id));b.disabled=!isQuestionAvailable(item);b.addEventListener("click",()=>{activateQuestion(i).catch(error=>status(error.message||"सेक्शन नहीं खुला।"));});palette.append(b);});
    const sectionProgress = el("rm-cbt-section-progress");
    const sectionNames = [...new Set(paper.questions.map(item => typeof item.section === "string" ? item.section.trim() : "").filter(Boolean))];
    sectionProgress.replaceChildren();
    sectionProgress.hidden = sectionNames.length === 0;
    sectionNames.forEach(name => {
      const indices = paper.questions.map((item, i) => item.section === name ? i : -1).filter(i => i >= 0);
      const answeredCount = indices.filter(i => Object.hasOwn(answers,paper.questions[i].id)).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rm-cbt-section-chip";
      button.disabled = !isQuestionAvailable(paper.questions[indices[0]]);
      button.setAttribute("aria-current", String(paper.questions[index]?.section === name));
      const label = document.createElement("span"); label.textContent = name;
      const count = document.createElement("small"); count.textContent = answeredCount + "/" + indices.length + " हल";
      button.append(label, count);
      button.addEventListener("click", () => { activateQuestion(indices[0]).catch(error => status(error.message || "सेक्शन नहीं खुला।")); });
      sectionProgress.append(button);
    });
    if (Number.isInteger(focusOptionIndex)) restoreCbtOptionFocus(options, focusOptionIndex);
  }
  async function finish(auto=false){
    if(!isActive() || finished)return;finished=true;navigationRequest++;clearInterval(timer);lockCbtExamControls(root);
    try{
      let timeoutWarning="";
      if(auto){
        // At the server deadline, pending client drafts can no longer be saved. Give an
        // in-flight request a short grace period, but never let a stalled network request
        // prevent the server from finalizing the attempt.
        let graceTimer;
        await Promise.race([
          saving.catch(()=>{}),
          new Promise(resolve=>{graceTimer=setTimeout(resolve,5000);})
        ]);
        clearTimeout(graceTimer);
        if (!isActive()) return;
        if(pendingAnswers.size) timeoutWarning="Some unsaved answers were not included";
      }else{
        // A failed autosave must not short-circuit the explicit retry pass.
        // Wait for the current queue to settle, then retry every still-pending answer.
        await saving.catch(()=>{});
        await retryPending();
        if (!isActive()) return;
      }
      const score=await submitCbtExam(app,attemptId);
      if (!isActive()) return;
      // Submission is already confirmed by the server. Browser storage cleanup is best-effort
      // and must never hide a successful result when storage is disabled or quota-restricted.
      try{localStorage.removeItem(draftKey());}catch(_){}
      showResult(score,timeoutWarning);
    }catch(e){
      if (!isActive()) return;
      finished=false;el("rm-cbt-submit").disabled=false;el("rm-cbt-retry").disabled=false;render();
      if(remaining()>0&&!timer)timer=setInterval(tick,1000);
      status(e.message||"Submit असफल। इंटरनेट जाँचकर फिर प्रयास करें।");
    }
  }
  el("rm-cbt-start").addEventListener("click",async()=>{
    if (!isActive()) return;
    const button=el("rm-cbt-start");button.disabled=true;status("परीक्षा लोड हो रही है…");
    try{
      let previousAttempt=null;
      try{previousAttempt=localStorage.getItem(attemptKey());}catch(_){}
      if(!previousAttempt){
        const active=await getStudentActiveCbtAttempt(app,testId);
        if (!isActive()) return;
        if(active.found){
          previousAttempt=active.attemptId;
          try{localStorage.setItem(attemptKey(),previousAttempt);}catch(_){}
        }
      }
      if(previousAttempt){
        attemptId=previousAttempt;
        try{
          const previousResult=await getCbtAttemptResult(app,attemptId);
          if (!isActive()) return;
          showResult(previousResult);return;
        }catch(error){
          if (!isActive()) return;
          const recovery = classifyCbtAttemptResultError(error);
          if (recovery === "missing") {
            // Browser storage is only a recovery hint. If that attempt no longer
            // belongs to this student, discard the stale key and ask the server
            // for the authenticated student's authoritative active-session pointer.
            try{
              localStorage.removeItem(attemptKey());
              localStorage.removeItem(draftKey());
              localStorage.removeItem(positionKey());
            }catch(_){}
            const active = await getStudentActiveCbtAttempt(app,testId);
            if (!isActive()) return;
            if (!active?.found || typeof active.attemptId !== "string" || !active.attemptId) {
              attemptId = null;
              throw new Error("सहेजा हुआ परीक्षा सत्र सर्वर पर नहीं मिला। कृपया Start दबाकर दोबारा सत्र खोलें।");
            }
            attemptId = active.attemptId;
            try{localStorage.setItem(attemptKey(),attemptId);}catch(_){}
            if (active.status === "completed") {
              const recoveredResult = await getCbtAttemptResult(app,attemptId);
              if (!isActive()) return;
              showResult(recoveredResult);return;
            }
            if (active.status !== "in_progress") throw new Error("सर्वर से परीक्षा सत्र की स्थिति सत्यापित नहीं हो सकी।");
          } else if (recovery !== "in_progress") {
            // Network, auth, permission and configuration failures are not proof
            // that an attempt is unfinished or expired; never hide them by probing
            // another endpoint or automatically submitting the exam.
            throw error;
          }
        }
        try{
          paper=await getCbtExamQuestions(app,attemptId);
        }catch(error){
          if (!isActive()) return;
          // Only the server's explicit closed-attempt response proves the deadline
          // has passed. Network, permission, and configuration errors must never
          // trigger an irreversible submission during recovery.
          if (error?.code !== "functions/failed-precondition" || error?.message !== "Exam is closed") throw error;
          const recovered=await submitCbtExam(app,attemptId);
          if (!isActive()) return;
          try{localStorage.removeItem(draftKey());}catch(_){}
          showResult(recovered);
          status("समय सीमा समाप्त थी। परिणाम सर्वर पर सुरक्षित उत्तरों से बनाया गया है; स्थानीय unsaved Draft शामिल नहीं हो सकता।");
          return;
        }
      }else{
        const started=await startCbtExam(app,testId);
        if (!isActive()) return;
        attemptId=started.attemptId;
        try{localStorage.setItem(attemptKey(),attemptId);}catch(_){}
        paper=await getCbtExamQuestions(app,attemptId);
        if (!isActive()) return;
      }
      if (!isActive()) return;
      answers=createStudentAnswerState(paper.savedAnswers);restorePending();
      for(const [qid,value] of pendingAnswers)answers[qid]=value;
      expiresAt=new Date(paper.expiresAt).getTime();startPanel.hidden=true;workspace.hidden=false;
      let resumeIndex=0;
      try {
        const savedIndex=Number(localStorage.getItem(positionKey()));
        if(Number.isInteger(savedIndex)&&savedIndex>=0&&savedIndex<paper.questions.length)resumeIndex=savedIndex;
      } catch (_) {}
      const expiredSections=new Set(Object.entries(paper.sectionTimings||{}).filter(([,timing])=>!timing.expiresAt||new Date(timing.expiresAt).getTime()<=Date.now()).map(([name])=>name));
      const candidates=[...Array(paper.questions.length).keys()].sort((a,b)=>((a-resumeIndex+paper.questions.length)%paper.questions.length)-((b-resumeIndex+paper.questions.length)%paper.questions.length));
      const firstAvailable=candidates.find(i=>!paper.questions[i].section||!expiredSections.has(paper.questions[i].section));
      if(firstAvailable===undefined)throw new Error("सभी सेक्शन का समय समाप्त हो चुका है।");
      try { await activateQuestion(firstAvailable); }
      catch (sectionError) {
        if (!isActive()) return;
        const fallback=candidates.find(i=>i!==firstAvailable&&(!paper.questions[i].section||!expiredSections.has(paper.questions[i].section)));
        if(fallback===undefined)throw sectionError;
        await activateQuestion(fallback);
        if (!isActive()) return;
        status("पिछला सेक्शन समय-सीमा पार कर चुका था। उपलब्ध अगले सेक्शन से परीक्षा जारी है।");
      }
      if (!isActive()) return;
      if(pendingAnswers.size)retryPending().catch(()=>{});
      tick();timer=setInterval(tick,1000);
    }catch(e){if (!isActive()) return;status(e.message||"परीक्षा शुरू नहीं हुई।");button.disabled=false;}
  });
  el("rm-cbt-retry").addEventListener("click",async()=>{if (!isActive()) return;const b=el("rm-cbt-retry");b.disabled=true;try{await retryPending();if (!isActive()) return;status("सभी उत्तर सर्वर पर सुरक्षित हैं।");}catch(e){if (!isActive()) return;status(e.message||"Retry असफल।");}finally{if (isActive()) b.disabled=false;}});
  el("rm-cbt-prev").addEventListener("click",()=>{const target=findAvailableIndex(index-1,-1);if(target>=0)activateQuestion(target).catch(error=>status(error.message||"सेक्शन नहीं खुला।"));});
  el("rm-cbt-next").addEventListener("click",()=>{const target=findAvailableIndex(index+1,1);if(target>=0)activateQuestion(target).catch(error=>status(error.message||"सेक्शन नहीं खुला।"));});
  el("rm-cbt-submit").addEventListener("click",()=>{if(confirm("क्या आप परीक्षा Submit करना चाहते हैं?"))finish(false);});
  const connection=el("rm-cbt-connection");
  const setConnectionState=online=>{if(!connection)return;connection.dataset.state=online?"online":"offline";connection.textContent=online?"Online · connected":"Offline · no connection";};
  const onOffline=()=>{if (!isActive()) return;setConnectionState(false);if(attemptId&&!finished){status("इंटरनेट कनेक्शन बंद है। उत्तर इस डिवाइस पर अस्थायी रूप से सुरक्षित होंगे; परीक्षा बंद न करें।");el("rm-cbt-saved").textContent="Offline · answers pending";}};
  const onOnline=()=>{if (!isActive()) return;setConnectionState(true);if(attemptId&&pendingAnswers.size&&!finished){status("इंटरनेट वापस आ गया है। लंबित उत्तर सेव किए जा रहे हैं…");retryPending().then(()=>status("सभी लंबित उत्तर सर्वर पर सुरक्षित हैं।")).catch(()=>status("कनेक्शन वापस आया है, लेकिन कुछ उत्तर अभी सेव नहीं हुए। Retry दबाएँ।"));}};
  const onBeforeUnload=event=>{
    if(isActive()&&!finished&&(pendingAnswers.size||inFlightSaves.size)){
      event.preventDefault();
      event.returnValue="";
    }
  };
  const onPageHide=()=>{if(isActive()&&pendingAnswers.size)persistPending();};
  if(typeof window!=="undefined"){
    window.addEventListener("offline",onOffline);
    window.addEventListener("online",onOnline);
    window.addEventListener("beforeunload",onBeforeUnload);
    window.addEventListener("pagehide",onPageHide);
    setConnectionState(window.navigator?.onLine!==false);
    if(window.navigator?.onLine===false)onOffline();
  }
  return { destroy(){lifecycle.destroy();clearInterval(timer);navigationRequest++;if(typeof window!=="undefined"){window.removeEventListener("offline",onOffline);window.removeEventListener("online",onOnline);window.removeEventListener("beforeunload",onBeforeUnload);window.removeEventListener("pagehide",onPageHide);}} };
}