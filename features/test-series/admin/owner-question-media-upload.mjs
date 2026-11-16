import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_BYTES = 5 * 1024 * 1024;

function readQuestionList(textarea) {
  let questions;
  try { questions = JSON.parse(textarea.value); }
  catch (_) { throw new Error("पहले Questions JSON सही करें।"); }
  if (!Array.isArray(questions)) throw new Error("Questions JSON एक Array होना चाहिए।");
  return questions;
}

async function sha256(file) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure SHA-256 के लिए HTTPS आवश्यक है।");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function initOwnerQuestionMediaUpload(functions) {
  const el = id => document.getElementById(id);
  const questionId = el("rm-owner-media-question-id");
  const mediaId = el("rm-owner-media-id");
  const altText = el("rm-owner-media-alt");
  const fileInput = el("rm-owner-media-file");
  const testId = el("rm-owner-media-test-id");
  const addButton = el("rm-owner-media-add-descriptor");
  const uploadButton = el("rm-owner-media-upload");
  const status = el("rm-owner-media-status");
  const questionEditor = el("rm-test-questions");
  if (![questionId, mediaId, altText, fileInput, testId, addButton, uploadButton, status, questionEditor].every(Boolean)) return;

  const report = message => { status.textContent = message; };
  addButton.addEventListener("click", () => {
    try {
      const qid = questionId.value.trim();
      const mid = mediaId.value.trim();
      const description = altText.value.trim();
      const file = fileInput.files?.[0];
      if (!ID_PATTERN.test(qid) || !ID_PATTERN.test(mid)) throw new Error("Question ID और Media ID सही भरें।");
      if (!description || description.length > 200) throw new Error("चित्र का Alt Text लिखें (अधिकतम 200 अक्षर)।");
      if (!file || !ALLOWED_TYPES.has(file.type)) throw new Error("JPEG, PNG या WebP image चुनें।");
      if (file.size < 1 || file.size > MAX_BYTES) throw new Error("Image का आकार 5 MiB से अधिक नहीं होना चाहिए।");
      const questions = readQuestionList(questionEditor);
      const question = questions.find(item => item && item.id === qid);
      if (!question) throw new Error("इस ID का प्रश्न JSON में नहीं मिला।");
      const media = Array.isArray(question.media) ? question.media : [];
      if (media.length >= 3) throw new Error("एक प्रश्न में अधिकतम 3 चित्र जोड़ सकते हैं।");
      if (media.some(item => item && item.id === mid)) throw new Error("यह Media ID पहले से मौजूद है।");
      media.push({ id: mid, altText: description, mimeType: file.type });
      question.media = media;
      questionEditor.value = JSON.stringify(questions, null, 2);
      report("Image descriptor JSON में जुड़ गया। अब Draft Test सेव करें, फिर Test ID भरकर Upload करें।");
    } catch (error) {
      report(error.message || "Image descriptor नहीं जोड़ा जा सका।");
    }
  });

  uploadButton.addEventListener("click", async () => {
    uploadButton.disabled = true;
    try {
      const tid = testId.value.trim();
      const qid = questionId.value.trim();
      const mid = mediaId.value.trim();
      const file = fileInput.files?.[0];
      if (!ID_PATTERN.test(tid) || !ID_PATTERN.test(qid) || !ID_PATTERN.test(mid)) {
        throw new Error("Saved Test ID, Question ID और Media ID सही भरें।");
      }
      if (!file || !ALLOWED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_BYTES) {
        throw new Error("5 MiB तक की JPEG, PNG या WebP image चुनें।");
      }
      report("Image checksum तैयार हो रहा है…");
      const checksum = await sha256(file);
      const createUpload = httpsCallable(functions, "rmOwnerCreateQuestionMediaUpload");
      const finalizeUpload = httpsCallable(functions, "rmOwnerFinalizeQuestionMediaUpload");
      const request = {
        testId: tid, questionId: qid, mediaId: mid,
        mimeType: file.type, sizeBytes: file.size, sha256: checksum
      };
      report("Owner permission और Draft question जाँचे जा रहे हैं…");
      const session = (await createUpload(request)).data;
      if (!session || typeof session.uploadUrl !== "string" || !session.uploadUrl.startsWith("https://") ||
          !session.requiredHeaders || typeof session.requiredHeaders !== "object") {
        throw new Error("Secure upload session मान्य नहीं है।");
      }
      report("Private Cloud Storage में image upload हो रही है…");
      const response = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: session.requiredHeaders,
        body: file
      });
      if (!response.ok) throw new Error("Cloud Storage upload असफल (" + response.status + ")। CORS और Storage configuration जाँचें।");
      report("Storage checksum और image metadata verify हो रहे हैं…");
      await finalizeUpload(request);
      report("Image सफलतापूर्वक upload और verify हो गई। अब Publish से पहले Preview जाँचें।");
    } catch (error) {
      report(error.message || "Image upload असफल।");
    } finally {
      uploadButton.disabled = false;
    }
  });
}
