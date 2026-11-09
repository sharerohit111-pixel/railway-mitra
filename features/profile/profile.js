document.addEventListener("DOMContentLoaded", function () {
  const api = window.RailwayMitraEmployeeData;
  const form = document.getElementById("employeeProfileForm");
  const message = document.getElementById("profileMessage");
  if (!api || !form) return;

  const baseFields = ["employeeId","name","post","level","basicPay","tpa","division","zone","employeeNumber","department"];
  const optionalFields = ["billUnit","hrmsId","pfNumber","officialMobile","officialEmail"];
  const allFields = baseFields.concat(optionalFields);
  const existing = api.getProfile() || {};
  const employeeId = document.getElementById("employeeId");
  employeeId.value = existing.employeeId || ("RM-" + String(Date.now()).slice(-8));
  document.getElementById("heroEmployeeId").textContent = employeeId.value;

  allFields.forEach(id => {
    const el = document.getElementById(id);
    if (el && existing[id] !== undefined && existing[id] !== null) el.value = existing[id];
  });

  const panel = document.getElementById("optionalPanel");
  const toggle = document.getElementById("toggleOptional");
  const customFields = document.getElementById("customFields");
  let customRows = Array.isArray(existing.customFields) ? existing.customFields.slice(0, 10) : [];

  function renderCustomFields() {
    customFields.replaceChildren();
    customRows.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "custom-field-row";
      const label = document.createElement("input");
      label.type = "text"; label.maxLength = 50;
      label.placeholder = "अपना नाम लिखें"; label.setAttribute("aria-label", "Custom field name " + (index + 1));
      label.value = item.label || "";
      label.addEventListener("input", () => customRows[index].label = label.value);
      const value = document.createElement("input");
      value.type = "text"; value.maxLength = 150;
      value.placeholder = "अपनी जानकारी लिखें"; value.setAttribute("aria-label", "Custom field value " + (index + 1));
      value.value = item.value || "";
      value.addEventListener("input", () => customRows[index].value = value.value);
      row.append(label, value);
      customFields.appendChild(row);
    });
    document.getElementById("addCustomField").disabled = customRows.length >= 10;
  }

  if (optionalFields.some(id => existing[id])) panel.hidden = false;
  if (customRows.length) panel.hidden = false;
  toggle.setAttribute("aria-expanded", String(!panel.hidden));
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggle.innerHTML = (panel.hidden ? "＋" : "−") + " Add More Employee Details <span class=\"optional-tag\">OPTIONAL</span>";
  });
  document.getElementById("addCustomField").addEventListener("click", () => {
    if (customRows.length >= 10) return;
    customRows.push({label:"", value:""});
    renderCustomFields();
  });
  renderCustomFields();

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const data = {};
    allFields.forEach(id => data[id] = document.getElementById(id).value);
    data.customFields = customRows
      .map(item => ({label:String(item.label || "").trim(), value:String(item.value || "").trim()}))
      .filter(item => item.label || item.value);
    try {
      const saved = api.saveProfile(data);
      employeeId.value = saved.employeeId;
      document.getElementById("heroEmployeeId").textContent = saved.employeeId;
      message.textContent = "प्रोफाइल इस डिवाइस पर सफलतापूर्वक सेव हो गई।";
      message.className = "success";
    } catch (error) {
      console.error(error);
      message.textContent = "प्रोफाइल सेव नहीं हो सकी। कृपया डिवाइस की स्टोरेज अनुमति जाँचें।";
      message.className = "error";
    }
  });

  document.getElementById("clearProfile").addEventListener("click", function () {
    if (!confirm("क्या आप इस डिवाइस से कर्मचारी प्रोफाइल हटाना चाहते हैं?")) return;
    localStorage.removeItem(api.storageKey);
    form.reset();
    customRows = [];
    renderCustomFields();
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    employeeId.value = "RM-" + String(Date.now()).slice(-8);
    document.getElementById("heroEmployeeId").textContent = employeeId.value;
    message.textContent = "इस डिवाइस से प्रोफाइल हटा दी गई है।";
    message.className = "success";
  });
});