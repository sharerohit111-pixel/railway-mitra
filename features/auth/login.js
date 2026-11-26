
import { auth } from "../../assets/js/firebase.js";
import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithCredential,
    signInWithEmailAndPassword,
    sendPasswordResetEmail
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
        const messages = {
            "auth/invalid-credential": "Email या Password सही नहीं है। यदि पासवर्ड याद नहीं है, तो नीचे 'पासवर्ड भूल गए?' विकल्प से रीसेट करें।",
            "auth/user-not-found": "इस ईमेल से खाता नहीं मिला। ईमेल की वर्तनी जाँचें या सहायता लें।",
            "auth/wrong-password": "पासवर्ड सही नहीं है। 'पासवर्ड भूल गए?' विकल्प से रीसेट करें।",
            "auth/invalid-email": "कृपया सही ईमेल पता दर्ज करें।",
            "auth/too-many-requests": "कई बार प्रयास हुए हैं। सुरक्षा के लिए कुछ देर बाद दोबारा कोशिश करें।",
            "auth/network-request-failed": "इंटरनेट कनेक्शन जाँचें और फिर प्रयास करें।",
            "auth/operation-not-allowed": "Firebase में Email/Password Login अभी सक्षम नहीं है।"
        };
        showMessage(messages[error.code] || "Email Login पूरा नहीं हुआ (" + (error.code || "unknown") + ")।", true);
    } finally {
        emailLoginBtn.disabled = false;
    }
});

// Password recovery
const resetPasswordBtn = document.getElementById("resetPasswordBtn");
resetPasswordBtn.addEventListener("click", async () => {
    const email = document.getElementById("emailAddress").value.trim();
    if (!email) {
        showMessage("पहले अपना Email Address दर्ज करें।", true);
        document.getElementById("emailAddress").focus();
        return;
    }
    resetPasswordBtn.disabled = true;
    showMessage("पासवर्ड रीसेट ईमेल भेजा जा रहा है...");
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage("यदि इस ईमेल से खाता मौजूद है, तो रीसेट लिंक भेज दिया गया है। Inbox और Spam फ़ोल्डर जाँचें।");
    } catch (error) {
        console.error("Password Reset Error:", error);
        const messages = {
            "auth/invalid-email": "ईमेल पता सही नहीं है।",
            "auth/too-many-requests": "बहुत अधिक प्रयास हुए हैं। कुछ देर बाद कोशिश करें।",
            "auth/network-request-failed": "इंटरनेट कनेक्शन जाँचें और फिर प्रयास करें।"
        };
        showMessage(messages[error.code] || "पासवर्ड रीसेट ईमेल भेजने में समस्या हुई।", true);
    } finally {
        resetPasswordBtn.disabled = false;
    }
});

// Google Login
const googleLoginBtn = document.getElementById("googleLoginBtn");
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
let nativeGoogleLoginPending = false;
let nativeGoogleLoginTimeout = null;

window.onRailwayMitraGoogleSignInResult = async ({ idToken, error } = {}) => {
    if (!nativeGoogleLoginPending) return;
    nativeGoogleLoginPending = false;
    if (nativeGoogleLoginTimeout) clearTimeout(nativeGoogleLoginTimeout);
    try {
        if (error || !idToken) {
            const messages = {
                cancelled: "Google Login रद्द कर दिया गया।",
                no_account: "इस डिवाइस पर Google Account उपलब्ध नहीं मिला।",
                google_sign_in_failed: "Google Login पूरा नहीं हुआ। कृपया दोबारा प्रयास करें।"
            };
            showMessage(messages[error] || "Google Login पूरा नहीं हुआ।", true);
            return;
        }
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
        showMessage("Google Login सफल हुआ। Railway Mitra में आपका स्वागत है।");
        window.location.href = postLoginUrl;
    } catch (authError) {
        console.error("Native Google Firebase Auth Error:", authError);
        showMessage("Google खाते का Firebase सत्यापन पूरा नहीं हुआ (" + (authError.code || "unknown") + ")।", true);
    } finally {
        googleLoginBtn.disabled = false;
    }
};

googleLoginBtn.addEventListener("click", async () => {
    googleLoginBtn.disabled = true;
    showMessage("Google Account से लॉगिन किया जा रहा है...");
    try {
        const isAndroidWebView = !!(window.RailwayMitraNative &&
            typeof window.RailwayMitraNative.startGoogleSignIn === "function");
        if (isAndroidWebView) {
            nativeGoogleLoginPending = true;
            const status = window.RailwayMitraNative.startGoogleSignIn();
            if (status !== "started") {
                nativeGoogleLoginPending = false;
                const statusMessages = {
                    in_progress: "Google Login पहले से चल रहा है। कृपया प्रतीक्षा करें।",
                    untrusted_origin: "सुरक्षा कारणों से इस पेज पर Native Google Login उपलब्ध नहीं है।"
                };
                showMessage(statusMessages[status] || "Native Google Login शुरू नहीं हो पाया।", true);
                googleLoginBtn.disabled = false;
                return;
            }
            showMessage("Google Account चुनें...");
            nativeGoogleLoginTimeout = setTimeout(() => {
                if (!nativeGoogleLoginPending) return;
                nativeGoogleLoginPending = false;
                googleLoginBtn.disabled = false;
                showMessage("Google Login का जवाब नहीं मिला। कृपया दोबारा प्रयास करें।", true);
            }, 120000);
            return;
        }
        await signInWithPopup(auth, googleProvider);
        window.location.href = postLoginUrl;
    } catch (error) {
        console.error("Google Login Error:", error);
        const messages = {
            "auth/popup-blocked": "ब्राउज़र ने Google Login popup रोक दिया। Popup की अनुमति दें।",
            "auth/popup-closed-by-user": "Google Login विंडो बंद हो गई। दोबारा प्रयास करें।",
            "auth/unauthorized-domain": "यह वेबसाइट Firebase Authentication में Authorized Domain के रूप में जोड़ी नहीं गई है।",
            "auth/operation-not-allowed": "Firebase Console में Google Sign-In provider सक्षम नहीं है।",
            "auth/network-request-failed": "इंटरनेट कनेक्शन जाँचें और फिर प्रयास करें।"
        };
        showMessage(messages[error.code] || "Google Login पूरा नहीं हुआ (" + (error.code || "unknown") + ")।", true);
    } finally {
        if (!nativeGoogleLoginPending) googleLoginBtn.disabled = false;
    }
});
