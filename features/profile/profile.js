document.addEventListener("DOMContentLoaded", function () {
  const api = window.RailwayMitraEmployeeData;
  const form = document.getElementById("employeeProfileForm");
  const message = document.getElementById("profileMessage");
  if (!api || !form) return;

  const fields = ["employeeId","name","post","level","basicPay","tpa","division","zone","employeeNumber","hrmsId","department"];
  const existing = api.getProfile() || {};
  document.getElementById("employeeId").value = existing.employeeId || ("RM-" + String(Date.now()).slice(-8));
  document.getElementById("heroEmployeeId").textContent = document.getElementById("employeeId").value;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el && existing[id] !== undefined && existing[id] !== null) el.value = existing[id];
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const data = {};
    fields.forEach(id => data[id] = document.getElementById(id).value);
    try {
      const saved = api.saveProfile(data);
      document.getElementById("employeeId").value = saved.employeeId;
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
    document.getElementById("employeeId").value = "RM-" + String(Date.now()).slice(-8);
    message.textContent = "इस डिवाइस से प्रोफाइल हटा दी गई है।";
    message.className = "success";
  });
});