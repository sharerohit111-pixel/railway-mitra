/*
========================================
RAILWAY MITRA
MAIN APPLICATION JAVASCRIPT
Modular Development System
========================================
*/

"use strict";

document.addEventListener("DOMContentLoaded", async function () {

    // =====================================
    // 1. FOOTER YEAR UPDATE
    // =====================================

    const footer = document.querySelector(".app-footer");

    if (footer) {
        const footerYear = footer.querySelector("p:last-of-type");

        if (footerYear) {
            footerYear.textContent =
                "© " + new Date().getFullYear() + " Railway Mitra";
        }
    }


    // =====================================
    // 2. MODULE ICONS AND DESCRIPTIONS
    // =====================================

    const moduleDetails = {
        profile: {
            icon: "👤",
            description: "Personal Employee Information"
        },
        salary: {
            icon: "💰",
            description: "Salary and Pay Calculators"
        },
        allowances: {
            icon: "📊",
            description: "DA, HRA, TA, NDA, OTA"
        },
        paycommission8: {
            icon: "📈",
            description: "8th CPC Salary and Arrear Estimate"
        },
        arrears: {
            icon: "🧮",
            description: "DA and Other Arrears"
        },
        duty: {
            icon: "🕒",
            description: "Duty and Attendance Records"
        },
        leave: {
            icon: "📅",
            description: "Leave and Balance Calculator"
        },
        retirement: {
            icon: "🏦",
            description: "Retirement Planning Tools"
        },
        finance: {
            icon: "💳",
            description: "EMI and Financial Tools"
        },
        rules: {
            icon: "📚",
            description: "Rules, Manuals and Circulars"
        },
        engineering: {
            icon: "🚆",
            description: "Track and P-Way Information"
        },
        documents: {
            icon: "📁",
            description: "Documents and PDF Utilities"
        },
        updates: {
            icon: "🔔",
            description: "Orders and Notifications"
        }
    };


    // =====================================
    // 3. DYNAMIC MODULE CARD SYSTEM
    // =====================================

    async function loadModuleCards() {

        const featureGrid =
            document.getElementById("featureGrid");

        if (!featureGrid) {
            console.error("Feature Grid not found.");
            return;
        }

        const loader = window.RailwayMitraModuleLoader;

        if (!loader || typeof loader.load !== "function") {
            console.error("Module Loader not available.");
            return;
        }

        try {

            const modules = await loader.load();

            if (!Array.isArray(modules)) {
                throw new Error("Invalid module list.");
            }

            featureGrid.replaceChildren();

            modules.forEach(function (module) {

                if (
                    !module ||
                    module.enabled !== true ||
                    typeof module.id !== "string" ||
                    typeof module.name !== "string" ||
                    typeof module.path !== "string"
                ) {
                    return;
                }

                // Create module card
                const card = document.createElement("a");

                card.href = module.path;
                card.className = "feature-card";
                card.dataset.moduleId = module.id;

                // Module icon
                const iconBox = document.createElement("span");

                const details =
                    moduleDetails[module.id] || {
                        icon: "📌",
                        description: "Railway Employee Services"
                    };

                iconBox.textContent = details.icon;

                // Module title
                const title = document.createElement("h3");

                title.textContent = module.name;

                // Module description
                const description = document.createElement("p");

                if (
                    module.id === "allowances" &&
                    Array.isArray(module.calculators)
                ) {
                    description.textContent =
                        module.calculators.join(", ");
                } else {
                    description.textContent = details.description;
                }

                // Add elements to card
                card.appendChild(iconBox);
                card.appendChild(title);
                card.appendChild(description);

                // Add card to dashboard
                featureGrid.appendChild(card);

            });

            console.log(
                "Railway Mitra modules loaded:",
                modules.length
            );

        } catch (error) {

            console.error("Module Loading Error:", error);

            featureGrid.textContent =
                "Unable to load employee services. Please refresh the page.";

        }
    }


    // =====================================
    // 4. MOBILE MENU
    // =====================================

    const menuButton =
        document.getElementById("menuBtn");

    if (menuButton) {

        const menu = document.createElement("nav");

        menu.className = "mobile-menu";
        menu.id = "mobileMenu";
        menu.setAttribute("aria-label", "Main navigation");

        // Menu links
        const menuItems = [
            ["Employee Profile", "features/profile/index.html"],
            ["Allowances", "features/allowances/index.html"]
        ];

        menuItems.forEach(function (item) {

            const link = document.createElement("a");

            link.href = item[1];
            link.textContent = item[0];

            menu.appendChild(link);

        });

        // Logout link
        const logoutLink = document.createElement("a");

        logoutLink.href = "#";
        logoutLink.id = "rmLogoutBtn";
        logoutLink.textContent = "🚪 Logout";

        menu.appendChild(logoutLink);

        // Menu styling
        menu.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            right: 5%;
            width: min(270px, 90%);
            max-height: 70vh;
            overflow-y: auto;
            background: #FFFFFF;
            border: 1px solid #1E8F0F;
            border-radius: 12px;
            padding: 10px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.18);
            z-index: 200;
        `;

        // Menu links styling
        menu.querySelectorAll("a").forEach(function (link) {

            link.style.cssText = `
                display: block;
                padding: 12px;
                color: #12345A;
                text-decoration: none;
                border-bottom: 1px solid #E1E8F0;
                font-size: 14px;
            `;

        });

        // Add menu to header
        const header =
            document.querySelector(".app-header");

        if (header) {

            header.style.position = "sticky";
            header.appendChild(menu);

        } else {

            document.body.appendChild(menu);

        }

        // Menu open / close
        menuButton.setAttribute("aria-expanded", "false");

        menuButton.setAttribute("aria-controls", "mobileMenu");

        function closeMenu() {

            menu.style.display = "none";

            menuButton.textContent = "☰";

            menuButton.setAttribute(
                "aria-expanded",
                "false"
            );

            menuButton.setAttribute(
                "aria-label",
                "Open menu"
            );

        }

        menuButton.addEventListener("click", function () {

            const isOpen =
                menu.style.display === "block";

            if (isOpen) {

                closeMenu();

            } else {

                menu.style.display = "block";

                menuButton.textContent = "✕";

                menuButton.setAttribute(
                    "aria-expanded",
                    "true"
                );

                menuButton.setAttribute(
                    "aria-label",
                    "Close menu"
                );

            }

        });

        // Close menu after selecting a link
        menu.querySelectorAll("a:not(#rmLogoutBtn)")
            .forEach(function (link) {

                link.addEventListener("click", closeMenu);

            });

        // Close menu when clicking outside
        document.addEventListener("click", function (event) {

            if (
                !menu.contains(event.target) &&
                !menuButton.contains(event.target)
            ) {
                closeMenu();
            }

        });

        // Close menu with Escape key
        document.addEventListener("keydown", function (event) {

            if (event.key === "Escape") {
                closeMenu();
            }

        });

        // =====================================
        // 5. FIREBASE LOGOUT
        // =====================================

        const logoutBtn =
            menu.querySelector("#rmLogoutBtn");

        if (logoutBtn) {

            logoutBtn.addEventListener(
                "click",
                async function (event) {

                    event.preventDefault();

                    try {

                        const { auth } =
                            await import("./firebase.js");

                        const { signOut } =
                            await import(
                                "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js"
                            );

                        await signOut(auth);

                        window.location.href =
                            "features/auth/login.html";

                    } catch (error) {

                        console.error(
                            "Logout Error:",
                            error
                        );

                        alert(
                            "Logout नहीं हो पाया। कृपया दोबारा प्रयास करें।"
                        );

                    }

                }
            );

        }

    }


    // =====================================
    // 6. LOAD MODULES
    // =====================================

    await loadModuleCards();


    // =====================================
    // 7. APPLICATION READY
    // =====================================

    console.log(
        "Railway Mitra initialized successfully."
    );

});

