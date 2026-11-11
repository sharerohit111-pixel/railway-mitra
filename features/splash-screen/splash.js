/* Railway Mitra — isolated splash lifecycle controller */
(() => {
  "use strict";

  const splash = document.getElementById("rmSplash");
  if (!splash) return;

  const removeSplash = () => {
    if (!splash.isConnected) return;
    splash.classList.add("is-leaving");
    window.setTimeout(() => splash.remove(), 600);
  };

  // Keep the opening animation brief; the app itself continues loading underneath.
  window.addEventListener("load", () => {
    window.setTimeout(removeSplash, 2450);
  }, { once: true });

  // Safety fallback for pages whose load event is delayed by a slow external resource.
  window.setTimeout(removeSplash, 6500);
})();
