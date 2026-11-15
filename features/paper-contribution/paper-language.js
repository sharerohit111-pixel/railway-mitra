(() => {
  const translations = {
    hi: {
      home:"⌂ Home", kicker:"आपका योगदान हज़ारों अभ्यर्थियों की मदद कर सकता है",
      heroTitle:"आपके पास कोई Previous Paper है?", heroText:"किसी भी Competitive Exam का Previous Year Question Paper हमारे साथ साझा करें। खासकर Railway Departmental Exams के LDCE और GDCE papers की हमें बहुत आवश्यकता है।",
      heroNote:"आपका एक पेपर किसी दूसरे कर्मचारी की तैयारी में बड़ा योगदान दे सकता है। कृपया इस अनुरोध को नज़रअंदाज़ न करें।",
      signInTitle:"पहले Railway Mitra में Sign in करें",signInText:"पेपर को आपके account से सुरक्षित रूप से जोड़ने के लिए sign in आवश्यक है।",signInButton:"Sign in करें",
      uploadTitle:"Previous Paper Upload करें",uploadSubtitle:"जानकारी भरें और PDF फ़ाइल चुनें।",categoryLabel:"Exam Category",ldce:"Railway LDCE",gdce:"Railway GDCE",otherExam:"Other Competitive Exam",
      examNameLabel:"Exam का नाम / Post (Optional)",heldOnLabel:"यह परीक्षा कब आयोजित हुई थी? (Optional)",pdfLabel:"Question Paper की PDF",choosePdf:"PDF चुनें / Upload PDF",pdfHint:"केवल PDF · अधिकतम 5 MB",
      privacyTitle:"आपकी व्यक्तिगत जानकारी गोपनीय रखी जाएगी",privacyText:"आपका पेपर private storage में रखा जाएगा। इसे केवल अधिकृत Railway Mitra admin देख सकेगा। हम access controls और सुरक्षित data handling का उपयोग करते हैं। इंटरनेट पर कोई भी सेवा 100% सुरक्षा की गारंटी नहीं दे सकती। कृपया PDF में Aadhaar, बैंक विवरण या अन्य अनावश्यक संवेदनशील जानकारी हो तो उसे छिपाकर अपलोड करें।",
      consent:"मैं पुष्टि करता/करती हूँ कि मुझे यह पेपर साझा करने की अनुमति है और इसमें अनावश्यक निजी जानकारी नहीं है।",submit:"पेपर साझा करें",emailShare:"ईमेल से PDF भेजें",emailHelp:"The PDF and message will be shared to Gmail. On share-supported phones, enter the recipient in the To field; otherwise an email draft opens and you must attach the PDF.",
      historyTitle:"मेरे साझा किए गए पेपर",historySubtitle:"आपके द्वारा भेजे गए पेपर की स्थिति।",refresh:"Refresh",loading:"लोड हो रहा है…",footer:"Railway Mitra · Your Railway Digital Companion"
    },
    en: {
      home:"⌂ Home",kicker:"YOUR CONTRIBUTION CAN HELP THOUSANDS",
      heroTitle:"Do you have a previous exam paper?",heroText:"Share previous-year question papers from any competitive exam. We especially need Railway Departmental LDCE and GDCE papers.",
      heroNote:"Your paper could make a real difference to another employee's preparation. Please don't ignore this request.",
      signInTitle:"Sign in to Railway Mitra first",signInText:"Please sign in so your contribution can be securely associated with your account.",signInButton:"Sign in",
      uploadTitle:"Upload a Previous Paper",uploadSubtitle:"Add the details and choose a PDF file.",categoryLabel:"Exam Category",ldce:"Railway LDCE",gdce:"Railway GDCE",otherExam:"Other Competitive Exam",
      examNameLabel:"Exam name / Post (Optional)",heldOnLabel:"When was the exam held? (Optional)",pdfLabel:"Question Paper PDF",choosePdf:"Choose PDF / Upload PDF",pdfHint:"PDF only · Maximum 5 MB",
      privacyTitle:"Your personal information will be kept private",privacyText:"Your paper will be stored in private storage and can only be viewed by an authorised Railway Mitra admin. We use access controls and secure data handling. No internet service can guarantee 100% security. Please hide Aadhaar, bank details or other unnecessary sensitive information before uploading.",
      consent:"I confirm that I am allowed to share this paper and that it contains no unnecessary personal information.",submit:"Submit Paper",emailShare:"Send PDF by Email",emailHelp:"The share menu will open. Choose Gmail and send the PDF; on some phones you may need to attach the PDF manually.",
      historyTitle:"My Shared Papers",historySubtitle:"Status of papers you have submitted.",refresh:"Refresh",loading:"Loading…",footer:"Railway Mitra · Your Railway Digital Companion"
    }
  };
  const key="rm-paper-language";
  function apply(){
    const lang=localStorage.getItem(key)==="en"?"en":"hi";
    document.documentElement.lang=lang;
    document.querySelectorAll("[data-i18n]").forEach(node=>{
      const value=translations[lang][node.dataset.i18n];
      if(value!==undefined) node.textContent=value;
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(node=>{
      const value=translations[lang][node.dataset.i18nAria];
      if(value!==undefined) node.setAttribute("aria-label",value);
    });
    const button=document.getElementById("paperLanguageToggle");
    if(button){button.textContent=lang==="hi"?"English":"हिन्दी";button.setAttribute("aria-label",lang==="hi"?"Switch to English":"हिन्दी में बदलें");}
    const name=document.getElementById("paperName"), date=document.getElementById("paperHeldOn"), file=document.getElementById("paperFileName");
    if(name)name.placeholder=lang==="hi"?"जैसे: GDCE JE Civil / LDCE":"e.g. GDCE JE Civil / LDCE";
    if(date)date.title=lang==="hi"?"वैकल्पिक":"Optional";
    if(file&&!document.getElementById("paperPdf")?.files?.length)file.textContent=translations[lang].pdfHint;
  }
  window.togglePaperLanguage = function(){
    const next=localStorage.getItem(key)==="en"?"hi":"en";
    localStorage.setItem(key,next);
    apply();
  };
  const button=document.getElementById("paperLanguageToggle");
  if(button) button.addEventListener("click",window.togglePaperLanguage);
  apply();
})();
