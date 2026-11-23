import { app, auth } from "../cloud/firebase-app-check-init.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { initOwnerAdminDashboard } from "./admin-dashboard.js";

const root = document.getElementById("rm-owner-dashboard-root");
const status = document.getElementById("rm-owner-portal-status");

async function boot() {
  const response = await fetch("./admin-dashboard.html", { cache: "no-store" });
  if (!response.ok) throw new Error("Owner dashboard markup लोड नहीं हुआ।");
  root.innerHTML = await response.text();
  const functions = getFunctions(app, "asia-south1");
  initOwnerAdminDashboard(auth, functions);
}

boot().catch(error => {
  status.textContent = error.message || "Owner Portal शुरू नहीं हो पाया।";
});
