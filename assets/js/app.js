
/* =====================================
   RAILWAY MITRA
   MAIN APPLICATION JAVASCRIPT
   ===================================== */

"use strict";

document.addEventListener("DOMContentLoaded", function () {

    // Update footer year automatically
    const footer = document.querySelector(".app-footer");

    if (footer) {
        const footerParagraphs = footer.querySelectorAll("p");
        const lastParagraph = footerParagraphs[footerParagraphs.length - 1];

        if (lastParagraph) {
            lastParagraph.textContent =
                "© " + new Date().getFullYear() + " Railway Mitra";
        }
    }

    // Mobile menu button
    const menuButton = document.getElementById("menuBtn");

    if (menuButton) {

        const menu = document.createElement("nav");

        menu.className = "mobile-menu";

        menu.innerHTML = `
            <a href="features/profile/index.html">My Profile</a>
            <a href="features/salary/index.html">Salary & Pay</a>
            <a href="features/allowances/index.html">Allowances</a>
            <a href="features/arrears/index.html">Arrear Calculator</a>
            <a href="features/retirement/index.html">NPS & Pension</a>
            <a href="features/rules/index.html">Railway Rules</a>
            <a href="features/updates/index.html">Railway Updates</a>
            <a href="#" id="rmLogoutBtn">🚪 Logout</a>
        `;

        menu.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            right: 5%;
            width: min(270px, 90%);
            max-height: 70vh;
            overflow-y: auto;
            background: #FFFFFF;
            border: 1px solid #E1E8F0;
            border-radius: 12px;
            padding: 10px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.18);
            z-index: 200;
        `;

        menu.querySelectorAll("a").forEach(function (link) {
            link.style.cssText = `
                display: block;
                padding: 12px;
                color: #12345A;
                text-decoration: none;
                border-bottom: 1px solid #E1E8F0;
                font-size: 14px;
            `;
           // Firebase Logout
const logoutBtn = menu.querySelector("#rmLogoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async function (event) {
        event.preventDefault();

        try {
            const { auth } = await import("./firebase.js");

            const { signOut } = await import(
                "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js"
            );

            await signOut(auth);

            window.location.href = "features/auth/login.html";

        } catch (error) {
            console.error("Logout Error:", error);
            alert("Logout नहीं हो पाया। कृपया दोबारा प्रयास करें।");
        }
    });
    }
        });

        const header = document.querySelector(".app-header");

        if (header) {
            header.style.position = "sticky";
            header.appendChild(menu);
        }

        menuButton.setAttribute("aria-expanded", "false");

        menuButton.addEventListener("click", function () {

            const isOpen = menu.style.display === "block";

            menu.style.display = isOpen ? "none" : "block";

            menuButton.setAttribute(
                "aria-expanded",
                String(!isOpen)
            );

            menuButton.setAttribute(
                "aria-label",
                isOpen ? "Open menu" : "Close menu"
            );

            menuButton.textContent = isOpen ? "☰" : "✕";
        });

        // Close menu when clicking outside
        document.addEventListener("click", function (event) {

            if (
                !menu.contains(event.target) &&
                !menuButton.contains(event.target)
            ) {
                menu.style.display = "none";
                menuButton.textContent = "☰";
                menuButton.setAttribute("aria-expanded", "false");
                menuButton.setAttribute("aria-label", "Open menu");
            }

        });

    }

    console.log("Railway Mitra initialized successfully.");

});
