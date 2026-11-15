import { app, auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const functions = getFunctions(app, "asia-south1");
const listPapers = httpsCallable(functions, "adminListPreviousPaperSubmissions");
const getDownload = httpsCallable(functions, "adminGetPreviousPaperDownloadUrl");
const approvePaper = httpsCallable(functions, "adminApprovePreviousPaperSubmission");
const recordEmailPaper = httpsCallable(functions, "adminRecordEmailPaperContribution");
const emailForm = document.getElementById("emailPaperForm");
const emailFormPanel = document.getElementById("emailContributionForm");
const emailMessage = document.getElementById("emailPaperMessage");
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
      const approve = node("button","rm-paper-submit",paper.status === "approved" ? "Approved · " + (paper.pointsAwarded || 0) + " points" : "Approve & award points");
      approve.type = "button";
      approve.disabled = paper.status === "approved";
      approve.addEventListener("click", async () => {
        if (!confirm("Approve this paper and award contributor points?")) return;
        approve.disabled = true;
        approve.textContent = "Approving…";
        try {
          const response = await approvePaper({ submissionId: paper.id });
          approve.textContent = "Approved · " + (response.data.pointsAwarded || 0) + " points";
          await loadPapers();
        } catch (error) {
          approve.disabled = false;
          approve.textContent = "Try approval again";
          alert(error?.message || "Could not approve this paper.");
        }
      });
      card.append(approve);
      list.append(card);
    });
  } catch (error) {
    list.replaceChildren(node("p","rm-paper-message error",error?.message || "Could not load submissions."));
  }
}

emailForm.addEventListener("submit", async event => {
  event.preventDefault();
  const file = document.getElementById("emailPaperFile").files?.[0];
  if (!file) { emailMessage.textContent = "Choose the PDF received by email."; return; }
  if (file.size <= 0 || file.size > 5 * 1024 * 1024 || (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf"))) {
    emailMessage.textContent = "Choose a valid PDF up to 5 MB."; return;
  }
  const button = document.getElementById("emailPaperSave");
  button.disabled = true; emailMessage.textContent = "Saving private email contribution…";
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the selected PDF."));
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.readAsDataURL(file);
    });
    const result = await recordEmailPaper({
      contributorEmail: document.getElementById("emailContributorAddress").value.trim(),
      examCategory: document.getElementById("emailPaperCategory").value,
      examName: document.getElementById("emailPaperName").value.trim(),
      heldOn: document.getElementById("emailPaperDate").value,
      fileName: file.name, fileBase64: base64
    });
    emailMessage.textContent = "Saved for review. Submission ID: " + result.data.submission.id + ". Approve it below after checking the PDF.";
    emailForm.reset();
    await loadPapers();
  } catch (error) {
    emailMessage.textContent = error?.message || "Could not save the email contribution.";
  } finally { button.disabled = false; }
});
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
    emailFormPanel.hidden = false;
    await loadPapers();
  } catch (error) {
    message.textContent = "Could not verify owner access. Please sign in again.";
  }
});
