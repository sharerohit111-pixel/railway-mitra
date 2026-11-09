(function(){
"use strict";
const DATA={
en:{
booking:{title:"Ticket Booking Rules",intro:"Booking-related rules listed in the supplied PDF.",items:[
"Online booking: IRCTC website or mobile app bookings are available from 00:20 AM to 23:45 PM daily.",
"Tatkal booking for AC classes (3AC, 2AC, 1AC, CC) opens daily at 10:00 AM.",
"Tatkal booking for non-AC classes (Sleeper, 2S) opens daily at 11:00 AM.",
"VIKALP is an optional facility for waitlisted passengers. If a confirmed seat is not available in the originally booked train, an alternative train on the same route may be allotted, subject to availability, without extra charges."
]},
cancellation:{title:"Ticket Cancellation Rules",intro:"Cancellation conditions stated in the supplied PDF.",items:[
"Confirmed ticket cancelled more than 48 hours before departure: flat charge per passenger — AC First / Executive ₹240; AC 2 Tier / First Class ₹200; AC 3 Tier / AC Chair Car / AC 3 Economy ₹180; Sleeper ₹120; Second Class (General Reserved) ₹60.",
"Cancellation between 48 and 12 hours before departure: cancellation charge is 25% of the total fare.",
"Cancellation between 12 hours and chart preparation (stated as 4 hours before departure in the PDF): cancellation charge is 50% of the total fare.",
"After chart preparation, the PDF states that no refund is permissible on confirmed tickets; an online TDR may be filed within prescribed time limits for specific eligible conditions.",
"RAC / waitlisted ticket still in that status after chart preparation: it may be cancelled for refund up to 30 minutes before scheduled departure, with clerkage ₹60 per passenger (+ GST for AC classes).",
"Fully waitlisted online e-tickets are stated to be auto-cancelled after chart preparation; refund goes to the original bank account. Such passengers must not board reserved coaches."
]},
refund:{title:"Ticket Refund Rules",intro:"Refund provisions mentioned in the supplied PDF.",items:[
"RAC / waitlisted tickets remaining in that status after chart preparation: cancellation up to 30 minutes before scheduled departure; clerkage ₹60 per passenger (+ GST for AC classes), with balance refunded.",
"Counter tickets remaining waitlisted: the PDF states that refund can be claimed at the station counter up to 3 hours after actual train departure.",
"Fully waitlisted online e-tickets are automatically cancelled after chart preparation and the refund is credited to the original bank account.",
"Confirmed Tatkal tickets: the PDF states that no refund is granted on cancellation. It lists exceptional circumstances such as train delayed by more than 3 hours, route diversion, or booked coach not attached."
]}
},
hi:{
booking:{title:"टिकट बुकिंग के नियम",intro:"आपके द्वारा दी गई PDF में दिए गए बुकिंग संबंधी नियम।",items:[
"ऑनलाइन बुकिंग: IRCTC वेबसाइट या मोबाइल ऐप से प्रतिदिन 00:20 बजे से 23:45 बजे तक टिकट बुक किए जा सकते हैं।",
"AC श्रेणी (3AC, 2AC, 1AC, CC) में तत्काल बुकिंग प्रतिदिन सुबह 10:00 बजे खुलती है।",
"Non-AC श्रेणी (Sleeper, 2S) में तत्काल बुकिंग प्रतिदिन सुबह 11:00 बजे खुलती है।",
"विकल्प (VIKALP) प्रतीक्षा सूची वाले यात्रियों के लिए वैकल्पिक सुविधा है। मूल ट्रेन में कन्फर्म सीट उपलब्ध न होने पर उपलब्धता के अनुसार उसी मार्ग की दूसरी ट्रेन में बिना अतिरिक्त शुल्क सीट दी जा सकती है।"
]},
cancellation:{title:"टिकट रद्द करने के नियम",intro:"आपकी PDF में दिए गए कन्फर्म, RAC और प्रतीक्षा सूची टिकट रद्द करने के नियम।",items:[
"प्रस्थान से 48 घंटे से अधिक पहले कन्फर्म टिकट रद्द करने पर प्रति यात्री निश्चित शुल्क: AC प्रथम / Executive ₹240; AC 2 Tier / First Class ₹200; AC 3 Tier / AC Chair Car / AC 3 Economy ₹180; Sleeper ₹120; Second Class (General Reserved) ₹60।",
"प्रस्थान से 48 से 12 घंटे के बीच टिकट रद्द करने पर कुल किराये का 25% शुल्क।",
"प्रस्थान से 12 घंटे के भीतर और चार्ट बनने तक (PDF में प्रस्थान से 4 घंटे पहले बताया गया है) टिकट रद्द करने पर कुल किराये का 50% शुल्क।",
"चार्ट बनने के बाद कन्फर्म टिकट पर PDF के अनुसार रिफंड नहीं मिलता। कुछ निर्धारित परिस्थितियों में तय समय-सीमा के भीतर ऑनलाइन TDR दाखिल किया जा सकता है।",
"चार्ट बनने के बाद भी RAC / प्रतीक्षा सूची में रहने वाला टिकट निर्धारित प्रस्थान समय से 30 मिनट पहले तक रद्द कराकर रिफंड लिया जा सकता है। ₹60 प्रति यात्री क्लर्केज (+ AC श्रेणी में GST) कटता है।",
"ऑनलाइन बुक पूरी तरह प्रतीक्षा सूची वाला e-ticket चार्ट बनने के बाद स्वतः रद्द होता है और राशि मूल बैंक खाते में लौटाई जाती है। ऐसे यात्री आरक्षित कोच में यात्रा नहीं कर सकते।"
]},
refund:{title:"टिकट रिफंड के नियम",intro:"आपकी PDF में बताए गए रिफंड संबंधी प्रावधान।",items:[
"चार्ट बनने के बाद भी RAC / प्रतीक्षा सूची में रहने वाला टिकट निर्धारित प्रस्थान समय से 30 मिनट पहले तक रद्द कराया जा सकता है। ₹60 प्रति यात्री क्लर्केज (+ AC श्रेणी में GST) कटकर शेष राशि लौटाई जाती है।",
"काउंटर से लिया गया प्रतीक्षा सूची वाला टिकट: PDF के अनुसार ट्रेन के वास्तविक प्रस्थान के 3 घंटे बाद तक स्टेशन काउंटर पर रिफंड का दावा किया जा सकता है।",
"ऑनलाइन पूरी तरह प्रतीक्षा सूची वाला e-ticket चार्ट बनने के बाद स्वतः रद्द होता है और रिफंड मूल बैंक खाते में भेजा जाता है।",
"कन्फर्म तत्काल टिकट रद्द करने पर PDF के अनुसार रिफंड नहीं मिलता। अपवाद के रूप में ट्रेन 3 घंटे से अधिक लेट होना, मार्ग बदलना या बुक किया गया कोच न लगना बताया गया है।"
]}
}
};
const page=document.querySelector("[data-rules-language]");
if(!page)return;
const d=DATA[page.dataset.rulesLanguage]?.[page.dataset.rulesTopic];
if(!d)return;
document.title=d.title+" | Railway Mitra";
document.querySelector("#rulesTopicTitle").textContent=d.title;
document.querySelector("#rulesTopicIntro").textContent=d.intro;
const list=document.querySelector("#rulesTopicList");
d.items.forEach(item=>{const li=document.createElement("li");li.textContent=item;list.appendChild(li);});
})();