import { auth } from "../../assets/js/firebase.js";

const APPWRITE_ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6b070890000e2fca34fd";
const APPWRITE_FUNCTION_ID = "train-movement-api";
const ROUTE = [["Lalgarh Junction",0],["Nal Halt",10],["Gajner",30],["Kolayat",46],["Diyatara Road",62],["Nokhra",84],["Sird",105],["Bap",122],["Malar",145],["Phalodi Junction",158]];
const $ = id => document.getElementById(id);
const stationSelect = $("station");

ROUTE.forEach(([name, km], index) => {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = name + " · " + km + " km";
  stationSelect.appendChild(option);
});
ROUTE.forEach(([name], index) => {
  const node = document.createElement("span");
  node.className = "rm-station-node";
  node.style.left = (index / (ROUTE.length - 1) * 100) + "%";
  node.dataset.label = name;
  node.title = name;
  $("stationNodes").appendChild(node);
});

function updateClock() {
  $("capturedTime").textContent = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}
updateClock();
setInterval(updateClock, 1000);
$("movement").addEventListener("change", () => {
  $("departureKmWrap").hidden = $("movement").value !== "departure";
});

async function invoke(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Please sign in to Railway Mitra first."), { code: "unauthenticated" });
  const token = await user.getIdToken();
  const response = await fetch(`${APPWRITE_ENDPOINT}/functions/${APPWRITE_FUNCTION_ID}/executions`, {
    method: "POST",
    headers: {
      "X-Appwrite-Project": APPWRITE_PROJECT_ID,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      body: JSON.stringify({ action, ...payload }),
      async: false,
      method: "POST",
      headers: { "X-Firebase-Authorization": `Bearer ${token}` }
    })
  });
  const execution = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(execution.message || "Appwrite request failed.");
  const status = Number(execution.responseStatusCode || 0);
  let result = {};
  try { result = execution.responseBody ? JSON.parse(execution.responseBody) : {}; } catch {}
  if (status < 200 || status >= 300) throw new Error(result.error || `Train report service returned ${status || "an unknown error"}.`);
  return result;
}

function kmForReport(report) {
  if (report.movement === "departure" && Number.isFinite(Number(report.departureKm))) return Number(report.departureKm);
  return Number(report.stationKm);
}
function renderPosition(report) {
  if (!report) {
    $("trainStatus").textContent = "Waiting for report";
    $("positionName").textContent = "No movement report yet";
    $("positionMeta").textContent = "Submit the first community report.";
    $("routeProgress").style.width = "0%";
    $("trainMarker").style.left = "0%";
    return;
  }
  const km = Math.max(0, Math.min(158, kmForReport(report)));
  const percent = km / 158 * 100;
  $("routeProgress").style.width = percent + "%";
  $("trainMarker").style.left = percent + "%";
  $("trainStatus").textContent = "Last reported · " + report.direction;
  $("positionName").textContent = report.stationName + " · " + km + " km";
  $("positionMeta").textContent = (report.movementLabel || report.movement) + " · " + new Date(report.createdAt).toLocaleString();
}
function renderReports(reports) {
  const list = $("reportList");
  list.replaceChildren();
  if (!reports.length) {
    const item = document.createElement("li");
    item.textContent = "Abhi koi report nahi hai.";
    list.appendChild(item);
    return;
  }
  reports.forEach(report => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = report.stationName + " · " + report.direction + " · " + (report.movementLabel || report.movement);
    const meta = document.createElement("small");
    meta.textContent = new Date(report.createdAt).toLocaleString() + " · " + report.stationKm + " km" +
      (report.movement === "departure" && report.departureKm != null ? " · Departure KM " + report.departureKm : "");
    item.append(title, meta);
    list.appendChild(item);
  });
}
async function refresh() {
  try {
    const result = await invoke("list", { limit: 30 });
    const reports = Array.isArray(result.reports) ? result.reports : [];
    renderReports(reports);
    renderPosition(reports[0] || null);
  } catch (error) {
    $("reportList").textContent = error.code === "unauthenticated"
      ? "Sign in to Railway Mitra to view employee reports."
      : (error.message || "Reports load nahi ho paaye. Internet aur login check karein.");
  }
}
$("refreshReports").addEventListener("click", refresh);

$("movementForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!auth.currentUser) {
    $("formMessage").textContent = "Please sign in to Railway Mitra first.";
    return;
  }
  const index = Number(stationSelect.value);
  const movement = $("movement").value;
  const departureKm = movement === "departure" ? Number($("departureKm").value) : null;
  if (movement === "departure" && (!Number.isFinite(departureKm) || departureKm < 0 || departureKm > 158)) {
    $("formMessage").textContent = "Valid departure KM (0–158) enter karein.";
    return;
  }
  const button = $("submitReport");
  button.disabled = true;
  $("formMessage").textContent = "Submitting securely…";
  try {
    const result = await invoke("submit", {
      stationId: String(index),
      direction: $("direction").value,
      movement,
      trainType: $("trainType").value,
      departureKm
    });
    if (!result.success) throw new Error("Report was not accepted.");
    $("formMessage").textContent = "Report submit ho gayi. Thank you!";
    $("movementForm").reset();
    $("departureKmWrap").hidden = true;
    updateClock();
    await refresh();
  } catch (error) {
    $("formMessage").textContent = error.message || "Report submit nahi hui. Dobara try karein.";
  } finally {
    button.disabled = false;
  }
});

if (auth.currentUser) refresh();
auth.onAuthStateChanged(user => {
  if (user) refresh();
  else {
    $("reportList").textContent = "Sign in required.";
    renderPosition(null);
  }
});
