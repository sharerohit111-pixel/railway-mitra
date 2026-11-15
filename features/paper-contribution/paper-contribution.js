import { app, auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const functions = getFunctions(app, "asia-south1");
const submitPaper = httpsCallable(functions, "submitPreviousPaper");
const getMyReward = httpsCallable(functions, "getMyContributorReward");
const listPapers = httpsCallable(functions, "listMyPreviousPaperSubmissions");
const gate = document.getElementById("paperAuthGate");
const appArea = document.getElementById("paperApp");
const history = document.getElementById("paperHistory");
const form = document.getElementById("paperForm");
const fileInput = document.getElementById("paperPdf");
const fileName = document.getElementById("paperFileName");
const message = document.getElementById("paperMessage");
const submitButton = document.getElementById("paperSubmit");
const MAX_FILE_BYTES = 5 * 1024 * 1024;
let language = localStorage.getItem("rm-paper-language") || "hi";

const translations = {
  hi: {
    home:"⌂ Home", heroTitle:"आपके पास कोई Previous Paper है?", heroText:"किसी भी Competitive Exam का Previous Year Question Paper हमारे साथ साझा करें। खासकर Railway Departmental Exams के LDCE और GDCE papers की हमें बहुत आवश्यकता है।",
    heroNote:"आपका एक पेपर किसी दूसरे कर्मचारी की तैयारी में बड़ा योगदान दे सकता है। कृपया इस अनुरोध को नज़रअंदाज़ न करें।",
    signInTitle:"पहले Railway Mitra में Sign in करें", signInText:"पेपर को आपके account से सुरक्षित रूप से जोड़ने के लिए sign in आवश्यक है।", signInButton:"Sign in करें",
    uploadTitle:"Previous Paper Upload करें", uploadSubtitle:"जानकारी भरें और PDF फ़ाइल चुनें।", categoryLabel:"Exam Category", ldce:"Railway LDCE", gdce:"Railway GDCE", otherExam:"Other Competitive Exam",
    examNameLabel:"Exam का नाम / Post (Optional)", heldOnLabel:"यह परीक्षा कब आयोजित हुई थी? (Optional)", choosePdf:"PDF चुनें / Upload PDF", pdfHint:"केवल PDF · अधिकतम 5 MB", pdfLabel:"Question Paper की PDF",
    privacyTitle:"आपकी व्यक्तिगत जानकारी गोपनीय रखी जाएगी", privacyText:"आपका पेपर private storage में रखा जाएगा। इसे केवल अधिकृत Railway Mitra admin देख सकेगा। हम access controls और सुरक्षित data handling का उपयोग करते हैं। इंटरनेट पर कोई भी सेवा 100% सुरक्षा की गारंटी नहीं दे सकती। कृपया PDF में Aadhaar, बैंक विवरण या अन्य अनावश्यक संवेदनशील जानकारी हो तो उसे छिपाकर अपलोड करें।",
    consent:"मैं पुष्टि करता/करती हूँ कि मुझे यह पेपर साझा करने की अनुमति है और इसमें अनावश्यक निजी जानकारी नहीं है।", submit:"पेपर साझा करें",
    historyTitle:"मेरे साझा किए गए पेपर", historySubtitle:"आपके द्वारा भेजे गए पेपर की स्थिति।", refresh:"Refresh", loading:"लोड हो रहा है…", footer:"Railway Mitra · Your Railway Digital Companion",
    pdfOnly:"केवल PDF · अधिकतम 5 MB", tooLarge:"PDF का आकार 5 MB से कम होना चाहिए।", choosePaper:"कृपया Previous Paper की PDF चुनें।", invalidPdf:"केवल 5 MB तक की PDF फ़ाइल अपलोड करें।", consentRequired:"कृपया sharing confirmation स्वीकार करें।",
    uploading:"आपकी PDF सुरक्षित रूप से जमा की जा रही है…", uploaded:"धन्यवाद! आपका Previous Paper Railway Mitra को सफलतापूर्वक मिल गया है।", noHistory:"अभी तक आपने कोई पेपर साझा नहीं किया है।",
    received:"Railway Mitra को प्राप्त", examDate:"परीक्षा दिनांक", signInAgain:"आपका login session समाप्त हो गया है। कृपया दोबारा sign in करें।", invalidInfo:"कृपया सभी जानकारी और PDF सही से जाँचें।", unavailable:"अभी सेवा उपलब्ध नहीं है। कुछ देर बाद फिर कोशिश करें।", denied:"आपका access सत्यापित नहीं हो पाया। दोबारा sign in करके प्रयास करें।", genericError:"पेपर अपलोड नहीं हो पाया। इंटरनेट जाँचकर दोबारा प्रयास करें।"
  },
  en: {
    home:"⌂ Home", heroTitle:"Do you have a previous exam paper?", heroText:"Share previous-year question papers from any competitive exam. We especially need Railway Departmental LDCE and GDCE papers.",
    heroNote:"Your paper could make a real difference to another employee's preparation. Please don't ignore this request.",
    signInTitle:"Sign in to Railway Mitra first", signInText:"Please sign in so your contribution can be securely associated with your account.", signInButton:"Sign in",
    uploadTitle:"Upload a Previous Paper", uploadSubtitle:"Add the details and choose a PDF file.", categoryLabel:"Exam Category", ldce:"Railway LDCE", gdce:"Railway GDCE", otherExam:"Other Competitive Exam",
    examNameLabel:"Exam name / Post (Optional)", heldOnLabel:"When was the exam held? (Optional)", choosePdf:"Choose PDF / Upload PDF", pdfHint:"PDF only · Maximum 5 MB", pdfLabel:"Question Paper PDF",
    privacyTitle:"Your personal information will be kept private", privacyText:"Your paper will be stored in private storage and can only be viewed by an authorised Railway Mitra admin. We use access controls and secure data handling. No internet service can guarantee 100% security. Please hide Aadhaar, bank details or other unnecessary sensitive information before uploading.",
    consent:"I confirm that I am allowed to share this paper and that it contains no unnecessary personal information.", submit:"Submit Paper",
    historyTitle:"My Shared Papers", historySubtitle:"Status of papers you have submitted.", refresh:"Refresh", loading:"Loading…", footer:"Railway Mitra · Your Railway Digital Companion",
    pdfOnly:"PDF only · Maximum 5 MB", tooLarge:"The PDF must be smaller than 5 MB.", choosePaper:"Please choose the previous paper PDF.", invalidPdf:"Upload a valid PDF up to 5 MB only.", consentRequired:"Please accept the sharing confirmation.",
    uploading:"Submitting your PDF securely…", uploaded:"Thank you! Railway Mitra has received your previous paper.", noHistory:"You have not shared any papers yet.",
    received:"Received by Railway Mitra", examDate:"Exam date", signInAgain:"Your login session has expired. Please sign in again.", invalidInfo:"Please check the information and PDF.", unavailable:"The service is unavailable right now. Please try again later.", denied:"Your access could not be verified. Please sign in again.", genericError:"The paper could not be uploaded. Check your connection and try again."
  }
};
function t(key){ return translations[language][key] || translations.en[key] || key; }
function applyLanguage(){
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach(node => { const key=node.dataset.i18n; if(translations[language][key]) node.textContent=t(key); });
  document.querySelectorAll("[data-i18n-aria]").forEach(node => { const key=node.dataset.i18nAria; node.setAttribute("aria-label",t(key)); });
  document.getElementById("paperLanguageToggle").textContent = language === "hi" ? "English" : "हिन्दी";
  if (!fileInput.files?.length) fileName.textContent=t("pdfHint");
}

function readableError(error) {
  const code = String(error?.code || "");
  if (code.includes("unauthenticated")) return t("signInAgain");
  if (code.includes("invalid-argument")) return error.message || t("invalidInfo");
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return t("unavailable");
  if (code.includes("permission-denied")) return t("denied");
  return t("genericError");
}
function formatDate(ms) { return ms ? new Date(ms).toLocaleString(language==="hi"?"hi-IN":"en-IN",{dateStyle:"medium",timeStyle:"short"}) : (language==="hi"?"अभी-अभी":"Just now"); }
function toBase64(buffer) { const bytes=new Uint8Array(buffer);let binary="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary); }
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
async function loadRewardSummary(){
 const section=document.getElementById("paperRewardSummary");
 const text=document.getElementById("paperRewardText");
 try { const result=await getMyReward({}); const reward=result.data||{}; const badge=reward.badge ? " · "+reward.badge.emoji+" "+reward.badge.label : ""; text.textContent=(reward.totalPoints||0)+" points"+badge+" · Free mock tests earned: "+(reward.freeMockTestsEarned||0); section.hidden=false; } catch(error) { section.hidden=true; }
}
async function loadHistory(){
 const list=document.getElementById("paperHistoryList");list.replaceChildren(element("p","",t("loading")));
 try{
  const result=await listPapers({});const submissions=result.data.submissions||[];list.replaceChildren();
  if(!submissions.length){list.append(element("p","",t("noHistory")));return;}
  submissions.forEach(item=>{const card=element("article","rm-paper-history-item");card.append(element("strong","",item.examName||item.examCategory));card.append(element("p","",(item.examCategory||"")+(item.heldOn?" · "+t("examDate")+": "+item.heldOn:"")));card.append(element("p","",(item.originalFileName||"PDF")+" · "+formatDate(item.createdAt)));card.append(element("span","rm-paper-status",item.status==="received"?t("received"):item.status));list.append(card);});
 }catch(error){list.replaceChildren(element("p","rm-paper-message error",readableError(error)));}
}
fileInput.addEventListener("change",()=>{const file=fileInput.files?.[0];if(!file){fileName.textContent=t("pdfHint");return;}fileName.textContent=file.name+" · "+(file.size/1024/1024).toFixed(2)+" MB";if(file.size>MAX_FILE_BYTES){message.textContent=t("tooLarge");message.classList.add("error");fileInput.value="";fileName.textContent=t("pdfHint");}else{message.textContent="";message.classList.remove("error");}});
form.addEventListener("submit",async event=>{
 event.preventDefault();const file=fileInput.files?.[0];
 if(!file){message.textContent=t("choosePaper");message.classList.add("error");return;}
 if(file.size<=0||file.size>MAX_FILE_BYTES||(!file.type.includes("pdf")&&!file.name.toLowerCase().endsWith(".pdf"))){message.textContent=t("invalidPdf");message.classList.add("error");return;}
 if(!document.getElementById("paperConsent").checked){message.textContent=t("consentRequired");message.classList.add("error");return;}
 submitButton.disabled=true;message.classList.remove("error");message.textContent=t("uploading");
 try{
  const payload={examCategory:document.getElementById("paperCategory").value,examName:document.getElementById("paperName").value.trim(),heldOn:document.getElementById("paperHeldOn").value,fileName:file.name,fileBase64:toBase64(await file.arrayBuffer())};
  await submitPaper(payload);form.reset();fileName.textContent=t("pdfHint");message.textContent=t("uploaded");await loadHistory();
 }catch(error){message.textContent=readableError(error);message.classList.add("error");}finally{submitButton.disabled=false;}
});
document.getElementById("paperRefresh").addEventListener("click",loadHistory);
const today=new Date();document.getElementById("paperHeldOn").max=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
onAuthStateChanged(auth,user=>{gate.hidden=!!user;appArea.hidden=!user;history.hidden=!user;if(user){loadHistory();loadRewardSummary();}});
applyLanguage();
