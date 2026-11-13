import { startCbtExam, getCbtExamQuestions, saveCbtAnswer, submitCbtExam, getCbtAttemptResult, getStudentActiveCbtAttempt } from "../cloud/student-client.js";

export function initStudentCbtExam({ app, testId, root = document }) {
  const el = id => root.getElementById(id);
  const startPanel=el("rm-cbt-start-panel"), workspace=el("rm-cbt-workspace"), resultPanel=el("rm-cbt-result");
  let attemptId=null, paper=null, index=0, answers={}, pendingAnswers=new Map(), expiresAt=0, timer=null, saving=Promise.resolve(), finished=false;
  const status = message => { el("rm-cbt-status").textContent=message; };
  const attemptKey = () => "rm-cbt-attempt:" + (app?.options?.appId || "app") + ":" + testId;
  const draftKey = () => "rm-cbt-pending:" + (app?.options?.appId || "app") + ":" + testId + ":" + attemptId;
  function showResult(score, warning=""){
    clearInterval(timer);
    startPanel.hidden=true;workspace.hidden=true;resultPanel.hidden=false;
    try{if(attemptId)localStorage.removeItem(draftKey());}catch(_){}
    el("rm-cbt-score").textContent="Score: "+score.score+" · Correct: "+score.correct+" · Wrong: "+score.wrong+" · Unattempted: "+score.unattempted+(score.timedOut?" · Time expired":"")+(warning?" · "+warning:"");
  }
  function persistPending(){
    if(!attemptId)return;
    try{
      const key=draftKey();
      if(pendingAnswers.size) localStorage.setItem(key,JSON.stringify([...pendingAnswers.entries()]));
      else localStorage.removeItem(key);
    }catch(_){status("स्थानीय Draft सुरक्षित नहीं हो सका। परीक्षा खुली रखें और सेव स्थिति जाँचें।");}
  }
  function restorePending(){
    try{
      const raw=localStorage.getItem(draftKey());
      if(!raw)return;
      const entries=JSON.parse(raw);
      if(!Array.isArray(entries))return;
      const validQuestions=new Map(paper.questions.map(q=>[q.id,q]));
      let discarded=0;
      for(const pair of entries){
        if(!Array.isArray(pair)||pair.length!==2) { discarded++; continue; }
        const [qid,value]=pair, question=validQuestions.get(qid);
        const optionIndex=Number(value);
        if(!question||!Number.isInteger(optionIndex)||optionIndex<0||optionIndex>=question.options.length) { discarded++; continue; }
        pendingAnswers.set(qid,String(optionIndex));
      }
      if(discarded)status("कुछ पुराने/अमान्य Draft हटाए गए; सर्वर पर सेव उत्तर सुरक्षित हैं।");
      if(!pendingAnswers.size)localStorage.removeItem(draftKey());
    }catch(_){status("स्थानीय Draft पढ़ा नहीं जा सका। सर्वर पर सेव उत्तर उपलब्ध रहेंगे।");}
  }
  const remaining = () => Math.max(0, Math.ceil((expiresAt-Date.now())/1000));
  function tick(){ const s=remaining(); el("rm-cbt-clock").textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); if(!s&&!finished) finish(true); }
  function queueSave(qid,value){
    pendingAnswers.set(qid,value);
    persistPending();
    el("rm-cbt-saved").textContent="Saving…";
    saving=saving.catch(()=>{}).then(()=>saveCbtAnswer(app,attemptId,qid,value)).then(()=>{
      if(pendingAnswers.get(qid)===value)pendingAnswers.delete(qid);
      persistPending();
      el("rm-cbt-saved").textContent=pendingAnswers.size?"Some answers pending":"All changes saved";
      el("rm-cbt-retry").hidden=pendingAnswers.size===0;
    }).catch(e=>{
      el("rm-cbt-saved").textContent="Save failed · "+pendingAnswers.size+" pending";
      el("rm-cbt-retry").hidden=false;
      status(e.message||"उत्तर सेव नहीं हुआ। इंटरनेट जाँचकर Retry दबाएँ।");
      throw e;
    });
    return saving;
  }
  async function retryPending(){
    const entries=[...pendingAnswers.entries()];
    for(const [qid,value] of entries){
      // A newer selection may have replaced this snapshot while retry was waiting.
      if(pendingAnswers.get(qid)!==value) continue;
      await queueSave(qid,value);
    }
    if(pendingAnswers.size) throw new Error("कुछ उत्तर अभी सर्वर पर सेव नहीं हुए हैं।");
  }
  function render(){
    const q=paper.questions[index]; el("rm-cbt-count").textContent="Question "+(index+1)+" of "+paper.questions.length;
    const sectionHeading = el("rm-cbt-section");
    sectionHeading.textContent = q.section || "";
    sectionHeading.hidden = !q.section;
    el("rm-cbt-question").textContent=q.text;
    const options=el("rm-cbt-options"); options.replaceChildren();
    q.options.forEach((value,i)=>{const b=document.createElement("button");b.type="button";b.className="rm-cbt-option";b.setAttribute("aria-pressed",String(String(answers[q.id])===String(i)));const mark=document.createElement("b");mark.textContent=String.fromCharCode(65+i)+".";
      const label=document.createElement("span");label.textContent=value;b.append(mark,label);b.addEventListener("click",()=>{answers[q.id]=String(i);render();queueSave(q.id,String(i)).catch(()=>{});});options.append(b);});
    el("rm-cbt-prev").disabled=index===0;el("rm-cbt-next").disabled=index===paper.questions.length-1;
    const palette=el("rm-cbt-palette");palette.replaceChildren();
    paper.questions.forEach((item,i)=>{const b=document.createElement("button");b.type="button";b.textContent=String(i+1);b.setAttribute("aria-current",String(i===index));b.dataset.answered=String(answers[item.id]!==undefined);b.addEventListener("click",()=>{index=i;render();});palette.append(b);});
  }
  async function finish(auto=false){
    if(finished)return;finished=true;clearInterval(timer);el("rm-cbt-submit").disabled=true;
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
        if(pendingAnswers.size) timeoutWarning="Some unsaved answers were not included";
      }else{
        await saving;
        await retryPending();
      }
      const score=await submitCbtExam(app,attemptId);
      // Submission is already confirmed by the server. Browser storage cleanup is best-effort
      // and must never hide a successful result when storage is disabled or quota-restricted.
      try{localStorage.removeItem(draftKey());}catch(_){}
      showResult(score,timeoutWarning);
    }catch(e){
      finished=false;el("rm-cbt-submit").disabled=false;
      if(remaining()>0&&!timer)timer=setInterval(tick,1000);
      status(e.message||"Submit असफल। इंटरनेट जाँचकर फिर प्रयास करें।");
    }
  }
  el("rm-cbt-start").addEventListener("click",async()=>{
    const button=el("rm-cbt-start");button.disabled=true;status("परीक्षा लोड हो रही है…");
    try{
      let previousAttempt=null;
      try{previousAttempt=localStorage.getItem(attemptKey());}catch(_){}
      if(!previousAttempt){
        const active=await getStudentActiveCbtAttempt(app,testId);
        if(active.found){
          previousAttempt=active.attemptId;
          try{localStorage.setItem(attemptKey(),previousAttempt);}catch(_){}
        }
      }
      if(previousAttempt){
        attemptId=previousAttempt;
        try{
          const previousResult=await getCbtAttemptResult(app,attemptId);
          showResult(previousResult);return;
        }catch(_){/* Not submitted yet; inspect the original server attempt. */}
        try{
          paper=await getCbtExamQuestions(app,attemptId);
        }catch(_){
          // If the server deadline has passed, submit only server-persisted answers.
          const recovered=await submitCbtExam(app,attemptId);
          try{localStorage.removeItem(draftKey());}catch(_){}
          showResult(recovered);
          status("समय सीमा समाप्त थी। परिणाम सर्वर पर सुरक्षित उत्तरों से बनाया गया है; स्थानीय unsaved Draft शामिल नहीं हो सकता।");
          return;
        }
      }else{
        const started=await startCbtExam(app,testId);attemptId=started.attemptId;
        try{localStorage.setItem(attemptKey(),attemptId);}catch(_){}
        paper=await getCbtExamQuestions(app,attemptId);
      }
      answers={...paper.savedAnswers};restorePending();
      for(const [qid,value] of pendingAnswers)answers[qid]=value;
      expiresAt=new Date(paper.expiresAt).getTime();startPanel.hidden=true;workspace.hidden=false;render();
      if(pendingAnswers.size)retryPending().catch(()=>{});
      tick();timer=setInterval(tick,1000);
    }catch(e){status(e.message||"परीक्षा शुरू नहीं हुई।");button.disabled=false;}
  });
  el("rm-cbt-retry").addEventListener("click",async()=>{const b=el("rm-cbt-retry");b.disabled=true;try{await retryPending();status("सभी उत्तर सर्वर पर सुरक्षित हैं।");}catch(e){status(e.message||"Retry असफल।");}finally{b.disabled=false;}});
  el("rm-cbt-prev").addEventListener("click",()=>{if(index>0){index--;render();}});
  el("rm-cbt-next").addEventListener("click",()=>{if(index<paper.questions.length-1){index++;render();}});
  el("rm-cbt-submit").addEventListener("click",()=>{if(confirm("क्या आप परीक्षा Submit करना चाहते हैं?"))finish(false);});
  const onOnline=()=>{if(attemptId&&pendingAnswers.size&&!finished){status("इंटरनेट वापस आ गया है। लंबित उत्तर सेव किए जा रहे हैं…");retryPending().then(()=>status("सभी लंबित उत्तर सर्वर पर सुरक्षित हैं।")).catch(()=>{});}};
  if(typeof window!=="undefined")window.addEventListener("online",onOnline);
  return { destroy(){clearInterval(timer);if(typeof window!=="undefined")window.removeEventListener("online",onOnline);} };
}