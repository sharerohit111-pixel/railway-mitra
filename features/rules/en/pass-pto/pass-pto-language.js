(function () {
  "use strict";
  const KEY = "railwayMitra.passPtoLanguage.v1";
  const HI = {
    "Pass & PTO Rules":"पास एवं PTO नियम",
    "← All Rule Categories":"← सभी नियम श्रेणियाँ",
    "← Pass & PTO Rules":"← पास एवं PTO नियम",
    "CATEGORY 03 · ENGLISH":"श्रेणी 03 · हिंदी",
    "CATEGORY 03 · PASS & PTO":"श्रेणी 03 · पास एवं PTO",
    "Pass & PTO Rules · Railway Mitra":"पास एवं PTO नियम · रेलवे मित्र",
    "Explore categories covering Pass and PTO provisions.":"पास एवं PTO से संबंधित नियमों की श्रेणियाँ देखें।",
    "Category 01 · Basic Definitions & General Eligibility":"श्रेणी 01 · मूल परिभाषाएँ एवं सामान्य पात्रता",
    "Category 02 · Privilege Pass Entitlement & Allotment":"श्रेणी 02 · विशेषाधिकार पास की पात्रता एवं आवंटन",
    "Category 03 · Privilege Ticket Order (PTO) Rules":"श्रेणी 03 · विशेषाधिकार टिकट आदेश (PTO) नियम",
    "Category 04 · Duty Pass Rules":"श्रेणी 04 · ड्यूटी पास नियम",
    "Category 05 · School Pass Entitlement":"श्रेणी 05 · स्कूल पास पात्रता",
    "Category 06 · Post-Retirement Complimentary Pass (PRCP)":"श्रेणी 06 · सेवानिवृत्ति के बाद निःशुल्क पास (PRCP)",
    "Category 07 · HRMS Process & Misuse Penalties":"श्रेणी 07 · HRMS प्रक्रिया एवं दुरुपयोग पर दंड",
    "Family, dependent relatives, validity and attendant rules":"परिवार, आश्रित संबंधी, वैधता एवं परिचारक संबंधी नियम",
    "Annual pass sets and class entitlement by service bracket":"सेवा अवधि के अनुसार वार्षिक पास सेट एवं श्रेणी पात्रता",
    "Annual PTO entitlement, fare concession and attendant restriction":"वार्षिक PTO पात्रता, किराये में रियायत एवं परिचारक संबंधी प्रतिबंध",
    "Metal passes, card passes and cheque passes":"धातु पास, कार्ड पास एवं चेक पास",
    "Eligibility, annual limit and guardian certificate":"पात्रता, वार्षिक सीमा एवं अभिभावक प्रमाणपत्र",
    "Qualifying service, annual sets and senior companion":"अर्हक सेवा, वार्षिक सेट एवं वरिष्ठ सहयात्री",
    "Digital pass process, prohibited misuse and penalties":"डिजिटल पास प्रक्रिया, निषिद्ध दुरुपयोग एवं दंड",
    "Open folder →":"फ़ोल्डर खोलें →",
    "Duty Pass Rules":"ड्यूटी पास नियम",
    "Privilege Pass Entitlement & Allotment":"विशेषाधिकार पास की पात्रता एवं आवंटन",
    "Privilege Ticket Order (PTO) Rules":"विशेषाधिकार टिकट आदेश (PTO) नियम",
    "School Pass Entitlement":"स्कूल पास पात्रता",
    "Post-Retirement Complimentary Pass (PRCP)":"सेवानिवृत्ति के बाद निःशुल्क पास (PRCP)",
    "HRMS Process & Misuse Penalties":"HRMS प्रक्रिया एवं दुरुपयोग पर दंड",
    "Basic Definitions & General Eligibility":"मूल परिभाषाएँ एवं सामान्य पात्रता",
    "For Pass and PTO benefits, the PDF defines family to include the spouse, dependent sons under 21, and unmarried, widowed or legally divorced daughters.":"पास एवं PTO लाभों के लिए PDF में परिवार में पति/पत्नी, 21 वर्ष से कम आयु के आश्रित पुत्र तथा अविवाहित, विधवा या कानूनी रूप से तलाकशुदा पुत्रियों को शामिल किया गया है।",
    "Widowed mothers, dependent unmarried or divorced sisters, and dependent minor brothers under 21 may be included if wholly dependent and the father is not alive.":"विधवा माता, आश्रित अविवाहित या तलाकशुदा बहनें तथा 21 वर्ष से कम आयु के आश्रित अवयस्क भाई शामिल किए जा सकते हैं, यदि वे पूर्णतः आश्रित हों और पिता जीवित न हों।",
    "A dependent relative's monthly income from all sources must not exceed 15% of the railway servant's Basic Pay or ₹9,000 + DA, whichever is higher, as stated in the PDF.":"PDF के अनुसार, आश्रित संबंधी की सभी स्रोतों से मासिक आय रेलवे कर्मचारी के मूल वेतन के 15% या ₹9,000 + DA, इनमें से जो अधिक हो, उससे अधिक नहीं होनी चाहिए।",
    "If only immediate family is included, the PDF states there is no upper member-count limit. If dependent relatives are included, their number is capped at 2 and total pass capacity at 5, excluding an authorised attendant.":"PDF के अनुसार, केवल निकट परिवार शामिल होने पर सदस्यों की अधिकतम संख्या की सीमा नहीं है। आश्रित संबंधियों को शामिल करने पर उनकी संख्या अधिकतम 2 और पास की कुल क्षमता 5 होगी; अधिकृत परिचारक इसमें शामिल नहीं है।",
    "The PDF states that HRMS e-Passes and PTOs are valid for 5 months from issue.":"PDF के अनुसार, HRMS e-Pass और PTO जारी होने की तारीख से 5 महीने तक वैध रहते हैं।",
    "First Class 'A' pass holders may take one personal salaried domestic servant/attendant in Second Class/Sleeper at no additional cost, as stated in the PDF.":"PDF के अनुसार, First Class 'A' पास धारक एक निजी वेतनभोगी घरेलू सेवक/परिचारक को बिना अतिरिक्त शुल्क Second Class/Sleeper में साथ ले जा सकते हैं।",
    "Privilege Pass Entitlement & Allotment":"विशेषाधिकार पास की पात्रता एवं आवंटन",
    "Non-Gazetted Group C & D staff with up to 5 years of service: 1 Full Set or 2 Half Sets per calendar year; the PDF lists Sleeper / Second Class 'A' entitlement and mentions 3AC upgrades at service checkpoints.":"5 वर्ष तक की सेवा वाले अराजपत्रित Group C एवं D कर्मचारियों को प्रति कैलेंडर वर्ष 1 Full Set या 2 Half Sets: PDF में Sleeper / Second Class 'A' पात्रता तथा निर्धारित सेवा अवधि पर 3AC उन्नयन का उल्लेख है।",
    "Non-Gazetted Group C & D staff with more than 5 years of service: 3 Full Sets or 6 Half Sets per calendar year. The PDF says Levels 1–5 get Sleeper/2S and Levels 6 and above get First Class/3AC/2AC options.":"5 वर्ष से अधिक सेवा वाले अराजपत्रित Group C एवं D कर्मचारियों को प्रति कैलेंडर वर्ष 3 Full Sets या 6 Half Sets। PDF के अनुसार Level 1–5 को Sleeper/2S तथा Level 6 और उससे ऊपर को First Class/3AC/2AC विकल्प मिलते हैं।",
    "Gazetted Group A & B officers: 6 Full Sets per calendar year from the first day of appointment; the PDF lists First Class 'A' and 1AC (with designated percentage payments), 2AC and 3AC.":"राजपत्रित Group A एवं B अधिकारियों को नियुक्ति के पहले दिन से प्रति कैलेंडर वर्ष 6 Full Sets; PDF में निर्धारित प्रतिशत भुगतान के साथ First Class 'A' और 1AC, 2AC तथा 3AC का उल्लेख है।",
    "Premium train quota: the PDF mentions Rajdhani, Shatabdi, Duronto and Vande Bharat, with seat allocation governed by commercial booking rules and employee Pay Level.":"प्रीमियम ट्रेन कोटा: PDF में राजधानी, शताब्दी, दुरंतो और वंदे भारत का उल्लेख है। सीट आवंटन वाणिज्यिक बुकिंग नियमों और कर्मचारी के Pay Level के अनुसार होता है।",
    "The PDF states that every serving employee, irrespective of service length or Group A/B/C/D classification, receives 4 Full Sets of PTO per calendar year.":"PDF के अनुसार, सेवा अवधि या Group A/B/C/D वर्गीकरण से अलग, प्रत्येक कार्यरत कर्मचारी को प्रति कैलेंडर वर्ष 4 Full Sets PTO मिलते हैं।",
    "Under a PTO, the employee or family member pays one-third (33.3%) of the base fare; the remaining two-thirds (66.6%) is subsidised by the Railways, as stated in the PDF.":"PDF के अनुसार, PTO पर कर्मचारी या परिवार का सदस्य मूल किराये का एक-तिहाई (33.3%) भुगतान करता है और शेष दो-तिहाई (66.6%) राशि रेलवे द्वारा रियायती होती है।",
    "A PTO does not authorise a complimentary or subsidised personal attendant in any travel class.":"PTO किसी भी यात्रा श्रेणी में निजी परिचारक को निःशुल्क या रियायती यात्रा की अनुमति नहीं देता।",
    "Gold Pass: the PDF says it is allotted to Railway Board Chairman and Members and Zonal General Managers, and is valid for family travel in 1AC across networks.":"Gold Pass: PDF के अनुसार यह रेलवे बोर्ड के अध्यक्ष एवं सदस्यों तथा जोनल महाप्रबंधकों को आवंटित होता है और नेटवर्क में 1AC द्वारा पारिवारिक यात्रा के लिए मान्य है।",
    "Silver Pass: the PDF says it is issued to Senior Administrative Grade (SAG) officers for official travel in 1AC.":"Silver Pass: PDF के अनुसार यह Senior Administrative Grade (SAG) अधिकारियों को आधिकारिक 1AC यात्रा के लिए जारी किया जाता है।",
    "Bronze Pass: the PDF says it is issued to Junior and Senior Scale officers for duty travel within their zonal jurisdiction.":"Bronze Pass: PDF के अनुसार यह Junior एवं Senior Scale अधिकारियों को अपने जोनल क्षेत्र में ड्यूटी यात्रा के लिए जारी किया जाता है।",
    "Card Passes: stated to be valid for 1 year and issued to non-gazetted operational personnel such as TTEs, Train Guards, Loco Pilots and Track Maintainers for repeated movement within their duty sections.":"Card Pass: PDF के अनुसार यह 1 वर्ष तक वैध होता है और TTE, Train Guard, Loco Pilot तथा Track Maintainer जैसे अराजपत्रित परिचालन कर्मचारियों को अपने ड्यूटी सेक्शन में बार-बार आवागमन के लिए जारी किया जाता है।",
    "Cheque Passes: described as single-use temporary passes for specified official trips, medical examinations, inquiry attendance or shifting household goods on official transfer.":"Cheque Pass: निर्दिष्ट आधिकारिक यात्रा, चिकित्सा परीक्षण, जाँच में उपस्थित होने या आधिकारिक स्थानांतरण पर घरेलू सामान भेजने के लिए एक बार उपयोग होने वाला अस्थायी पास।",
    "School Pass Entitlement":"स्कूल पास पात्रता",
    "The PDF states that a School Pass is granted when a dependent child studies regularly at a recognised boarding school or university away from the employee's official station.":"PDF के अनुसार, कर्मचारी के आधिकारिक स्टेशन से दूर किसी मान्यता प्राप्त आवासीय विद्यालय या विश्वविद्यालय में नियमित अध्ययन करने वाले आश्रित बच्चे को School Pass दिया जाता है।",
    "The PDF lists a maximum of 3 Full Sets or 6 Half Sets per academic year for vacation travel between the educational institution and the parent's station.":"PDF में शैक्षणिक वर्ष में छुट्टियों के दौरान शिक्षण संस्थान और माता-पिता के स्टेशन के बीच यात्रा हेतु अधिकतम 3 Full Sets या 6 Half Sets का उल्लेख है।",
    "For a minor student or a female child, the PDF says a Guardian/Parent Certificate may be added to authorise a parent or escort to travel free alongside the student.":"PDF के अनुसार, अवयस्क विद्यार्थी या बालिका के लिए Guardian/Parent Certificate जोड़कर माता-पिता या अनुरक्षक को विद्यार्थी के साथ निःशुल्क यात्रा की अनुमति दी जा सकती है।",
    "Post-Retirement Complimentary Pass (PRCP)":"सेवानिवृत्ति के बाद निःशुल्क पास (PRCP)",
    "The PDF states a minimum of 20 years of regular, continuous Railway service to qualify for lifetime complimentary post-retirement pass benefits.":"PDF के अनुसार, सेवानिवृत्ति के बाद आजीवन निःशुल्क पास लाभ के लिए कम से कम 20 वर्ष की नियमित एवं निरंतर रेलवे सेवा आवश्यक है।",
    "Non-Gazetted Group C & D: 20–25 years of service = 1 Set per year; more than 25 years = 2 Sets per year, as stated in the PDF.":"अराजपत्रित Group C एवं D: 20–25 वर्ष की सेवा पर प्रति वर्ष 1 Set; 25 वर्ष से अधिक सेवा पर प्रति वर्ष 2 Sets, PDF के अनुसार।",
    "Gazetted Group A & B: 20–25 years of service = 2 Sets per year; more than 25 years = 3 Sets per year, as stated in the PDF.":"राजपत्रित Group A एवं B: 20–25 वर्ष की सेवा पर प्रति वर्ष 2 Sets; 25 वर्ष से अधिक सेवा पर प्रति वर्ष 3 Sets, PDF के अनुसार।",
    "The PDF says retired employees aged 65 or above holding First Class post-retirement passes may take a companion in Sleeper/Second Class if travelling without other family members.":"PDF के अनुसार, First Class सेवानिवृत्ति पास रखने वाले 65 वर्ष या अधिक आयु के सेवानिवृत्त कर्मचारी अन्य परिवारजनों के बिना यात्रा करते समय Sleeper/Second Class में एक सहयात्री ले जा सकते हैं।",
    "The PDF states that physical pass ledgers are obsolete and that applications, tracking, routing modifications and booking links are handled through the HRMS e-Pass module.":"PDF के अनुसार, भौतिक पास लेजर अप्रचलित हैं और आवेदन, ट्रैकिंग, रूटिंग में संशोधन तथा बुकिंग लिंक HRMS e-Pass मॉड्यूल से संचालित होते हैं।",
    "The PDF describes selling or transferring passes, or declaring false dependency details to obtain passes for unauthorised persons, as a major offence that may attract major penalties under DAR Rules, including removal or dismissal.":"PDF के अनुसार, पास बेचना या हस्तांतरित करना अथवा अनधिकृत व्यक्तियों के लिए गलत आश्रित विवरण देना गंभीर कदाचार है। DAR नियमों के तहत सेवा से हटाने या बर्खास्तगी सहित बड़ी सज़ा हो सकती है।",
    "The PDF mentions administrative fines of ₹5 to ₹35 per validation lapse for misplacing or failing to log active journey parameters on manual passes where emergency configurations still apply.":"PDF में उन स्थितियों में, जहाँ आपात व्यवस्था के तहत मैनुअल पास लागू हैं, सत्यापन में चूक या सक्रिय यात्रा विवरण दर्ज न करने पर प्रति चूक ₹5 से ₹35 तक प्रशासनिक जुर्माने का उल्लेख है।",
    "Source: Railway_Pass_and_PTO_Rules_Final.pdf, pages 1–2. This reflects the uploaded PDF and is not an independently verified statement of current rules.":"स्रोत: Railway_Pass_and_PTO_Rules_Final.pdf, पृष्ठ 1–2। यह उपलब्ध कराई गई PDF की सामग्री है; वर्तमान नियमों की स्वतंत्र पुष्टि नहीं।",
    "Source: Railway_Pass_and_PTO_Rules_Final.pdf (2 pages). Content is organised as stated in the supplied PDF; verify current applicability against official Railway orders / HRMS.":"स्रोत: Railway_Pass_and_PTO_Rules_Final.pdf (2 पृष्ठ)। सामग्री उपलब्ध PDF के अनुसार व्यवस्थित है; वर्तमान लागू नियमों की पुष्टि आधिकारिक रेलवे आदेशों / HRMS से करें।",
    "CATEGORY 03 · PASS & PTO":"श्रेणी 03 · पास एवं PTO",
    "CATEGORY 03 · ENGLISH":"श्रेणी 03 · हिंदी",
    "English":"अंग्रेज़ी",
    "हिंदी":"हिंदी"
  };
  const original = new WeakMap();
  let mode = localStorage.getItem(KEY) || "en";
  function render() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!original.has(node)) original.set(node, node.nodeValue);
      const base = original.get(node);
      const trimmed = base.trim();
      const translated = mode === "hi" ? HI[trimmed] : null;
      if (translated) {
        const lead = base.match(/^\s*/)?.[0] || "";
        const tail = base.match(/\s*$/)?.[0] || "";
        node.nodeValue = lead + translated + tail;
      } else node.nodeValue = base;
    }
    document.documentElement.lang = mode;
    const button = document.getElementById("rmPassPtoLanguageToggle");
    if (button) {
      button.textContent = mode === "en" ? "हिंदी" : "English";
      button.setAttribute("aria-label", mode === "en" ? "हिंदी में बदलें" : "Switch to English");
    }
    const title = document.querySelector("title");
    if (title && original.has(title.firstChild) && mode === "hi") title.textContent = HI[original.get(title.firstChild)] || title.textContent;
  }
  function init() {
    const old = document.getElementById("rmLanguageToggle");
    if (old) old.remove();
    const button = document.createElement("button");
    button.id = "rmPassPtoLanguageToggle";
    button.type = "button";
    button.style.cssText = "position:fixed;right:14px;bottom:78px;z-index:99999;padding:10px 16px;border:1px solid #39dff5;border-radius:999px;background:linear-gradient(135deg,#087eae,#7838c8);color:#fff;font-weight:800;font-size:15px;box-shadow:0 4px 16px #0008;cursor:pointer";
    button.addEventListener("click", function () {
      mode = mode === "en" ? "hi" : "en";
      localStorage.setItem(KEY, mode);
      render();
    });
    document.body.appendChild(button);
    render();
  }
  document.addEventListener("DOMContentLoaded", init);
})();