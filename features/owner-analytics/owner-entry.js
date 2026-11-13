import { auth } from "../../assets/js/firebase.js";
import { getIdTokenResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

onAuthStateChanged(auth, async user => {
  if (!user) return;
  try {
    const token = await getIdTokenResult(user);
    if (token.claims.admin !== true) return;
    const header = document.querySelector(".app-header");
    if (!header || document.getElementById("rmOwnerAnalyticsLink")) return;
    const link = document.createElement("a");
    link.id = "rmOwnerAnalyticsLink";
    link.href = "features/owner-analytics/";
    link.textContent = "📊 Owner Analytics";
    link.setAttribute("aria-label", "Open owner analytics dashboard");
    link.style.cssText = "display:inline-flex;align-items:center;gap:8px;margin:8px 12px;padding:9px 13px;border:1px solid #36708e;border-radius:10px;background:#10243b;color:#75e5f5;text-decoration:none;font-weight:700;font-size:13px";
    header.appendChild(link);
  } catch (error) {
    console.warn("[Owner Analytics] Owner link unavailable:", error?.message || error);
  }
});
