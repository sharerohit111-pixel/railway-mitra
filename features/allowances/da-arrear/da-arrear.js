
function autoFillPostDetails() {
    const select = document.getElementById("postSelect");
    const selectedOption = select.options[select.selectedIndex];

    document.getElementById("basicPay").value =
        selectedOption.getAttribute("data-basic");

    document.getElementById("tpaAmount").value =
        selectedOption.getAttribute("data-tpa");

    const isRunning =
        selectedOption.getAttribute("data-running") === "true";

    const note = document.getElementById("ruleNote");

    if (isRunning) {
        note.textContent =
            "नियम: DA Arrear 100% Basic + TPA पर मिलेगा (NPS कटौती 130% Basic के DA अंतर पर लागू)।";
    } else {
        note.textContent =
            "नियम: DA Arrear 100% Basic + TPA पर मिलेगा (NPS कटौती 100% Basic के DA अंतर पर लागू)।";
    }
}

function calculateArrear() {
    const select = document.getElementById("postSelect");

    const isRunning =
        select.options[select.selectedIndex]
        .getAttribute("data-running") === "true";

    const basic =
        parseFloat(document.getElementById("basicPay").value) || 0;

    const tpa =
        parseFloat(document.getElementById("tpaAmount").value) || 0;

    const daDiffPercent =
        parseFloat(document.getElementById("daIncrease").value) || 0;

    const months =
        parseFloat(document.getElementById("totalMonths").value) || 0;

    const isNps =
        document.getElementById("npsCheck").checked;

    if (basic <= 0 || tpa < 0 || daDiffPercent < 0 || months <= 0) {
        alert("कृपया सभी विवरण सही भरें।");
        return;
    }

    // 1. Basic Pay और TPA पर DA Arrear
    const basicArrear =
        basic * (daDiffPercent / 100) * months;

    const tpaArrear =
        tpa * (daDiffPercent / 100) * months;

    // 2. कुल Gross Arrear
    const grossArrear =
        basicArrear + tpaArrear;

    // 3. NPS कटौती
    const npsBaseArrear = isRunning
        ? basic * 1.30 * (daDiffPercent / 100) * months
        : basicArrear;

    const npsDeduction = isNps
        ? Math.round(npsBaseArrear * 0.10)
        : 0;

    // 4. अंतिम Net Arrear
    const netInHand =
        Math.round(grossArrear - npsDeduction);

    // 5. परिणाम दिखाएँ
    document.getElementById("resBasicArrear").textContent =
        "₹" + Math.round(basicArrear).toLocaleString("en-IN");

    document.getElementById("resTpaArrear").textContent =
        "₹" + Math.round(tpaArrear).toLocaleString("en-IN");

    document.getElementById("resGrossArrear").textContent =
        "₹" + Math.round(grossArrear).toLocaleString("en-IN");

    document.getElementById("npsLabel").textContent =
        isRunning
        ? "NPS Deduction (10% on 130% Basic DA):"
        : "NPS Deduction (10% on Basic DA):";

    document.getElementById("resNps").textContent =
        "- ₹" + npsDeduction.toLocaleString("en-IN");

    document.getElementById("netPayText").textContent =
        "₹" + netInHand.toLocaleString("en-IN");

    document.getElementById("resultBox").style.display = "block";
}

// पद बदलने पर Basic Pay और TPA अपने आप भरें
document.getElementById("postSelect")
    .addEventListener("change", autoFillPostDetails);

// गणना बटन
document.getElementById("calculateArrear")
    .addEventListener("click", calculateArrear);
