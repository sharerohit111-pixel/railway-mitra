"use strict";
(() => {
  const root = document.getElementById("gdceDirectory");
  if (!root) return;
  const search = root.querySelector("#gdceSearch");
  const division = root.querySelector("#gdceDivision");
  const examDate = root.querySelector("#gdceDate");
  const city = root.querySelector("#gdceCity");
  const list = root.querySelector("#gdceResults");
  const count = root.querySelector("#gdceCount");
  const pageLabel = root.querySelector("#gdcePage");
  const prev = root.querySelector("#gdcePrev");
  const next = root.querySelector("#gdceNext");
  const pageSize = 25;
  let rows = [];
  let page = 1;
  let filtered = [];
  const addOption = (select, value, label) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; select.append(option);
  };
  const unique = key => [...new Set(rows.map(row => row[key]).filter(Boolean))];
  function filterRows() {
    const q = search.value.trim().toLocaleLowerCase();
    filtered = rows.filter(row => {
      const text = [row.rollNumber,row.name,row.fatherName,row.division,row.examDate,row.examCity].join(" ").toLocaleLowerCase();
      return (!q || text.includes(q)) &&
        (!division.value || row.division === division.value) &&
        (!examDate.value || row.examDate === examDate.value) &&
        (!city.value || row.examCity === city.value);
    });
    page = 1; render();
  }
  function render() {
    list.replaceChildren();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    filtered.slice(start, start + pageSize).forEach(row => {
      const card = document.createElement("article"); card.className = "gdce-candidate";
      const top = document.createElement("div"); top.className = "gdce-candidate-top";
      const name = document.createElement("h3"); name.textContent = row.name;
      const roll = document.createElement("span"); roll.className = "gdce-roll"; roll.textContent = row.rollNumber;
      top.append(name, roll); card.append(top);
      const father = document.createElement("p"); father.textContent = "Father: " + row.fatherName;
      const meta = document.createElement("div"); meta.className = "gdce-meta";
      [ "Division: " + row.division, "Exam: " + row.examDate, "City: " + row.examCity,
        "JE: " + (row.examJE ? "Yes" : "No"), "TM: " + (row.examTM ? "Yes" : "No"),
        "PDF page: " + row.pdfPage ].forEach(value => {
          const item = document.createElement("span"); item.textContent = value; meta.append(item);
        });
      card.append(father, meta); list.append(card);
    });
    count.textContent = filtered.length + " of " + rows.length + " candidates";
    pageLabel.textContent = "Page " + page + " / " + totalPages;
    prev.disabled = page <= 1; next.disabled = page >= totalPages;
    root.querySelector("#gdceEmpty").hidden = filtered.length !== 0;
  }
  search.addEventListener("input", filterRows);
  [division,examDate,city].forEach(select => select.addEventListener("change", filterRows));
  root.querySelector("#gdceClear").addEventListener("click", () => {
    search.value = ""; division.value = ""; examDate.value = ""; city.value = ""; filterRows();
  });
  prev.addEventListener("click", () => { if (page > 1) { page--; render(); } });
  next.addEventListener("click", () => { if (page < Math.ceil(filtered.length / pageSize)) { page++; render(); } });
  fetch("./gdce-candidates.json", {cache:"no-store"})
    .then(response => { if (!response.ok) throw new Error("Candidate data unavailable"); return response.json(); })
    .then(data => {
      if (!data || !Array.isArray(data.candidates)) throw new Error("Invalid candidate data");
      rows = data.candidates;
      unique("division").sort().forEach(value => addOption(division,value,value));
      unique("examDate").sort((a,b)=>a.split(".").reverse().join("").localeCompare(b.split(".").reverse().join("")))
        .forEach(value => addOption(examDate,value,value));
      unique("examCity").sort().forEach(value => addOption(city,value,value));
      filterRows();
      root.querySelector("#gdceDataStatus").textContent =
        data.document.candidateCount + " entries · " + data.document.pages + " PDF pages · Notice date " + data.document.letterDate;
    })
    .catch(error => {
      console.error("GDCE directory:",error);
      root.querySelector("#gdceDataStatus").textContent = "Candidate list could not be loaded. Please try again later.";
      root.querySelector("#gdceEmpty").hidden = false;
    });
})();
