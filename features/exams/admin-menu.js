import { auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const ENTRY_ID = "rmOwnerAdminMenuEntry";

function addOwnerEntry() {
  const menu = document.querySelector(".mobile-menu");
  if (!menu || document.getElementById(ENTRY_ID)) return false;

  const logout = menu.querySelector("#rmLogoutBtn");
  if (!logout) return false;

  const link = document.createElement("a");
  link.id = ENTRY_ID;
  link.href = "features/exams/admin-workspace.html";
  link.textContent = "🔐 Owner Admin Workspace";
  link.setAttribute("aria-label", "Open owner-only admin workspace");
  link.style.cssText = "display:block;padding:12px;color:#12345A;text-decoration:none;border-bottom:1px solid #E1E8F0;font-size:14px;font-weight:800";

  menu.insertBefore(link, logout);
  return true;
}

function removeOwnerEntry() {
  document.getElementById(ENTRY_ID)?.remove();
}

function waitForMenu() {
  if (addOwnerEntry()) return;
  const observer = new MutationObserver(() => {
    if (addOwnerEntry()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 10000);
}

onAuthStateChanged(auth, async (user) => {
  removeOwnerEntry();
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
    removeOwnerEntry();
  }
});
