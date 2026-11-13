export function validateOwnerTestDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new Error("Test विवरण का प्रारूप सही नहीं है।");
  }

  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  if (!title || title.length > 160) {
    throw new Error("टेस्ट का नाम आवश्यक है और अधिकतम 160 अक्षरों का होना चाहिए।");
  }

  const category = typeof draft.category === "string" && draft.category.trim() ? draft.category.trim() : "General";
  const folder = typeof draft.folder === "string" && draft.folder.trim() ? draft.folder.trim() : "General";
  if (category.length > 60 || !/^[\p{L}\p{M}\p{N} _-]+$/u.test(category)) throw new Error("Category में केवल अक्षर, अंक, space, _ और - स्वीकार हैं (अधिकतम 60 अक्षर)।");
  const folderParts = folder.split("/").map(part => part.trim());
  if (folder.length > 120 || folderParts.length > 4 || folderParts.some(part => !part || part.length > 40 || !/^[\p{L}\p{M}\p{N} _-]+$/u.test(part))) throw new Error("Folder में अधिकतम 4 सुरक्षित स्तर दें; हर स्तर 1–40 अक्षरों का हो।");
  const mode = draft.mode === "scheduled" ? "scheduled" : draft.mode === "mock" ? "mock" : null;
  if (!mode) throw new Error("टेस्ट का प्रकार Mock या Scheduled होना चाहिए।");

  const durationMinutes = Number(draft.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    throw new Error("टेस्ट की अवधि 1 से 240 मिनट के बीच होनी चाहिए।");
  }

  const price = Number(draft.price ?? 0);
  const marksPerQuestion = Number(draft.marksPerQuestion ?? 1);
  const negativeMarks = Number(draft.negativeMarks ?? 0);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    throw new Error("टेस्ट की कीमत 0 से 100000 रुपये के बीच होनी चाहिए।");
  }
  if (!Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0 || marksPerQuestion > 100) {
    throw new Error("प्रत्येक प्रश्न के अंक 0 से अधिक और अधिकतम 100 होने चाहिए।");
  }
  if (!Number.isFinite(negativeMarks) || negativeMarks < 0 || negativeMarks > 100) {
    throw new Error("नकारात्मक अंक 0 से 100 के बीच होने चाहिए।");
  }

  if (!Array.isArray(draft.questions) || draft.questions.length < 1 || draft.questions.length > 500) {
    throw new Error("Questions JSON में 1 से 500 प्रश्नों की Array होनी चाहिए।");
  }

  const questionIds = new Set();
  const questions = draft.questions.map((question, index) => {
    const number = index + 1;
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      throw new Error("प्रश्न " + number + " का प्रारूप सही नहीं है।");
    }

    const id = typeof question.id === "string" ? question.id.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || questionIds.has(id)) {
      throw new Error("प्रश्न " + number + " की ID खाली, अमान्य या दोहराई गई है।");
    }
    questionIds.add(id);

    if (typeof question.text !== "string" || !question.text.trim() || question.text.length > 5000) {
      throw new Error("प्रश्न " + number + " का प्रश्न-पाठ आवश्यक है (अधिकतम 5000 अक्षर)।");
    }

    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6 ||
        question.options.some(option => typeof option !== "string" || !option.trim() || option.length > 1000)) {
      throw new Error("प्रश्न " + number + " में 2 से 6 वैध विकल्प होने चाहिए (प्रत्येक अधिकतम 1000 अक्षर)।");
    }

    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 ||
        question.correctIndex >= question.options.length) {
      throw new Error("प्रश्न " + number + " का सही उत्तर (correctIndex) विकल्पों के अनुरूप नहीं है।");
    }

    return { id, text: question.text.trim(), options: [...question.options], correctIndex: question.correctIndex };
  });

  const payload = {
    title,
    category,
    folder: folderParts.join(" / "),
    mode,
    durationMinutes,
    price,
    marksPerQuestion,
    negativeMarks,
    status: draft.status === "published" ? "published" : "draft",
    questions
  };

  if (mode === "scheduled") {
    const startValue = draft.scheduleStartAt;
    const endValue = draft.scheduleEndAt;
    const startTime = typeof startValue === "string" && startValue ? Date.parse(startValue) : NaN;
    const endTime = typeof endValue === "string" && endValue ? Date.parse(endValue) : NaN;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      throw new Error("कृपया Scheduled Test की प्रारंभ और समाप्ति तिथि/समय सही भरें।");
    }
    if (endTime <= startTime) {
      throw new Error("टेस्ट समाप्ति का समय, प्रारंभ समय के बाद होना चाहिए।");
    }
    payload.scheduleStartAt = new Date(startTime).toISOString();
    payload.scheduleEndAt = new Date(endTime).toISOString();
  }

  return payload;
}
