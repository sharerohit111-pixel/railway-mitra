
/* =====================================
   RAILWAY MITRA - DA CALCULATOR
   Independent calculation logic
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const basicPayInput = document.getElementById("basicPay");
    const daRateInput = document.getElementById("daRate");

    const calculateButton = document.getElementById("calculateDA");
    const resetButton = document.getElementById("resetDA");

    const resultBasic = document.getElementById("resultBasic");
    const resultRate = document.getElementById("resultRate");
    const resultDA = document.getElementById("resultDA");
    const resultTotal = document.getElementById("resultTotal");

    const currency = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });

    function showError(message) {
        alert(message);
    }

    function calculateDA() {

        const basicPay = Number(basicPayInput.value);
        const daRate = Number(daRateInput.value);

        if (
            basicPayInput.value.trim() === "" ||
            !Number.isFinite(basicPay) ||
            basicPay <= 0
        ) {
            showError("कृपया सही मूल वेतन दर्ज करें।");
            basicPayInput.focus();
            return;
        }

        if (
            daRateInput.value.trim() === "" ||
            !Number.isFinite(daRate) ||
            daRate < 0
        ) {
            showError("कृपया सही DA दर दर्ज करें।");
            daRateInput.focus();
            return;
        }

        // DA की गणना
        const exactDA = basicPay * daRate / 100;

        // रुपये में निकटतम पूर्णांक तक राउंडिंग
        const daAmount = Math.floor(exactDA + 0.500000001);

        // मूल वेतन + DA
        const totalAmount = basicPay + daAmount;

        // परिणाम दिखाएँ
        resultBasic.textContent = currency.format(basicPay);
        resultRate.textContent = daRate + "%";
        resultDA.textContent = currency.format(daAmount);
        resultTotal.textContent = currency.format(totalAmount);
    }

    function resetCalculator() {

        basicPayInput.value = "25500";
        daRateInput.value = "63";

        resultBasic.textContent = "₹25,500";
        resultRate.textContent = "63%";
        resultDA.textContent = "₹16,065";
        resultTotal.textContent = "₹41,565";
    }

    calculateButton.addEventListener("click", calculateDA);
    resetButton.addEventListener("click", resetCalculator);

});
