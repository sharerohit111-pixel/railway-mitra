import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

export function initOwnerTestAccessPanel(functions) {
  const byId = id => document.getElementById(id);
  const panel = byId("rm-admin-access-panel");
  if (!panel || panel.dataset.initialized === "true") return;
  panel.dataset.initialized = "true";

  const status = byId("rm-admin-access-status");
  const accessList = byId("rm-admin-access-list");
  const auditList = byId("rm-admin-access-audit-list");
  const grantCall = httpsCallable(functions, "rmOwnerSetStudentTestAccess");
  const listCall = httpsCallable(functions, "rmOwnerListStudentTestAccess");
  const auditCall = httpsCallable(functions, "rmOwnerListStudentAccessAudit");
  let accessCursor = null;
  let auditCursor = null;
  let accessGeneration = 0;
  let auditGeneration = 0;
  let sessionGeneration = 0;

  const say = message => { status.textContent = message; };
  const make = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  const dateLabel = value => value ? new Date(value).toLocaleString() : "कोई समाप्ति तिथि नहीं";

  function renderAccess(items) {
    const renderedSession = sessionGeneration;
    items.forEach(item => {
      const card = make("article", undefined, "rm-admin-access-item");
      const title = make("strong", item.testId + " · " + item.status.toUpperCase());
      const detail = make("p", "Student UID: " + item.studentUid);
      const reason = make("p", "कारण: " + (item.reason || "—"));
      const expiry = make("small", "Expiry: " + dateLabel(item.expiresAt));
      card.append(title, detail, reason, expiry);
      if (item.status === "active") {
        const revoke = make("button", "Revoke access");
        revoke.type = "button";
        revoke.addEventListener("click", async () => {
          revoke.disabled = true;
          try {
            await grantCall({
              studentUid: item.studentUid,
              testId: item.testId,
              action: "revoke",
              reason: "Owner revoked access from Access Management panel",
              requestId: crypto.randomUUID()
            });
            if (renderedSession !== sessionGeneration) return;
            say("Access revoke हो गया। नया attempt अब शुरू नहीं किया जा सकेगा।");
            await loadAccess(true);
            await loadAudit(true);
          } catch (error) {
            if (renderedSession !== sessionGeneration) return;
            say(error.message || "Access revoke नहीं हो पाया।");
            revoke.disabled = false;
          }
        });
        card.append(revoke);
      }
      accessList.append(card);
    });
  }

  async function loadAccess(reset = false) {
    const currentSession = sessionGeneration;
    const current = ++accessGeneration;
    if (reset) {
      accessCursor = null;
      accessList.replaceChildren();
    }
    const studentUid = byId("rm-admin-access-filter-uid").value.trim();
    const testId = byId("rm-admin-access-filter-test").value.trim();
    const statusFilter = byId("rm-admin-access-filter-status").value;
    const filters = [studentUid, testId, statusFilter].filter(Boolean);
    if (filters.length > 1) {
      say("एक बार में केवल एक फ़िल्टर चुनें।");
      return;
    }
    const payload = { pageSize: 25 };
    if (studentUid) payload.studentUid = studentUid;
    else if (testId) payload.testId = testId;
    else if (statusFilter) payload.status = statusFilter;
    if (!reset && accessCursor) payload.cursor = accessCursor;
    try {
      say("Access records लोड हो रहे हैं…");
      const result = (await listCall(payload)).data || {};
      if (current !== accessGeneration || currentSession !== sessionGeneration) return;
      renderAccess(result.items || []);
      accessCursor = result.nextCursor || null;
      byId("rm-admin-access-more").hidden = !result.hasMore;
      say((result.items || []).length + " access record(s) लोड हुए।");
    } catch (error) {
      say(error.message || "Access records लोड नहीं हुए।");
    }
  }

  async function loadAudit(reset = false) {
    const currentSession = sessionGeneration;
    const current = ++auditGeneration;
    if (reset) {
      auditCursor = null;
      auditList.replaceChildren();
    }
    const studentUid = byId("rm-admin-access-filter-uid").value.trim();
    const testId = byId("rm-admin-access-filter-test").value.trim();
    const action = byId("rm-admin-audit-filter-action").value;
    const filters = [studentUid, testId, action].filter(Boolean);
    if (filters.length > 1) {
      say("Audit में एक बार में केवल एक फ़िल्टर चुनें।");
      return;
    }
    const payload = { pageSize: 25 };
    if (studentUid) payload.studentUid = studentUid;
    else if (testId) payload.testId = testId;
    else if (action) payload.action = action;
    if (!reset && auditCursor) payload.cursor = auditCursor;
    try {
      const result = (await auditCall(payload)).data || {};
      if (current !== auditGeneration || currentSession !== sessionGeneration) return;
      (result.items || []).forEach(item => {
        const card = make("article", undefined, "rm-admin-access-item");
        card.append(
          make("strong", item.action.toUpperCase() + " · " + item.testId),
          make("p", "Student UID: " + item.studentUid),
          make("p", "कारण: " + (item.reason || "—")),
          make("small", "समय: " + dateLabel(item.createdAt))
        );
        auditList.append(card);
      });
      auditCursor = result.nextCursor || null;
      byId("rm-admin-access-audit-more").hidden = !result.hasMore;
    } catch (error) {
      if (current !== auditGeneration || currentSession !== sessionGeneration) return;
      say(error.message || "Audit history लोड नहीं हुई।");
    }
  }

  byId("rm-admin-access-grant-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = byId("rm-admin-access-grant-submit");
    const currentSession = sessionGeneration;
    button.disabled = true;
    const studentUid = byId("rm-admin-access-student-uid").value.trim();
    const testId = byId("rm-admin-access-test-id").value.trim();
    const reason = byId("rm-admin-access-reason").value.trim();
    const expiryValue = byId("rm-admin-access-expiry").value;
    const payload = {
      studentUid, testId, action: "grant", reason,
      requestId: crypto.randomUUID()
    };
    if (expiryValue) {
      const expiry = new Date(expiryValue);
      payload.expiresAt = expiry.toISOString();
    }
    try {
      const result = (await grantCall(payload)).data || {};
      if (currentSession !== sessionGeneration) return;
      say(result.replayed ? "यह अनुरोध पहले ही सफलतापूर्वक लागू हो चुका था।" : "Complimentary test access grant हो गया।");
      byId("rm-admin-access-reason").value = "";
      await loadAccess(true);
      await loadAudit(true);
    } catch (error) {
      if (currentSession !== sessionGeneration) return;
      say(error.message || "Access grant नहीं हो पाया।");
    } finally {
      if (currentSession === sessionGeneration) button.disabled = false;
    }
  });

  function reset() {
    sessionGeneration += 1;
    accessGeneration += 1;
    auditGeneration += 1;
    accessCursor = null;
    auditCursor = null;
    accessList.replaceChildren();
    auditList.replaceChildren();
    status.textContent = "";
    byId("rm-admin-access-more").hidden = true;
    byId("rm-admin-access-audit-more").hidden = true;
    byId("rm-admin-access-grant-form").reset();
    byId("rm-admin-access-filter-uid").value = "";
    byId("rm-admin-access-filter-test").value = "";
    byId("rm-admin-access-filter-status").value = "";
    byId("rm-admin-audit-filter-action").value = "";
  }

  byId("rm-admin-access-refresh").addEventListener("click", () => {
    loadAccess(true);
    loadAudit(true);
  });
  byId("rm-admin-access-more").addEventListener("click", () => loadAccess(false));
  byId("rm-admin-access-audit-more").addEventListener("click", () => loadAudit(false));
  byId("rm-admin-access-clear-filters").addEventListener("click", () => {
    byId("rm-admin-access-filter-uid").value = "";
    byId("rm-admin-access-filter-test").value = "";
    byId("rm-admin-access-filter-status").value = "";
    byId("rm-admin-audit-filter-action").value = "";
    loadAccess(true);
    loadAudit(true);
  });
  return { reset };
}
