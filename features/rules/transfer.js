(function(){
"use strict";
const DATA={
en:{
mutual:{title:"Mutual Transfer Rules",items:[
"No Minimum Service Requirement: No minimum service period is stated as necessary to apply for mutual transfer; employees may apply even during probation.",
"Identical Grade Pay & Pay Level: Both employees must have the same designation, cadre and Pay Matrix Level. The PDF notes that a senior employee may opt for a lower post through willing reversion.",
"Seniority Protection Policy: The senior employee takes the junior employee's seniority in the new division. The lower of the two seniority positions becomes the common baseline.",
"Community Category Constraints: Transfers are generally within the same community category (General/OBC with General/OBC, SC with SC, ST with ST). The PDF mentions relaxation only where both candidates are direct open-market recruits.",
"No Backtracking Policy: Once the NOC is approved by both competent divisional authorities and the final transfer order is issued, the application cannot be withdrawn.",
"Relieving Timeline: After execution of the NOC, the administration is stated to relieve the employee immediately without waiting for a replacement or physical reliever."
]},
own:{title:"Own Request Transfer Rules",items:[
"Minimum Service Lock-in: For Inter-Railway transfer between zones, a minimum of 10 years of regular service. Inter-Divisional transfers within the same zone are governed by specific Zonal instructions.",
"Loss of Seniority (Bottom Seniority): The employee forfeits past seniority and is placed at the bottom of the seniority list in the relevant cadre at the new unit.",
"Priority Rule for Veterans (RBE 61/2026): that non-gazetted employees with more than 20 years of regular service receive the highest priority for Own Request Transfers.",
"Automated HRMS Processing: that HRMS monthly auto-generates priority lists for employees with 20+ years of service, orders are processed without a separate Accepting Unit NOC, and physical sparing is required within 15 days of order issuance."
]},
spouse:{title:"Spouse Ground Transfer Rules",items:[
"Exemption from Minimum Service: that employees seeking transfer to their spouse's place of posting are exempt from the 5- or 10-year minimum service conditions.",
"Eligibility Criteria: The spouse must be a regular employee of Indian Railways, a Central Government ministry/department or Central Public Sector Undertaking (PSU), or a State Government department on a regular establishment.",
"High Operational Priority: Spouse-ground applications are placed in a higher priority bracket than standard Own Request cases, .",
"Seniority Allocation: that this is a voluntary request and the employee receives bottom seniority in the new cadre/division."
]},
admin:{title:"Administrative Transfer Rules",items:[
"Full Seniority Protection: For transfers initiated by railway administration in public interest or due to operational urgency, that original seniority remains protected.",
"Periodical Transfer Schedule: that staff in sensitive posts or direct public-dealing roles (such as Ticket Checking Staff, Booking Clerks and Store Keepers) must be transferred every 4 years.",
"Vigilance & Disciplinary Actions: administration may initiate Inter-Divisional or Inter-Railway transfer where a serious complaint or active vigilance case exists, to support an unbiased investigation.",
"Surplus Staff Adjustments: If posts are abolished or reduced due to technology or administrative changes, the junior-most employee in the cadre is stated to be transferred to another station with vacancies.",
"Entitlement to Allowances: The PDF lists Transfer Passes, Composite Transfer Grant (CTG) and official Joining Time for employees transferred on administrative grounds."
]},
special:{title:"Special & Compassionate Ground Transfers",items:[
"Persons with Disabilities (PwD) Protection: that railway employees with disabilities are generally posted near their home district or preferred location, with relaxed service rules.",
"Care-givers to a Disabled Child: Parents of a mentally or physically challenged child receive special consideration for transfer to a chosen station for medical and therapeutic access, bypassing minimum-tenure constraints, .",
"Compassionate Appointees (Widows): that female employees appointed on compassionate grounds after the death of their spouse may seek early transfer to desired locations for childcare and family support."
]}
},
hi:{
mutual:{title:"आपसी स्थानांतरण के नियम",items:[
"न्यूनतम सेवा अवधि की शर्त नहीं: आपसी स्थानांतरण के लिए न्यूनतम सेवा अवधि आवश्यक नहीं बताई गई है; परिवीक्षा अवधि में भी आवेदन किया जा सकता है।",
"समान पद एवं वेतन स्तर: दोनों कर्मचारियों का पदनाम, संवर्ग और Pay Matrix Level समान होना चाहिए। यह भी कहा गया है कि वरिष्ठ कर्मचारी स्वेच्छा से निम्न पद स्वीकार करके (Willing Reversion) स्थानांतरण करा सकता है।",
"वरिष्ठता संरक्षण: वरिष्ठ कर्मचारी को नए मंडल में कनिष्ठ कर्मचारी की वरिष्ठता मिलेगी। दोनों के लिए कम वरिष्ठता वाला स्थान समान आधार बनेगा।",
"समुदाय श्रेणी की शर्त: सामान्यतः समान समुदाय श्रेणी में स्थानांतरण होगा (General/OBC के साथ General/OBC, SC के साथ SC और ST के साथ ST)। छूट तभी है जब दोनों उम्मीदवार सीधी खुली भर्ती से नियुक्त हों।",
"आवेदन वापस न लेना: दोनों सक्षम मंडलीय अधिकारियों द्वारा NOC स्वीकृत होने और अंतिम स्थानांतरण आदेश जारी होने के बाद आवेदन वापस नहीं लिया जा सकता।",
"कार्य-मुक्ति की समय-सीमा: NOC निष्पादित होने के बाद प्रशासन को प्रतिस्थानी या दूसरे कर्मचारी की प्रतीक्षा किए बिना कर्मचारी को तुरंत कार्य-मुक्त करना होगा — ऐसा दिया है।"
]},
own:{title:"स्वयं के अनुरोध पर स्थानांतरण",items:[
"न्यूनतम सेवा अवधि: एक जोन से दूसरे जोन में Inter-Railway स्थानांतरण के लिए 10 वर्ष की नियमित सेवा अनिवार्य बताई गई है। उसी जोन के भीतर Inter-Divisional स्थानांतरण संबंधित जोनल निर्देशों के अधीन है।",
"वरिष्ठता का नुकसान (Bottom Seniority): कर्मचारी अपनी पिछली वरिष्ठता छोड़ देगा और नए यूनिट के संबंधित संवर्ग की वरिष्ठता सूची में सबसे नीचे रखा जाएगा।",
"अनुभवी कर्मचारियों को प्राथमिकता (RBE 61/2026): 20 वर्ष से अधिक नियमित सेवा वाले अराजपत्रित कर्मचारियों को स्वयं के अनुरोध पर स्थानांतरण में सर्वोच्च प्राथमिकता दी जाती है।",
"HRMS द्वारा प्रक्रिया: 20+ वर्ष सेवा वाले कर्मचारियों की प्राथमिकता सूची HRMS पर हर महीने स्वतः बनती है; अलग Accepting Unit NOC के बिना आदेश प्रक्रिया में आते हैं और आदेश जारी होने के 15 दिनों के भीतर कार्य-मुक्ति होनी चाहिए।"
]},
spouse:{title:"पति/पत्नी के आधार पर स्थानांतरण",items:[
"न्यूनतम सेवा अवधि से छूट: पति/पत्नी के कार्यस्थल पर स्थानांतरण मांगने वाले कर्मचारी को 5 या 10 वर्ष की न्यूनतम सेवा शर्त से छूट है।",
"पात्रता: पति या पत्नी भारतीय रेल, केंद्र सरकार के मंत्रालय/विभाग, केंद्रीय सार्वजनिक क्षेत्र उपक्रम (PSU), अथवा नियमित स्थापना वाले राज्य सरकार के विभाग में नियमित कर्मचारी होने चाहिए।",
"उच्च प्राथमिकता: पति/पत्नी के आधार पर आए आवेदन सामान्य स्वयं-अनुरोध स्थानांतरण मामलों से उच्च प्राथमिकता में रखे जाते हैं।",
"वरिष्ठता निर्धारण: यह स्वैच्छिक अनुरोध है, इसलिए नए संवर्ग/मंडल में कर्मचारी को Bottom Seniority मिलेगी।"
]},
admin:{title:"प्रशासनिक स्थानांतरण के नियम",items:[
"पूर्ण वरिष्ठता संरक्षण: जनहित या परिचालन आवश्यकता के कारण प्रशासन द्वारा किए गए स्थानांतरण में मूल वरिष्ठता सुरक्षित रहती है।",
"नियतकालिक स्थानांतरण: संवेदनशील पदों या जनता से सीधे संपर्क वाले पदों (जैसे Ticket Checking Staff, Booking Clerks, Store Keepers) पर कार्यरत कर्मचारियों का हर 4 वर्ष में स्थानांतरण अनिवार्य बताया गया है।",
"सतर्कता एवं अनुशासनात्मक कार्रवाई: गंभीर शिकायत या सक्रिय सतर्कता मामले में निष्पक्ष जाँच सुनिश्चित करने के लिए प्रशासन Inter-Divisional या Inter-Railway स्थानांतरण शुरू कर सकता है — ऐसा है।",
"अधिशेष कर्मचारियों का समायोजन: तकनीक या प्रशासनिक बदलाव से पद समाप्त/कम होने पर संबंधित संवर्ग के सबसे कनिष्ठ कर्मचारी को रिक्ति वाले दूसरे स्टेशन पर भेजा जाएगा।",
"भत्तों की पात्रता: प्रशासनिक आधार पर स्थानांतरित कर्मचारियों के लिए Transfer Passes, Composite Transfer Grant (CTG) और आधिकारिक Joining Time का उल्लेख है।"
]},
special:{title:"विशेष एवं अनुकंपा आधार पर स्थानांतरण",items:[
"दिव्यांग कर्मचारियों की सुरक्षा: दिव्यांग रेलवे कर्मचारियों को सामान्यतः उनके गृह जिले या पसंदीदा स्थान के पास तैनाती दी जाती है तथा सेवा नियमों में छूट दी जाती है।",
"दिव्यांग बच्चे के देखभालकर्ता: मानसिक या शारीरिक रूप से दिव्यांग बच्चे के माता-पिता को चिकित्सा एवं उपचार की सुविधा के लिए पसंदीदा स्टेशन पर स्थानांतरण में विशेष विचार दिया जाता है; न्यूनतम कार्यकाल की शर्त लागू नहीं होती।",
"अनुकंपा नियुक्त विधवा कर्मचारी: पति की मृत्यु के बाद अनुकंपा आधार पर नियुक्त महिला कर्मचारी बच्चों की देखभाल और पारिवारिक सहायता के लिए इच्छित स्थान पर शीघ्र स्थानांतरण मांग सकती हैं।"
]}
}
};
const page=document.querySelector("[data-transfer-language]");
if(!page)return;
const d=DATA[page.dataset.transferLanguage]?.[page.dataset.transferTopic];
if(!d)return;
document.title=d.title+" | Railway Mitra";
document.querySelector("#transferTitle").textContent=d.title;
const list=document.querySelector("#transferList");
d.items.forEach(item=>{const li=document.createElement("li");li.textContent=item;list.appendChild(li);});
})();