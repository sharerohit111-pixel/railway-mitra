
import { auth } from "../../assets/js/firebase.js";

import {
    RecaptchaVerifier,
    signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const phoneForm = document.getElementById("phoneLoginForm");
const otpForm = document.getElementById("otpForm");

const phoneInput = document.getElementById("phoneNumber");
const otpInput = document.getElementById("otpCode");

const sendOtpBtn = document.getElementById("sendOtpBtn");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const loginMessage = document.getElementById("loginMessage");

let recaptchaVerifier = null;
let confirmationResult = null;

auth.languageCode = "en";

function showMessage(message, isError = false) {
    loginMessage.textContent = message;
    loginMessage.style.color = isError ? "#FF7777" : "#35E8FF";
}

function createRecaptcha() {
    if (recaptchaVerifier) {
        recaptchaVerifier.clear();
    }

    recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
            size: "normal"
        }
    );

    return recaptchaVerifier;
}

// Send OTP
phoneForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const phoneNumber = phoneInput.value.trim();

    if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
        showMessage("कृपया सही 10 अंकों का मोबाइल नंबर डालें।", true);
        return;
    }

    sendOtpBtn.disabled = true;
    showMessage("OTP भेजा जा रहा है...");

    try {
        const appVerifier = createRecaptcha();

        confirmationResult = await signInWithPhoneNumber(
            auth,
            "+91" + phoneNumber,
            appVerifier
        );

        phoneForm.hidden = true;
        otpForm.hidden = false;

        showMessage("OTP आपके मोबाइल नंबर पर भेज दिया गया है।");
        otpInput.focus();

    } catch (error) {
        console.error("OTP Error:", error);

        showMessage(
            error.message || "OTP भेजने में समस्या हुई। दोबारा प्रयास करें।",
            true
        );

        if (recaptchaVerifier) {
            recaptchaVerifier.clear();
            recaptchaVerifier = null;
        }

    } finally {
        sendOtpBtn.disabled = false;
    }
});

// Verify OTP
otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const otp = otpInput.value.trim();

    if (!/^\d{6}$/.test(otp)) {
        showMessage("कृपया 6 अंकों का सही OTP डालें।", true);
        return;
    }

    if (!confirmationResult) {
        showMessage("पहले OTP प्राप्त करें।", true);
        return;
    }

    verifyOtpBtn.disabled = true;
    showMessage("OTP सत्यापित किया जा रहा है...");

    try {
        await confirmationResult.confirm(otp);

        showMessage("लॉगिन सफल हुआ। Railway Mitra में आपका स्वागत है।");

        window.location.href = "../../index.html";

    } catch (error) {
        console.error("OTP Verification Error:", error);

        showMessage(
            "OTP गलत या समाप्त हो चुका है। कृपया दोबारा जाँचें।",
            true
        );

    } finally {
        verifyOtpBtn.disabled = false;
    }
});
