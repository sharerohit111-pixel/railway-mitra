import { auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const ENTRY_ID = "rmOwnerAdminMenuEntry";
const PAPER_ENTRY_ID = "rmPreviousPaperInboxEntry";

function addMenuEntry(id, href, label, ariaLabel) {
  const menu = document.querySelector(".mobile-menu");
  if (!menu || document.getElementById(id)) return false;
  const logout = menu.querySelector("#rmLogoutBtn");
  if (!logout) return false;

  const link = document.createElement("a");
  link.id = id;
  link.href = href;
  link.textContent = label;
  link.setAttribute("aria-label", ariaLabel);
  link.style.cssText = "display:block;padding:12px;color:#12345A;text-decoration:none;border-bottom:1px solid #E1E8F0;font-size:14px;font-weight:800";
  menu.insertBefore(link, logout);
  return true;
}

function addOwnerEntries() {
  addMenuEntry(ENTRY_ID, "features/exams/admin-workspace.html", "🔐 Owner Admin Workspace", "Open owner-only admin workspace");
  addMenuEntry(PAPER_ENTRY_ID, "features/paper-contribution/admin.html", "📄 Previous Paper Inbox", "Open owner-only previous paper submissions");
  return !!document.getElementById(ENTRY_ID) && !!document.getElementById(PAPER_ENTRY_ID);
}

function removeOwnerEntries() {
  document.getElementById(ENTRY_ID)?.remove();
  document.getElementById(PAPER_ENTRY_ID)?.remove();
}

function waitForMenu() {
  if (addOwnerEntries()) return;
  const observer = new MutationObserver(() => {
    if (addOwnerEntries()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 10000);
}

onAuthStateChanged(auth, async user => {
  removeOwnerEntries();
  if (!user) return;
  try {
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin !== true) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", waitForMenu, { once: true });
    } else {
      waitForMenu();
    }
  } catch (error) {
    console.error("Owner menu authorization check failed:", error);
    removeOwnerEntries();
  }
});
