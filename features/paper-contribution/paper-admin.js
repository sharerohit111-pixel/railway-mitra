import { app, auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const functions = getFunctions(app, "asia-south1");
const listPapers = httpsCallable(functions, "adminListPreviousPaperSubmissions");
const getDownload = httpsCallable(functions, "adminGetPreviousPaperDownloadUrl");
const gate = document.getElementById("adminGate");
const inbox = document.getElementById("adminInbox");
const message = document.getElementById("adminMessage");
const list = document.getElementById("adminList");
let ownerVerified = false;

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function formatDate(ms) {
  return ms ? new Date(ms).toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" }) : "—";
}
async function loadPapers() {
  if (!ownerVerified) return;
  list.replaceChildren(node("p","","Loading submissions…"));
  try {
    const result = await listPapers({});
    const papers = result.data.submissions || [];
    list.replaceChildren();
    if (!papers.length) {
      list.append(node("p","","No previous papers have been submitted yet."));
      return;
    }
    papers.forEach(paper => {
      const card = node("article","rm-paper-history-item");
      card.append(node("strong","",paper.examName || paper.examCategory));
      card.append(node("p","",paper.examCategory + " · Exam held: " + paper.heldOn));
      card.append(node("p","",paper.originalFileName + " · " + (paper.fileSize / 1024 / 1024).toFixed(2) + " MB"));
      card.append(node("p","","Received: " + formatDate(paper.createdAt)));
      const button = node("button","rm-paper-submit","Generate private PDF link");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Preparing secure link…";
        try {
          const response = await getDownload({ submissionId:paper.id });
          const anchor = node("a","rm-paper-submit","Open PDF (valid for 5 minutes)");
          anchor.href = response.data.url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.download = paper.originalFileName || "previous-paper.pdf";
          button.replaceWith(anchor);
        } catch (error) {
          button.disabled = false;
          button.textContent = "Try again";
          alert(error?.message || "Could not generate the private download link.");
        }
      });
      card.append(button);
      list.append(card);
    });
  } catch (error) {
    list.replaceChildren(node("p","rm-paper-message error",error?.message || "Could not load submissions."));
  }
}
document.getElementById("adminRefresh").addEventListener("click",loadPapers);
onAuthStateChanged(auth, async user => {
  ownerVerified = false;
  inbox.hidden = true;
  gate.hidden = false;
  if (!user) {
    message.textContent = "Sign in with the owner admin account to access this inbox.";
    return;
  }
  try {
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      message.textContent = "Access denied. This inbox is available only to the Railway Mitra owner admin.";
      return;
    }
    ownerVerified = true;
    message.textContent = "Owner access verified.";
    inbox.hidden = false;
    await loadPapers();
  } catch (error) {
    message.textContent = "Could not verify owner access. Please sign in again.";
  }
});
