const CONTROL_SELECTORS = [
  "#rm-cbt-options button",
  "#rm-cbt-palette button",
  "#rm-cbt-section-progress button",
  "#rm-cbt-prev",
  "#rm-cbt-next",
  "#rm-cbt-retry",
  "#rm-cbt-submit"
];

/**
 * Freeze all CBT answer and navigation controls while the server finalizes an
 * attempt. The server remains authoritative; this only closes the client UI
 * race where a late click could be made during submission.
 */
export function lockCbtExamControls(root) {
  if (!root || typeof root.querySelectorAll !== "function") return 0;
  let locked = 0;
  for (const selector of CONTROL_SELECTORS) {
    for (const control of root.querySelectorAll(selector)) {
      if (!control || typeof control !== "object" || !("disabled" in control)) continue;
      control.disabled = true;
      locked++;
    }
  }
  return locked;
}
