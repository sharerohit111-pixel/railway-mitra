/* Railway Mitra - Shared Employee Profile Data
 * Local profile store. Optional employee details are retained as user-entered fields.
 */
(function () {
  "use strict";
  const STORAGE_KEY = "railwayMitra.employeeProfile.v1";
  function makeId() { return "RM-" + String(Date.now()).slice(-8); }
  function getProfile() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
    catch (error) { console.error("Employee profile read error:", error); return null; }
  }
  function saveProfile(profile) {
    const existing = getProfile() || {};
    const clean = {
      employeeId: String(profile.employeeId || existing.employeeId || makeId()),
      name: String(profile.name || "").trim(),
      post: String(profile.post || "").trim(),
      level: String(profile.level || "").trim(),
      basicPay: profile.basicPay === "" || profile.basicPay == null ? "" : Number(profile.basicPay),
      tpa: profile.tpa === "" || profile.tpa == null ? "" : Number(profile.tpa),
      division: String(profile.division || "").trim(),
      zone: String(profile.zone || "").trim(),
      employeeNumber: String(profile.employeeNumber || "").trim(),
      department: String(profile.department || "").trim(),
      billUnit: String(profile.billUnit || "").trim(),
      hrmsId: String(profile.hrmsId || "").trim(),
      pfNumber: String(profile.pfNumber || "").trim(),
      officialMobile: String(profile.officialMobile || "").trim(),
      officialEmail: String(profile.officialEmail || "").trim(),
      customFields: Array.isArray(profile.customFields) ? profile.customFields.slice(0,10).map(item => ({label:String(item.label || "").trim(),value:String(item.value || "").trim()})).filter(item => item.label || item.value) : (existing.customFields || []),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent("railwaymitra:profile-updated", { detail: clean }));
    return clean;
  }
  function applyToForm(mapping) {
    const profile = getProfile();
    if (!profile) return false;
    Object.entries(mapping || {}).forEach(([fieldId, profileKey]) => {
      const field = document.getElementById(fieldId), value = profile[profileKey];
      if (field && value !== undefined && value !== null && value !== "") {
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    return true;
  }
  window.RailwayMitraEmployeeData = Object.freeze({getProfile,saveProfile,applyToForm,storageKey:STORAGE_KEY});
})();