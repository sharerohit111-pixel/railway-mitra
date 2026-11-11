// RAILWAY MITRA - REQUIRED AUTHENTICATION GUARD
// The main app is accessible only after a Firebase user is signed in.

import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.documentElement.classList.remove("auth-pending");
        document.documentElement.dataset.authReady = "true";
        return;
    }

    const loginUrl = new URL("features/auth/login.html", document.baseURI);
    loginUrl.searchParams.set("redirect", window.location.pathname + window.location.search + window.location.hash);
    window.location.replace(loginUrl.href);
});
