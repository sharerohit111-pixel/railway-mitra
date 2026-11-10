/* Railway Mitra — Folder Identification Code System (FICS)
 * Stable, path-derived IDs: same folder path => same code on every device.
 * No storage, network, Firebase, or Home Screen card modifications.
 */
(() => {
  "use strict";
  const path = window.location.pathname || "";
  const marker = "/features/";
  const markerAt = path.indexOf(marker);
  if (markerAt < 0) return; // Never show codes on the Home Screen.
  const relative = path.slice(markerAt + marker.length);
  const segments = relative.split("/").filter(Boolean);
  if (!segments.length) return;
  if (/\.html?$/i.test(segments[segments.length - 1])) segments.pop();
  if (!segments.length) return;
  const folderPath = segments.join("/").toLowerCase().replace(/\\/g, "/");
  if (folderPath === "folder-codes") return;

  async function makeCode(value) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("railway-mitra-folder:" + value));
      const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      return "RM-F-" + hex.slice(0, 16).toUpperCase();
    }
    // Deterministic fallback for older browsers; SHA-256 is preferred.
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return "RM-F-" + (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
  }

  async function render() {
    if (document.querySelector("[data-rm-folder-code]")) return;
    const code = await makeCode(folderPath);
    const host = document.createElement("div");
    host.className = "rm-folder-code-host";
    host.setAttribute("data-rm-folder-code", code);
    host.setAttribute("aria-label", "Folder identification code " + code);
    const badge = document.createElement("span");
    badge.className = "rm-folder-code";
    badge.textContent = code;
    host.appendChild(badge);
    // Append in normal document flow: never overlay a title, letter, icon, or control.
    document.body.appendChild(host);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
