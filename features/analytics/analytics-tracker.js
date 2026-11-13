/**
 * Railway Mitra – privacy-first Firebase Analytics bootstrap.
 * Uses the existing Firebase app; does not initialize a second app.
 * No names, email addresses, employee IDs, calculator inputs or note contents are sent.
 */
import { app } from "../../assets/js/firebase.js";

const SDK = "https://www.gstatic.com/firebasejs/13.2.0/firebase-analytics.js";
const CONSENT_KEY = "rm_analytics_consent_v1";
let analytics = null;
let analyticsReady = false;

function consentChoice() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

function saveConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch {}
}

async function loadAnalytics() {
  if (analyticsReady) return analytics;
  analyticsReady = true;
  try {
    const supported = await import(SDK);
    if (!(await supported.isSupported())) return null;
    analytics = supported.getAnalytics(app);
    supported.setAnalyticsCollectionEnabled(analytics, true);
    supported.logEvent(analytics, "page_view", {
      page_title: document.title,
      page_location: location.pathname,
      page_path: location.pathname
    });
    return analytics;
  } catch (error) {
    console.warn("[Railway Mitra Analytics] Unavailable:", error?.message || error);
    return null;
  }
}

async function track(eventName, parameters = {}) {
  if (consentChoice() !== "granted") return;
  const instance = await loadAnalytics();
  if (!instance) return;
  try {
    const sdk = await import(SDK);
    sdk.logEvent(instance, eventName, parameters);
  } catch (error) {
    console.warn("[Railway Mitra Analytics] Event skipped:", error?.message || error);
  }
}

function showConsentPrompt() {
  if (consentChoice()) {
    if (consentChoice() === "granted") loadAnalytics();
    return;
  }
  if (!document.body || document.getElementById("rmAnalyticsConsent")) return;

  const panel = document.createElement("aside");
  panel.id = "rmAnalyticsConsent";
  panel.className = "rm-analytics-consent";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Analytics privacy choice");
  panel.innerHTML = `
    <div class="rm-analytics-consent__copy">
      <strong>Help improve Railway Mitra</strong>
      <p>Allow usage measurement (such as page visits and feature opens)? We never send employee details, account identifiers or calculator inputs to Analytics. You can choose either option.</p>
      <a href="features/privacy/index.html" target="_blank" rel="noopener">Privacy Policy</a>
    </div>
    <div class="rm-analytics-consent__actions">
      <button type="button" data-choice="denied" class="rm-analytics-consent__secondary">No thanks</button>
      <button type="button" data-choice="granted" class="rm-analytics-consent__primary">Allow analytics</button>
    </div>`;
  document.body.appendChild(panel);

  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-choice]");
    if (!button) return;
    const choice = button.dataset.choice;
    saveConsent(choice);
    panel.remove();
    if (choice === "granted") await loadAnalytics();
  });
}

function startTracking() {
  showConsentPrompt();

  document.addEventListener("click", (event) => {
    const card = event.target.closest("a.feature-card");
    if (!card) return;
    const heading = card.querySelector("h3");
    const featureName = (heading?.textContent || "unknown").trim().slice(0, 80);
    track("feature_open", { feature_name: featureName });
  }, { passive: true });

  window.addEventListener("appinstalled", () => {
    track("pwa_install_accepted", { install_surface: "web_app_install_prompt" });
  });

  // Explicitly expose a small event helper for future isolated feature modules.
  const allowedEvents = new Set(["feature_open"]);
  window.RailwayMitraAnalytics = Object.freeze({
    trackFeature: (name) => track("feature_open", {
      feature_name: String(name).replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60)
    }),
    // Reject arbitrary event names and parameter objects from feature code.
    trackEvent: (name) => {
      if (allowedEvents.has(name)) track(name);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startTracking, { once: true });
} else {
  startTracking();
}
