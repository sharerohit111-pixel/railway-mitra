
/* =====================================
   RAILWAY MITRA
   GLOBAL FIREBASE AUTH GUARD
===================================== */

import { auth } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

// Login page ka URL
const loginPage = new URL(
    "../../features/auth/login.html",
    import.meta.url
);

// Authentication status check
onAuthStateChanged(auth, (user) => {

    // Login nahi hai
    if (!user) {
        window.location.replace(loginPage.href);
        return;
    }

    // Login safal hai
    document.documentElement.classList.remove("auth-pending");

    document.documentElement.dataset.authReady = "true";

});
