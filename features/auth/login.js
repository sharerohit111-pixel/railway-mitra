
import { auth } from "../../assets/js/firebase.js";
import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithCredential,
    signInWithEmailAndPassword
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

// Return users to the requested same-origin app page after sign-in.
function getPostLoginUrl() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("redirect");
    if (requested) {
        try {
            const target = new URL(requested, window.location.origin);
            if (target.origin === window.location.origin &&
                (target.pathname.endsWith("/app.html") || target.pathname.includes("/features/"))) {
                return target.href;
            }
        } catch (_) {}
    }
    return new URL("../../app.html", window.location.href).href;
}
const postLoginUrl = getPostLoginUrl();

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

        window.location.href = postLoginUrl;

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

// Email and password login
const emailLoginForm = document.getElementById("emailLoginForm");
const emailLoginBtn = document.getElementById("emailLoginBtn");
emailLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    emailLoginBtn.disabled = true;
    showMessage("Email से लॉगिन किया जा रहा है...");
    try {
        await signInWithEmailAndPassword(
            auth,
            document.getElementById("emailAddress").value.trim(),
            document.getElementById("emailPassword").value
        );
        window.location.href = postLoginUrl;
    } catch (error) {
        console.error("Email Login Error:", error);
        showMessage("Email Login में समस्या: " + error.message, true);
    } finally {
        emailLoginBtn.disabled = false;
    }
});

// Google Login
const googleLoginBtn = document.getElementById("googleLoginBtn");
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
googleLoginBtn.addEventListener("click", async () => {
    googleLoginBtn.disabled = true;
    showMessage("Google Account से लॉगिन किया जा रहा है...");
    try {
        const nativeAuth = window.RailwayMitraNativeAuth;
        if (nativeAuth?.isNativePlatform?.()) {
            // Android: use Credential Manager through the native Firebase plugin,
            // then exchange its Google ID token into the existing Firebase JS session.
            const idToken = await nativeAuth.signInWithGoogle();
            const credential = GoogleAuthProvider.credential(idToken);
            await signInWithCredential(auth, credential);
        } else {
            // Website/PWA: preserve the existing browser popup flow.
            await signInWithPopup(auth, googleProvider);
        }
        window.location.href = postLoginUrl;
    } catch (error) {
        console.error("Google Login Error:", error);
        showMessage("Google Login में समस्या: " + error.message, true);
    } finally {
        googleLoginBtn.disabled = false;
    }
});

