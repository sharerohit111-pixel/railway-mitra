import { app, auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const functions = getFunctions(app, "asia-south1");
const submitPaper = httpsCallable(functions, "submitPreviousPaper");
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

function readableError(error) {
  const code = String(error?.code || "");
  if (code.includes("unauthenticated")) return "आपका login session समाप्त हो गया है। कृपया दोबारा sign in करें।";
  if (code.includes("invalid-argument")) return error.message || "कृपया सभी जानकारी और PDF सही से जाँचें।";
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return "अभी सेवा उपलब्ध नहीं है। कुछ देर बाद फिर कोशिश करें।";
  if (code.includes("permission-denied")) return "आपका access सत्यापित नहीं हो पाया। दोबारा sign in करके प्रयास करें।";
  return "पेपर अपलोड नहीं हो पाया। इंटरनेट जाँचकर दोबारा प्रयास करें।";
}
function formatDate(ms) {
  return ms ? new Date(ms).toLocaleString("hi-IN", { dateStyle:"medium", timeStyle:"short" }) : "अभी-अभी";
}
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
async function loadHistory() {
  const list = document.getElementById("paperHistoryList");
  list.replaceChildren(element("p", "", "आपके पेपर लोड हो रहे हैं…"));
  try {
    const result = await listPapers({});
    const submissions = result.data.submissions || [];
    list.replaceChildren();
    if (!submissions.length) {
      list.append(element("p", "", "अभी तक आपने कोई पेपर साझा नहीं किया है।"));
      return;
    }
    submissions.forEach(item => {
      const card = element("article", "rm-paper-history-item");
      card.append(element("strong", "", item.examName || item.examCategory));
      card.append(element("p", "", (item.examCategory || "") + " · परीक्षा दिनांक: " + (item.heldOn || "—")));
      card.append(element("p", "", (item.originalFileName || "PDF") + " · " + formatDate(item.createdAt)));
      card.append(element("span", "rm-paper-status", item.status === "received" ? "Received by Railway Mitra" : item.status));
      list.append(card);
    });
  } catch (error) {
    list.replaceChildren(element("p", "rm-paper-message error", readableError(error)));
  }
}
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) {
    fileName.textContent = "केवल PDF · अधिकतम 5 MB";
    return;
  }
  fileName.textContent = file.name + " · " + (file.size / 1024 / 1024).toFixed(2) + " MB";
  if (file.size > MAX_FILE_BYTES) {
    message.textContent = "PDF का आकार 5 MB से कम होना चाहिए।";
    message.classList.add("error");
    fileInput.value = "";
    fileName.textContent = "केवल PDF · अधिकतम 5 MB";
  } else {
    message.textContent = "";
    message.classList.remove("error");
  }
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) {
    message.textContent = "कृपया Previous Paper की PDF चुनें।";
    message.classList.add("error");
    return;
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES || (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf"))) {
    message.textContent = "केवल 5 MB तक की PDF फ़ाइल अपलोड करें।";
    message.classList.add("error");
    return;
  }
  if (!document.getElementById("paperConsent").checked) {
    message.textContent = "कृपया sharing confirmation स्वीकार करें।";
    message.classList.add("error");
    return;
  }

  submitButton.disabled = true;
  message.classList.remove("error");
  message.textContent = "आपकी PDF सुरक्षित रूप से जमा की जा रही है…";
  try {
    const payload = {
      examCategory: document.getElementById("paperCategory").value,
      examName: document.getElementById("paperName").value.trim(),
      heldOn: document.getElementById("paperHeldOn").value,
      fileName: file.name,
      fileBase64: toBase64(await file.arrayBuffer())
    };
    await submitPaper(payload);
    form.reset();
    fileName.textContent = "केवल PDF · अधिकतम 5 MB";
    message.textContent = "धन्यवाद! आपका Previous Paper Railway Mitra को सफलतापूर्वक मिल गया है।";
    await loadHistory();
  } catch (error) {
    message.textContent = readableError(error);
    message.classList.add("error");
  } finally {
    submitButton.disabled = false;
  }
});
document.getElementById("paperRefresh").addEventListener("click", loadHistory);
const today = new Date();
const localToday = [today.getFullYear(), String(today.getMonth()+1).padStart(2,"0"), String(today.getDate()).padStart(2,"0")].join("-");
document.getElementById("paperHeldOn").max = localToday;

onAuthStateChanged(auth, user => {
  gate.hidden = !!user;
  appArea.hidden = !user;
  history.hidden = !user;
  if (user) loadHistory();
});
