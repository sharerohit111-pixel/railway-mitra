(function () {
  "use strict";
  const path = window.location.pathname;
  const marker = path.includes("/features/rules/en/") ? "/features/rules/en/" :
                 path.includes("/features/rules/hi/") ? "/features/rules/hi/" : null;
  if (!marker) return;
  const targetMarker = marker.includes("/en/") ? "/features/rules/hi/" : "/features/rules/en/";
  const targetPath = path.replace(marker, targetMarker);
  const button = document.createElement("button");
  button.id = "rmRulesLanguageToggle";
  button.type = "button";
  button.textContent = marker.includes("/en/") ? "हिंदी" : "English";
  button.setAttribute("aria-label", marker.includes("/en/") ? "हिंदी पेज खोलें" : "Open English page");
  button.style.cssText = "position:fixed;right:14px;bottom:78px;z-index:99999;padding:10px 16px;border:1px solid #39dff5;border-radius:999px;background:linear-gradient(135deg,#087eae,#7838c8);color:#fff;font-weight:800;font-size:15px;box-shadow:0 4px 16px #0008;cursor:pointer";
  button.addEventListener("click", function () {
    try { localStorage.setItem("railwayMitra.rulesLanguage", marker.includes("/en/") ? "hi" : "en"); } catch (_) {}
    window.location.assign(targetPath + window.location.search + window.location.hash);
  });
  document.addEventListener("DOMContentLoaded", function () {
    const old = document.getElementById("rmLanguageToggle");
    if (old) old.remove();
    const passPtoOld = document.getElementById("rmPassPtoLanguageToggle");
    if (passPtoOld) passPtoOld.remove();
    document.body.appendChild(button);
  });
})();