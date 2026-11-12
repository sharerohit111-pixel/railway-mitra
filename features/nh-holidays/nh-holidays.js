/* Railway Mitra — National Holiday / NHA calendar data and search. */
(function () {
  "use strict";

  const nhData = {
    "2026": [
      { no: 1, name: "गणतंत्र दिवस (Republic Day)", date: "26 जनवरी 2026", day: "सोमवार (Monday)", type: "comp" },
      { no: 2, name: "स्वतंत्रता दिवस (Independence Day)", date: "15 अगस्त 2026", day: "शनिवार (Saturday)", type: "comp" },
      { no: 3, name: "गांधी जयंती (Mahatma Gandhi Jayanti)", date: "02 अक्टूबर 2026", day: "शुक्रवार (Friday)", type: "comp" },
      { no: 4, name: "मकर संक्रांति / पोंगल (Makar Sankranti / Pongal)", date: "14 / 15 जनवरी 2026", day: "बुध / गुरुवार", type: "reg" },
      { no: 5, name: "महाशिवरात्रि (Maha Shivaratri)", date: "15 फरवरी 2026", day: "रविवार (Sunday)", type: "reg" },
      { no: 6, name: "होली (Holi)", date: "04 मार्च 2026", day: "बुधवार (Wednesday)", type: "reg" },
      { no: 7, name: "ईद-उल-फितर (Id-ul-Fitr)*", date: "21 मार्च 2026", day: "शनिवार (Saturday)", type: "reg" },
      { no: 8, name: "गुड फ्राइडे (Good Friday)", date: "03 अप्रैल 2026", day: "शुक्रवार (Friday)", type: "reg" },
      { no: 9, name: "ईद-उल-जुहा / बकरीद (Id-ul-Zuha)*", date: "27 / 28 मई 2026", day: "बुध / गुरुवार", type: "reg" },
      { no: 10, name: "दशहरा / विजयादशमी (Dussehra)", date: "20 अक्टूबर 2026", day: "मंगलवार (Tuesday)", type: "reg" },
      { no: 11, name: "दीपावली (Diwali / Deepavali)", date: "08 नवंबर 2026", day: "रविवार (Sunday)", type: "reg" },
      { no: 12, name: "क्रिसमस (Christmas Day)", date: "25 दिसंबर 2026", day: "शुक्रवार (Friday)", type: "reg" },
      { no: 13, name: "रक्षाबंधन (Raksha Bandhan)", date: "28 अगस्त 2026", day: "शुक्रवार (Friday)", type: "reg" }
    ],
    "2027": [
      { no: 1, name: "गणतंत्र दिवस (Republic Day)", date: "26 जनवरी 2027", day: "मंगलवार (Tuesday)", type: "comp" },
      { no: 2, name: "स्वतंत्रता दिवस (Independence Day)", date: "15 अगस्त 2027", day: "रविवार (Sunday)", type: "comp" },
      { no: 3, name: "गांधी जयंती (Mahatma Gandhi Jayanti)", date: "02 अक्टूबर 2027", day: "शनिवार (Saturday)", type: "comp" },
      { no: 4, name: "ईद-उल-फितर (Id-ul-Fitr)*", date: "10 मार्च 2027", day: "बुधवार (Wednesday)", type: "reg" },
      { no: 5, name: "होली (Holi)", date: "23 मार्च 2027", day: "मंगलवार (Tuesday)", type: "reg" },
      { no: 6, name: "गुड फ्राइडे (Good Friday)", date: "26 मार्च 2027", day: "शुक्रवार (Friday)", type: "reg" },
      { no: 7, name: "रामनवमी (Ram Navami)", date: "15 अप्रैल 2027", day: "गुरुवार (Thursday)", type: "reg" },
      { no: 8, name: "ईद-उल-जुहा / बकरीद (Id-ul-Zuha)*", date: "17 मई 2027", day: "सोमवार (Monday)", type: "reg" },
      { no: 9, name: "जन्माष्टमी (Janmashtami)", date: "25 अगस्त 2027", day: "बुधवार (Wednesday)", type: "reg" },
      { no: 10, name: "दशहरा / विजयादशमी (Dussehra)", date: "09 अक्टूबर 2027", day: "शनिवार (Saturday)", type: "reg" },
      { no: 11, name: "दीपावली (Diwali / Deepavali)", date: "29 अक्टूबर 2027", day: "शुक्रवार (Friday)", type: "reg" },
      { no: 12, name: "क्रिसमस (Christmas Day)", date: "25 दिसंबर 2027", day: "शनिवार (Saturday)", type: "reg" },
      { no: 13, name: "रक्षाबंधन (Raksha Bandhan)", date: "17 अगस्त 2027", day: "मंगलवार (Tuesday)", type: "reg" }
    ],
    "2028": [
      { no: 1, name: "गणतंत्र दिवस (Republic Day)", date: "26 जनवरी 2028", day: "बुधवार (Wednesday)", type: "comp" },
      { no: 2, name: "स्वतंत्रता दिवस (Independence Day)", date: "15 अगस्त 2028", day: "मंगलवार (Tuesday)", type: "comp" },
      { no: 3, name: "गांधी जयंती (Mahatma Gandhi Jayanti)", date: "02 अक्टूबर 2028", day: "सोमवार (Monday)", type: "comp" },
      { no: 4, name: "महाशिवरात्रि (Maha Shivaratri)", date: "23 फरवरी 2028", day: "बुधवार (Wednesday)", type: "reg" },
      { no: 5, name: "ईद-उल-फितर (Id-ul-Fitr)*", date: "27 फरवरी 2028", day: "रविवार (Sunday)", type: "reg" },
      { no: 6, name: "होली (Holi)", date: "11 मार्च 2028", day: "शनिवार (Saturday)", type: "reg" },
      { no: 7, name: "गुड फ्राइडे (Good Friday)", date: "14 अप्रैल 2028", day: "शुक्रवार (Friday)", type: "reg" },
      { no: 8, name: "ईद-उल-जुहा / बकरीद (Id-ul-Zuha)*", date: "05 / 06 मई 2028", day: "शुक्र / शनिवार", type: "reg" },
      { no: 9, name: "जन्माष्टमी (Janmashtami)", date: "13 अगस्त 2028", day: "रविवार (Sunday)", type: "reg" },
      { no: 10, name: "दशहरा / विजयादशमी (Dussehra)", date: "27 सितंबर 2028", day: "बुधवार (Wednesday)", type: "reg" },
      { no: 11, name: "दीपावली (Diwali / Deepavali)", date: "17 अक्टूबर 2028", day: "मंगलवार (Tuesday)", type: "reg" },
      { no: 12, name: "क्रिसमस (Christmas Day)", date: "25 दिसंबर 2028", day: "सोमवार (Monday)", type: "reg" },
      { no: 13, name: "रक्षाबंधन (Raksha Bandhan)", date: "05 अगस्त 2028", day: "शनिवार (Saturday)", type: "reg" }
    ]
  };

  function init() {
    const tableBody = document.getElementById("nhTableBody");
    const tableTitle = document.getElementById("tableTitle");
    const yearStatus = document.getElementById("yearStatus");
    const searchInput = document.getElementById("searchInput");
    const resultCount = document.getElementById("resultCount");
    const tabs = Array.from(document.querySelectorAll(".rm-nh-tab"));
    if (!tableBody || !tableTitle || !yearStatus || !searchInput) return;

    let currentYear = "2026";

    function renderTable() {
      const query = searchInput.value.toLocaleLowerCase().trim();
      const list = nhData[currentYear] || [];
      const filtered = list.filter(function (item) {
        return [item.name, item.date, item.day].some(function (value) {
          return value.toLocaleLowerCase().includes(query);
        });
      });

      tableTitle.textContent = "वर्ष " + currentYear + " – कुल " + list.length + " नेशनल हॉलिडे (NH)";
      yearStatus.textContent = currentYear === "2028"
        ? "Provisional · 3 अनिवार्य + " + (list.length - 3) + " क्षेत्रीय"
        : "3 अनिवार्य + " + (list.length - 3) + " क्षेत्रीय अवकाश";
      tableBody.replaceChildren();

      if (!filtered.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "rm-nh-empty";
        cell.textContent = "कोई परिणाम नहीं मिला।";
        row.appendChild(cell);
        tableBody.appendChild(row);
      } else {
        filtered.forEach(function (item) {
          const row = document.createElement("tr");
          [item.no, item.name, item.date, item.day].forEach(function (value, index) {
            const cell = document.createElement("td");
            if (index < 2) {
              const strong = document.createElement("strong");
              strong.textContent = String(value);
              cell.appendChild(strong);
            } else {
              cell.textContent = value;
            }
            row.appendChild(cell);
          });

          const typeCell = document.createElement("td");
          const badge = document.createElement("span");
          badge.className = "rm-nh-badge " + (item.type === "comp" ? "rm-nh-badge--comp" : "rm-nh-badge--reg");
          badge.textContent = item.type === "comp" ? "अनिवार्य (All India)" : "क्षेत्रीय (Divisional)";
          typeCell.appendChild(badge);
          row.appendChild(typeCell);
          tableBody.appendChild(row);
        });
      }

      if (resultCount) resultCount.textContent = filtered.length + " / " + list.length + " अवकाश दिखाए जा रहे हैं";
    }

    tabs.forEach(function (button) {
      button.addEventListener("click", function () {
        currentYear = button.dataset.year;
        tabs.forEach(function (tab) {
          const active = tab === button;
          tab.classList.toggle("is-active", active);
          tab.setAttribute("aria-pressed", active ? "true" : "false");
        });
        renderTable();
      });
    });

    searchInput.addEventListener("input", renderTable);
    renderTable();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
