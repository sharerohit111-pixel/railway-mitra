"use strict";

// Re-rendering the option list replaces the focused DOM node. Restore focus to
// the same option so keyboard users can continue selecting answers without
// having to tab through the question again.
export function restoreCbtOptionFocus(optionsRoot, optionIndex) {
  if (!optionsRoot || typeof optionsRoot.querySelectorAll !== "function" ||
      !Number.isInteger(optionIndex) || optionIndex < 0) {
    return false;
  }

  const target = optionsRoot.querySelectorAll("button")[optionIndex];
  if (!target || target.disabled || typeof target.focus !== "function") {
    return false;
  }

  try {
    target.focus();
    return true;
  } catch {
    return false;
  }
}
