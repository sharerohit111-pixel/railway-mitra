/* Railway Mitra dashboard controller. Calculator and authentication files are not modified. */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const translations = {
    en: {
      tagline:"Your Railway Digital Companion", welcome:"Welcome to Railway Mitra",
      intro:"Your Railway Services, Salary and Employee Tools in One Place.",
      profile:"👤 My Employee Profile", services:"Employee Services",
      privacy:"Privacy First", privacyText:"Your personal employee information must remain private and protected.",
      home:"Home", tools:"Services", rules:"Rules", profileNav:"Profile", language:"हिन्दी",
      descriptions:{
        profile:"Personal employee information",salary:"Salary and pay information",
        allowances:"DA, HRA, TA, NDA, OTA and KMA calculators",arrears:"Arrear information and tools",
        duty:"Duty and attendance resources",leave:"Leave information and resources",
        retirement:"NPS and pension resources",finance:"Loan and finance resources",
        rules:"Rules, manuals and circulars",engineering:"Track and P-Way information",
        documents:"Documents and PDF resources",updates:"Orders and notifications"
      }
    },
    hi: {
      tagline:"रेलवे कर्मचारियों का डिजिटल साथी",welcome:"रेलवे मित्र में आपका स्वागत है",
      intro:"रेलवे सेवाएँ, वेतन और कर्मचारी उपयोगी सुविधाएँ — एक ही स्थान पर।",
      profile:"👤 मेरी कर्मचारी प्रोफाइल",services:"कर्मचारी सेवाएँ",
      privacy:"गोपनीयता सर्वोपरि",privacyText:"आपकी व्यक्तिगत कर्मचारी जानकारी निजी और सुरक्षित रहनी चाहिए।",
      home:"होम",tools:"सेवाएँ",rules:"नियम",profileNav:"प्रोफाइल",language:"English",
      descriptions:{
        profile:"कर्मचारी की व्यक्तिगत जानकारी",salary:"वेतन एवं भुगतान संबंधी जानकारी",
        allowances:"डीए, एचआरए, टीए, एनडीए, ओटीए एवं केएमए कैलकुलेटर",
        arrears:"बकाया राशि संबंधी जानकारी एवं सुविधाएँ",duty:"ड्यूटी एवं उपस्थिति संसाधन",
        leave:"अवकाश संबंधी जानकारी एवं संसाधन",retirement:"एनपीएस एवं पेंशन संसाधन",
        finance:"ऋण एवं वित्तीय संसाधन",rules:"नियम, मैनुअल एवं परिपत्र",
        engineering:"ट्रैक एवं पी-वे जानकारी",documents:"दस्तावेज एवं पीडीएफ संसाधन",
        updates:"आदेश एवं सूचनाएँ"
      }
    }
  };

  let language = localStorage.getItem("railwayMitraLanguage");
  if (language !== "hi" && language !== "en") language = "en";

  const modules = await window.RailwayMitraModuleLoader?.load?.() || [];
  const grid = $("#featureGrid");
  const details = {
    profile:"👤",salary:"💰",allowances:"📊",arrears:"🧮",duty:"🕒",leave:"📅",
    retirement:"🏦",finance:"💳",rules:"📚",engineering:"🛤️",documents:"📁",updates:"🔔"
  };

  if (grid) {
    grid.replaceChildren();
    if (!modules.length) {
      const error = document.createElement("p");
      error.className = "module-error";
      error.setAttribute("role","alert");
      error.textContent = "Employee services are temporarily unavailable. Please refresh the page.";
      grid.append(error);
    } else {
      modules.forEach(module => {
        const card = document.createElement("a");
        card.className = "feature-card";
        card.href = module.path;
        card.dataset.moduleId = module.id;
        const icon = document.createElement("span");
        icon.className = "feature-icon";
        icon.setAttribute("aria-hidden","true");
        icon.textContent = details[module.id] || "📌";
        const title = document.createElement("h3");
        title.textContent = module.name;
        const description = document.createElement("p");
        description.textContent = translations.en.descriptions[module.id] || "Railway employee services";
        card.append(icon,title,description);
        grid.append(card);
      });
    }
  }

  const applyLanguage = () => {
    const t = translations[language];
    document.documentElement.lang = language;
    const map = {
      "[data-i18n='tagline']":t.tagline,"[data-i18n='welcome']":t.welcome,
      "[data-i18n='intro']":t.intro,"[data-i18n='profile']":t.profile,
      "[data-i18n='services']":t.services,"[data-i18n='privacy']":t.privacy,
      "[data-i18n='privacyText']":t.privacyText,"[data-nav-home]":t.home,
      "[data-nav-services]":t.tools,"[data-nav-rules]":t.rules,"[data-nav-profile]":t.profileNav
    };
    Object.entries(map).forEach(([selector,value]) => {
      document.querySelectorAll(selector).forEach(el => el.textContent = value);
    });
    document.querySelectorAll(".feature-card[data-module-id]").forEach(card => {
      const p = $("p",card);
      if (p) p.textContent = t.descriptions[card.dataset.moduleId] || "Railway employee services";
    });
    const toggle = $("#languageToggle");
    if (toggle) {
      toggle.textContent = t.language;
      toggle.setAttribute("aria-label", language === "en" ? "Switch language to Hindi" : "Switch language to English");
    }
  };

  $("#languageToggle")?.addEventListener("click",() => {
    language = language === "en" ? "hi" : "en";
    try { localStorage.setItem("railwayMitraLanguage",language); } catch (error) {
      console.warn("Language preference could not be saved.",error);
    }
    applyLanguage();
  });

  const footerYear = $(".app-footer p:last-of-type");
  if (footerYear) footerYear.textContent = "© " + new Date().getFullYear() + " Railway Mitra";

  const menuButton = $("#menuBtn");
  const header = $(".app-header");
  if (menuButton && header) {
    const menu = document.createElement("nav");
    menu.className = "mobile-menu";
    menu.id = "mobileMenu";
    menu.setAttribute("aria-label","Main navigation");
    modules.forEach(module => {
      const link = document.createElement("a");
      link.href = module.path;
      link.textContent = module.name;
      menu.append(link);
    });

    /* Preserve the existing Firebase sign-out action and destination. */
    const logoutLink = document.createElement("a");
    logoutLink.href = "#";
    logoutLink.id = "rmLogoutBtn";
    logoutLink.textContent = "🚪 Logout";
    menu.append(logoutLink);
    header.append(menu);
    menuButton.setAttribute("aria-controls","mobileMenu");
    menuButton.setAttribute("aria-expanded","false");

    const closeMenu = () => {
      menu.classList.remove("is-open");
      menuButton.textContent = "☰";
      menuButton.setAttribute("aria-expanded","false");
      menuButton.setAttribute("aria-label","Open menu");
    };
    menuButton.addEventListener("click",() => {
      const open = menu.classList.toggle("is-open");
      menuButton.textContent = open ? "×" : "☰";
      menuButton.setAttribute("aria-expanded",String(open));
      menuButton.setAttribute("aria-label",open ? "Close menu" : "Open menu");
    });
    menu.addEventListener("click",event => {
      if (event.target.closest("a") && event.target.id !== "rmLogoutBtn") closeMenu();
    });
    document.addEventListener("click",event => {
      if (!menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown",event => { if (event.key === "Escape") closeMenu(); });

    logoutLink.addEventListener("click",async event => {
      event.preventDefault();
      try {
        const {auth} = await import("./firebase.js");
        const {signOut} = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js");
        await signOut(auth);
        window.location.href = "features/auth/login.html";
      } catch (error) {
        console.error("Logout Error:",error);
        alert("Logout नहीं हो पाया। कृपया दोबारा प्रयास करें।");
      }
    });
  }

  applyLanguage();
  console.info("Railway Mitra dashboard initialized.");
});