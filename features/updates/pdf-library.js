import { auth, storage } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  ref, listAll, getDownloadURL, getMetadata, uploadBytesResumable, deleteObject
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js";

const CATEGORIES = ["rbe", "pay", "exam", "transfer", "medical", "zone", "other"];
const CATEGORY_LABELS = {
  rbe: "आधिकारिक घोषणाएँ", pay: "वेतन एवं कर्मचारी लाभ",
  exam: "भर्ती एवं परीक्षाएँ", transfer: "सुरक्षा एवं परिचालन",
  medical: "यात्री एवं ट्रेन सेवाएँ", zone: "जोन एवं परियोजनाएँ",
  other: "अन्य अपडेट"
};
const panel = document.getElementById("pdfAdminPanel");
const form = document.getElementById("pdfUploadForm");
const categorySelect = document.getElementById("pdfCategory");
const titleInput = document.getElementById("pdfTitle");
const descriptionInput = document.getElementById("pdfDescription");
const fileInput = document.getElementById("pdfFile");
const uploadButton = document.getElementById("pdfUploadButton");
const status = document.getElementById("pdfAdminStatus");
const list = document.getElementById("pdfDocumentList");
const count = document.getElementById("pdfCount");
let currentUser = null;
let isOwnerAdmin = false;
let activeCategory = "all";

function activeFilter() {
  const active = document.querySelector(".rm-category.active");
  return active?.dataset.category || "all";
}
function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
async function collectFiles(category) {
  const root = ref(storage, `updates/${category}`);
  const rootResult = await listAll(root);
  const files = [];
  for (const folder of rootResult.prefixes) {
    const nested = await listAll(folder);
    for (const item of nested.items) {
      try {
        const [metadata, url] = await Promise.all([getMetadata(item), getDownloadURL(item)]);
        if (metadata.contentType !== "application/pdf" && !item.name.toLowerCase().endsWith(".pdf")) continue;
        files.push({
          ref: item, url, metadata,
          title: safeText(metadata.customMetadata?.title, item.name),
          description: safeText(metadata.customMetadata?.description),
          category,
          uploadedAt: safeText(metadata.customMetadata?.uploadedAt, metadata.timeCreated || "")
        });
      } catch (error) {
        console.warn("Could not read an Updates PDF:", error);
      }
    }
  }
  return files;
}
async function refreshLibrary() {
  activeCategory = activeFilter();
  list.replaceChildren(node("p", "", "PDF दस्तावेज़ लोड हो रहे हैं…"));
  count.textContent = "…";
  try {
    const categories = activeCategory === "all" ? CATEGORIES : [activeCategory];
    const groups = await Promise.all(categories.map(collectFiles));
    const files = groups.flat().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    list.replaceChildren();
    count.textContent = `${files.length} PDF`;
    if (!files.length) {
      list.append(node("p", "rm-pdf-empty", "इस श्रेणी में अभी कोई PDF अपलोड नहीं है।"));
      return;
    }
    for (const file of files) {
      const card = node("article", "rm-pdf-card");
      const icon = node("span", "rm-pdf-icon", "📄");
      const content = node("div", "rm-pdf-content");
      content.append(node("strong", "", file.title));
      content.append(node("small", "", CATEGORY_LABELS[file.category] || file.category));
      if (file.description) content.append(node("p", "", file.description));
      const actions = node("div", "rm-pdf-actions");
      const view = node("a", "rm-pdf-view", "देखें");
      view.href = file.url; view.target = "_blank"; view.rel = "noopener noreferrer";
      const download = node("a", "rm-pdf-download", "Download");
      download.href = file.url; download.target = "_blank"; download.rel = "noopener noreferrer";
      actions.append(view, download);
      if (isOwnerAdmin && file.metadata.customMetadata?.uploadedBy === currentUser?.uid) {
        const remove = node("button", "rm-pdf-delete", "Delete");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!confirm(`“${file.title}” को हटाना चाहते हैं?`)) return;
          remove.disabled = true;
          try {
            await deleteObject(file.ref);
            status.textContent = "PDF हटा दी गई।";
            await refreshLibrary();
          } catch (error) {
            console.error(error);
            status.textContent = "PDF नहीं हटाई जा सकी। Storage Rules और Admin अनुमति जाँचें।";
            remove.disabled = false;
          }
        });
        actions.append(remove);
      }
      content.append(actions);
      card.append(icon, content);
      list.append(card);
    }
  } catch (error) {
    console.error("Updates PDF library failed:", error);
    count.textContent = "उपलब्ध नहीं";
    list.replaceChildren(node("p", "rm-pdf-empty", "PDF लाइब्रेरी लोड नहीं हुई। Firebase Storage bucket और Storage Rules की जाँच आवश्यक है।"));
  }
}
onAuthStateChanged(auth, async user => {
  currentUser = user;
  isOwnerAdmin = false;
  panel.hidden = true;
  if (user) {
    try {
      const token = await user.getIdTokenResult(true);
      isOwnerAdmin = token.claims.admin === true;
      panel.hidden = !isOwnerAdmin;
    } catch (error) {
      console.error("Updates admin claim check failed:", error);
    }
  }
  await refreshLibrary();
});
document.getElementById("categoryFilters")?.addEventListener("click", event => {
  if (event.target.closest("button[data-category]")) {
    categorySelect.value = event.target.closest("button[data-category]").dataset.category === "all"
      ? "exam" : event.target.closest("button[data-category]").dataset.category;
    refreshLibrary();
  }
});
form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isOwnerAdmin || !currentUser) {
    status.textContent = "Upload के लिए Owner Admin sign-in आवश्यक है।";
    return;
  }
  const file = fileInput.files?.[0];
  const category = categorySelect.value;
  const title = titleInput.value.trim();
  if (!CATEGORIES.includes(category) || !file || !title) return;
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    status.textContent = "केवल PDF फ़ाइल अपलोड करें।";
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    status.textContent = "PDF का आकार 20 MB से कम होना चाहिए।";
    return;
  }
  uploadButton.disabled = true;
  status.textContent = "PDF अपलोड हो रही है…";
  const cleanName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100);
  const objectName = `${Date.now()}-${cleanName || "document.pdf"}`;
  const destination = ref(storage, `updates/${category}/${currentUser.uid}/${objectName}`);
  try {
    const task = uploadBytesResumable(destination, file, {
      contentType: "application/pdf",
      customMetadata: {
        title, description: descriptionInput.value.trim(),
        category, uploadedBy: currentUser.uid,
        uploadedAt: new Date().toISOString()
      }
    });
    await new Promise((resolve, reject) => {
      task.on("state_changed", snapshot => {
        const percent = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
        status.textContent = `अपलोड हो रही है… ${percent}%`;
      }, reject, resolve);
    });
    form.reset();
    categorySelect.value = category;
    status.textContent = "PDF सफलतापूर्वक अपलोड हो गई।";
    await refreshLibrary();
  } catch (error) {
    console.error("PDF upload failed:", error);
    status.textContent = "अपलोड असफल। Storage bucket, deployed Storage Rules और Owner Admin claim जाँचें।";
  } finally {
    uploadButton.disabled = false;
  }
});
