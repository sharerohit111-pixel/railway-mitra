const irpwmData = [
  {
    id: 'patrolling',
    folder_hi: '📁 1. पेट्रोलिंग नियम (Patrolling Rules)',
    folder_en: '📁 1. Patrolling Rules (Monsoon/Winter/Hot)',
    desc_hi: 'मानसून, विंटर, हॉट वेदर, ब्रिज और सुरक्षा पेट्रोलिंग के नियम',
    desc_en: 'Monsoon, Winter, Hot Weather, Bridge & Security patrolling rules',
    items: [
      {
        badge: 'IRPWM Para 1001-1005',
        title_hi: 'मानसून पेट्रोलिंग (Monsoon Patrolling) नियम व उपकरण',
        title_en: 'Monsoon Patrolling Rules & Mandatory Equipment',
        text_hi: '• पेट्रोलमैन की सामान्य चाल 3 किमी/घंटा मानी जाती है।\n• एक बीट (Beat) की लंबाई सामान्यतः 5 किमी से अधिक नहीं होनी चाहिए (अधिकतम 10 किमी पैदल दूरी प्रतिदिन)।\n• अनिवार्य उपकरण: 2 ट्राई-कलर हैंड सिग्नल लैंप, 10 डेटोनेटर, 2 लाल व 1 हरी झंडी, स्पैनर, नंबर प्लेट और पेट्रोल बुक।\n• यदि अगला पेट्रोलमैन निर्धारित समय पर न मिले, तो पेट्रोलमैन को आगे बढ़ना जारी रखना चाहिए।',
        text_en: '• Normal walking speed of a Patrolman is 3 km/h.\n• Beat length should generally not exceed 5 km (max 10 km walking per day).\n• Equipment: 2 tri-color hand signal lamps, 10 detonators, 2 red & 1 green flag, spanner, number plate, and patrol book.\n• If the next patrolman does not turn up, continue walking forward.',
        keywords: 'patrolling monsoon beat speed equipment lamp detonator पेट्रोलिंग मानसून बीट चाल'
      },
      {
        badge: 'IRPWM Para 1006 / LWR Manual',
        title_hi: 'विंटर (सर्दियों) एवं हॉट वेदर (गर्मियों) पेट्रोलिंग',
        title_en: 'Winter & Hot Weather Patrolling Guidelines',
        text_hi: '• कोल्ड वेदर (Winter) पेट्रोलिंग: जब रेल तापमान TD - 30°C से नीचे गिर जाए (विशेषकर रात 22:00 से सुबह 06:00 बजे तक रेल फ्रैक्चर जांचने हेतु)।\n• हॉट वेदर (Hot Weather) पेट्रोलिंग: जब रेल तापमान TD + 20°C (LWR में) से ऊपर जाए, तो बकलिंग जांचने के लिए दिन में पेट्रोलिंग शुरू होती है।\n• बकलिंग या फ्रैक्चर दिखने पर तुरंत ट्रैक प्रोटेक्शन करें।',
        text_en: '• Cold Weather Patrolling: Started when rail temp falls below TD - 30°C (usually 22:00 to 06:00 hrs) to detect rail fractures.\n• Hot Weather Patrolling: Started when rail temp exceeds TD + 20°C in LWR to detect track buckling.\n• Protect track immediately if fracture or buckling is spotted.',
        keywords: 'winter cold hot weather patrolling fracture buckling td तापमान सर्दी गर्मी बकलिंग फ्रैक्चर'
      }
    ]
  },
  {
    id: 'welding',
    folder_hi: '📁 2. रेल वेल्डिंग (AT Welding & USFD)',
    folder_en: '📁 2. Rail Welding (AT Welding & USFD)',
    desc_hi: 'थर्मिट वेल्डिंग, गैप, प्री-हीटिंग, ट्रिमिंग और USFD जांच',
    desc_en: 'Alumino-Thermic (AT) welding, gap, pre-heating, trimming & USFD',
    items: [
      {
        badge: 'IRPWM Chapter 4 & AT Manual',
        title_hi: 'AT वेल्डिंग के मुख्य मानक (25mm / 50mm / 75mm Gap)',
        title_en: 'Alumino-Thermic (AT) Welding Standards & Gaps',
        text_hi: '• सामान्य गैप (Standard Gap): 25 mm (± 1 mm) होता है।\n• वाइड गैप वेल्डिंग (Wide Gap): 50 mm या 75 mm (केवल विशेष स्वीकृति से)।\n• वेल्डिंग के समय दो जोड़ों के बीच की न्यूनतम दूरी (Minimum Rail Closure) कम से कम 4 मीटर (विशेष परिस्थिति में 2.5m) होनी चाहिए।\n• वेल्डिंग के दौरान कम से कम 5-5 स्लीपर दोनों तरफ से खोले (Unfasten) जाने चाहिए।',
        text_en: '• Standard Welding Gap: 25 mm (± 1 mm).\n• Wide Gap Welding: 50 mm or 75 mm.\n• Minimum length of rail closure piece should be at least 4m (2.5m in exceptional cases).\n• Unfasten at least 5 sleepers on either side before welding.',
        keywords: 'welding at welding gap 25mm 50mm 75mm closure वेल्डिंग गैप थर्मिट'
      },
      {
        badge: 'AT Welding Safety',
        title_hi: 'प्री-हीटिंग, टैपिंग और पहली ट्रेन पास करने का समय',
        title_en: 'Pre-heating, Tapping Time & First Train Passage',
        text_hi: '• कंप्रेस्ड एयर पेट्रोल (Air-Petrol) प्री-हीटिंग समय: लगभग 4 से 4.5 मिनट (60 kg रेल के लिए)।\n• मोल्ड के अंदर धातु (Metal) डालने के बाद कम से कम 4 से 6 मिनट तक मोल्ड न हटाएं।\n• मोल्ड हटाने और ट्रिमिंग के बाद, वेल्ड को ठंडा होने के लिए कम से कम 20 मिनट (कुल ~30 मिनट) का ट्रैफिक ब्लॉक आवश्यक है, तभी पहली ट्रेन 20-30 kmph के कॉशन पर पास होगी।\n• वेल्डिंग के तुरंत बाद जॉगल्ड फिश प्लेट (Joggled Fish Plate) लगाना अनिवार्य है।',
        text_en: '• Compressed Air-Petrol pre-heating time: ~4 to 4.5 mins (for 60 kg rail).\n• Wait 4-6 mins after tapping before removing mould.\n• Minimum 30 mins total curing time after pouring before allowing first train at speed restriction (20-30 kmph).\n• Clamp Joggled Fish Plate immediately after welding.',
        keywords: 'welding preheating tapping block joggled fish plate वेल्डिंग ब्लॉक फिश प्लेट'
      },
      {
        badge: 'USFD Testing',
        title_hi: 'USFD (अल्ट्रासोनिक टेस्टिंग) और डिफेक्ट मार्किंग (IMR / DFW)',
        title_en: 'USFD Testing & Defect Classification (IMR / DFW)',
        text_hi: '• IMR / IMRW (Immediate Removal): रेल या वेल्ड में गंभीर खराबी मिलने पर लाल रंग से 3 क्रॉस (XXX) लगाए जाते हैं। इसे 3 दिन के अंदर बदलना अनिवार्य है और तब तक 30 kmph का कॉशन व जॉगल्ड फिश प्लेट लगी रहेगी।\n• OBS / OBSW (Observation): पीले रंग से 1 या 2 क्रॉस (X / XX) लगाए जाते हैं, जिस पर नियमित निगरानी रखी जाती है।',
        text_en: '• IMR / IMRW (Immediate Removal): Marked with 3 Red Crosses (XXX). Must be replaced within 3 days; impose 30 kmph caution and clamp joggled fish plate immediately.\n• OBS / OBSW (Observation): Marked with Yellow Cross (X/XX) for periodic monitoring.',
        keywords: 'usfd welding defect imr imrw obs red cross वेल्डिंग डिफेक्ट जांच'
      }
    ]
  },
  {
    id: 'protection',
    folder_hi: '📁 3. ट्रैक प्रोटेक्शन व सुरक्षा (Safety & Signals)',
    folder_en: '📁 3. Track Protection & Emergency Safety',
    desc_hi: 'डेटोनेटर, बैनर फ्लैग, ट्रॉली प्रोटेक्शन और कॉशन ऑर्डर',
    desc_en: 'Detonator, Banner flag, Trolley protection & Caution orders',
    items: [
      {
        badge: 'IRPWM Para 806 (BG)',
        title_hi: 'ब्रॉड गेज (BG) पर ट्रैक प्रोटेक्शन दूरी (30m / 600m / 1200m)',
        title_en: 'Track Protection Distance on Broad Gauge (BG)',
        text_hi: '• बाधा (Obstruction) से 30 मीटर की दूरी पर पहला लाल झंडा/बत्ती लगाएं।\n• 600 मीटर की दूरी पर बैनर फ्लैग (Banner Flag) लगाएं।\n• 1200 मीटर की दूरी पर 3 डेटोनेटर (10-10 मीटर के अंतर पर) लगाएं।\n• एक डेटोनेटर को हाथ में लेकर 45 मीटर आगे खड़े होकर आने वाली ट्रेन को लाल झंडी दिखाएं।',
        text_en: '• Place first red flag/light at 30m from obstruction.\n• Place banner flag at 600m.\n• Place 3 detonators (10m apart) at 1200m from the obstruction.\n• Stand 45m ahead with a red flag/lamp to warn approaching trains.',
        keywords: 'protection detonator banner flag 600 1200 safety डेटोनेटर बैनर फ्लैग सुरक्षा',
        tool: true
      },
      {
        badge: 'IRPWM Para 803',
        title_hi: 'इंजीनियरिंग इंडिकेटर बोर्ड (Caution, Speed, Stop & T/P)',
        title_en: 'Engineering Indicator Boards (Caution, Speed, Stop & T/P)',
        text_hi: '• कॉशन इंडिकेटर (Caution Indicator): कार्यस्थल से 1200 मीटर पहले (BG पर) लगाया जाता है।\n• स्पीड इंडिकेटर (Speed Indicator): कार्यस्थल से 30 मीटर पहले लगाया जाता है।\n• स्टॉप इंडिकेटर (Stop Indicator): जहां ट्रेन रोकनी हो, उससे 30 मीटर पहले लगाया जाता है।\n• टर्मिनेशन इंडिकेटर (T/P या T/G): कार्यस्थल खत्म होने के बाद ट्रेन की लंबाई (Passenger/Goods) के बराबर दूरी पर लगाया जाता है।',
        text_en: '• Caution Indicator: Placed at 1200m (on BG) before the work spot.\n• Speed Indicator: Placed at 30m before the work spot.\n• Stop Indicator: Placed at 30m before the stopping point.\n• Termination Indicator (T/P or T/G): Placed after the work zone at a distance equal to train length.',
        keywords: 'indicator board caution speed stop termination tp tg इंडिकेटर बोर्ड कॉशन'
      }
    ]
  },
  {
    id: 'lwr',
    folder_hi: '📁 4. LWR / CWR और रेल फ्रैक्चर नियम',
    folder_en: '📁 4. LWR / CWR & Rail Fracture Rules',
    desc_hi: 'डिस्ट्रेसिंग तापमान (TD), SEJ गैप और रेल फ्रैक्चर कार्यवाही',
    desc_en: 'Destressing temp (TD), SEJ gap & Rail fracture emergency action',
    items: [
      {
        badge: 'LWR Manual',
        title_hi: 'LWR तापमान रेंज और डिस्ट्रेसिंग तापमान (TD)',
        title_en: 'LWR Temperature Zones & Destressing Temp (TD)',
        text_hi: '• भारत को 4 रेल तापमान जोन (Zone I से IV) में बांटा गया है।\n• डिस्ट्रेसिंग तापमान (TD): Zone I, II, III में सामान्यतः tm से tm + 5°C और Zone IV में tm - 5°C से tm तक रखा जाता है।\n• नियमित ट्रैक मेंटेनेंस (जैसे पैकिंग, लिफ्टिंग) केवल TD + 10°C से TD - 30°C के बीच ही किया जाना चाहिए।',
        text_en: '• India is divided into 4 rail temperature zones (Zone I to IV).\n• Destressing Temp (TD): Generally tm to tm+5°C in Zones I-III, and tm-5°C to tm in Zone IV.\n• Regular track maintenance should only be done when rail temp is between TD + 10°C and TD - 30°C.',
        keywords: 'lwr cwr destressing temperature td zone maintenance डिस्ट्रेसिंग तापमान'
      },
      {
        badge: 'Emergency Action',
        title_hi: 'रेल फ्रैक्चर (Rail Fracture) होने पर तुरंत कार्रवाई',
        title_en: 'Immediate Action on Detecting Rail Fracture',
        text_hi: '• फ्रैक्चर दिखते ही सबसे पहले ट्रैक को प्रोटेक्ट करें (लाल झंडी/डेटोनेटर)।\n• यदि गैप 30 mm से कम है: जॉगल्ड फिश प्लेट और क्लैंप लगाकर पहली ट्रेन को Stop Dead & 10 kmph पर पास कराएं, उसके बाद 20 kmph का कॉशन दें।\n• यदि गैप 30 mm से अधिक है या रेल का टुकड़ा टूटकर अलग हो गया है: बिना स्थायी मरम्मत (रेल क्लोजर) के कोई ट्रेन पास न करें।',
        text_en: '• Protect the track immediately upon spotting a fracture.\n• If gap < 30 mm: Clamp joggled fish plate, pass first train after Stop Dead at 10 kmph, then 20 kmph.\n• If gap > 30 mm or multiple fracture: Do NOT pass any train until a rail closure is inserted.',
        keywords: 'rail fracture gap 30mm joggled clamp emergency रेल फ्रैक्चर'
      }
    ]
  },
  {
    id: 'parameters',
    folder_hi: '📁 5. ट्रैक पैरामीटर्स, गेज और कर्व',
    folder_en: '📁 5. Track Parameters, Gauge & Curves',
    desc_hi: 'गेज टॉलरेंस, स्लीपर स्पेसिंग, कर्व डिग्री और वर्साइन',
    desc_en: 'Gauge tolerances, sleeper spacing, curve degree & versine',
    items: [
      {
        badge: 'IRPWM Chapter 3',
        title_hi: 'ब्रॉड गेज (BG - 1676 mm) मानक और स्वीकार्य टॉलरेंस',
        title_en: 'Broad Gauge (BG - 1676 mm) Standards & Tolerances',
        text_hi: '• सीधी लाइन (Straight Track) पर: -6 mm (Tight) से +6 mm (Slack) तक।\n• कर्व (Radius ≥ 350m) पर: -6 mm से +15 mm तक।\n• तेज कर्व (Radius < 350m) पर: +20 mm तक ढील दी जा सकती है।\n• गेज नापने का स्थान: रेल टॉप (Rail Table) से 13 mm नीचे (60kg/52kg रेल में 14mm)।',
        text_en: '• Straight track tolerance: -6 mm (Tight) to +6 mm (Slack).\n• Curves (Radius ≥ 350m): -6 mm to +15 mm.\n• Sharp Curves (Radius < 350m): up to +20 mm.\n• Gauge measurement point: 13 mm (14 mm for 60kg/52kg) below rail table.',
        keywords: 'gauge 1676 parameter curve straight tolerance tight slack गेज कर्व नाप'
      },
      {
        badge: 'Curve & Sleeper',
        title_hi: 'कर्व की डिग्री (Degree) और स्लीपर डेंसिटी (Sleeper Density)',
        title_en: 'Degree of Curve & Sleeper Density Formulas',
        text_hi: '• कर्व की डिग्री (D) = 1750 / Radius (मीटर में)।\n• वर्साइन (Versine V) = C² / 8R (जहाँ C कॉर्ड की लंबाई है, सामान्यतः 20 मीटर कॉर्ड)।\n• मुख्य लाइनों (Group A & B) पर स्लीपर डेंसिटी: 1660 स्लीपर प्रति किमी (60 cm स्पेसिंग) होती है।',
        text_en: '• Degree of Curve (D) = 1750 / Radius (in meters).\n• Versine (V) = C² / 8R (where C is chord length, standard 20m chord).\n• Mainline Sleeper Density (Group A & B): 1660 sleepers/km (60 cm spacing).',
        keywords: 'curve degree radius versine sleeper density 1660 कर्व डिग्री वर्साइन स्लीपर'
      }
    ]
  },
  {
    id: 'turnout',
    folder_hi: '📁 6. पॉइंट्स एंड क्रॉसिंग (Turnouts)',
    folder_en: '📁 6. Points & Crossings (Turnouts)',
    desc_hi: 'स्विच, टंग रेल, चेक रेल क्लीयरेंस और 1 in 12 / 1 in 8.5',
    desc_en: 'Switch, Tongue rail, Check rail clearance & 1 in 12 / 1 in 8.5',
    items: [
      {
        badge: 'IRPWM Chapter 4',
        title_hi: 'टर्नआउट के महत्वपूर्ण क्लियरेंस (Check Rail & Wing Rail)',
        title_en: 'Critical Turnout Clearances (Check Rail & Wing Rail)',
        text_hi: '• चेक रेल क्लीयरेंस (Check Rail Clearance): न्यूनतम 41 mm और अधिकतम 45 mm (BG पर)।\n• विंग रेल क्लीयरेंस (Wing Rail Clearance): न्यूनतम 41 mm और अधिकतम 45 mm।\n• थ्रो ऑफ स्विच (Throw of Switch): सामान्यतः 115 mm होता है।\n• टंग रेल के टो (Toe) पर गेज हमेशा सटीक (1676 mm) होना चाहिए।',
        text_en: '• Check Rail Clearance: Min 41 mm and Max 45 mm (on BG).\n• Wing Rail Clearance: Min 41 mm and Max 45 mm.\n• Throw of Switch: Generally 115 mm.\n• Gauge at Toe of Switch must be exact (1676 mm).',
        keywords: 'turnout points crossing check rail clearance 41 45 switch टर्नआउट चेक रेल स्विच'
      }
    ]
  },
  {
    id: 'trackman_duties',
    folder_hi: '📁 7. ट्रैकमैन ड्यूटी, PPE और भत्ते नियम',
    folder_en: '📁 7. Trackman Duties, PPE & Allowance Rules',
    desc_hi: 'ट्रैक मेंटेनर ग्रेड I-IV के कार्य, सुरक्षा किट और भत्ते',
    desc_en: 'Track Maintainer Grade I-IV duties, safety kit & allowances',
    items: [
      {
        badge: 'IRPWM Chapter 1 & RBE',
        title_hi: 'ट्रैक मेंटेनर (Trackman) के मुख्य कार्य एवं PPE सुरक्षा किट',
        title_en: 'Track Maintainer Duties & Mandatory PPE Kit',
        text_hi: '• मुख्य कार्य: पैकिंग (Packing), फिटिंग्स (ERC, रबर पैड, लाइनर) की जांच और टाइटनिंग, गिट्टी ड्रेसिंग, पेट्रोलिंग, और ट्रैक प्रोटेक्शन।\n• अनिवार्य PPE किट: हाई-विजिबिलिटी रिफ्लेक्टिव जैकेट (Luminous Vest), सेफ्टी शूज, हेलमेट (कार्यस्थल अनुसार), और रात में ट्राई-कलर टॉर्च।',
        text_en: '• Key Duties: Track packing, checking & tightening fittings (ERC, rubber pads, liners), ballast dressing, patrolling, and track protection.\n• Mandatory PPE: High-visibility luminous jacket, safety shoes, helmet, and tri-color torch at night.',
        keywords: 'trackman duty ppe kit helmet jacket erc fittings ट्रैकमैन ड्यूटी सुरक्षा किट'
      },
      {
        badge: 'Allowances & Leave',
        title_hi: 'ट्रैकमैन के विशेष भत्ते (Risk & Hardship, NDA, TA, NH)',
        title_en: 'Trackman Special Allowances (Risk & Hardship, NDA, TA)',
        text_hi: '• रिस्क एंड हार्डशिप अलाउंस (Risk & Hardship Allowance): सभी ट्रैक मेंटेनर्स को उनके पे-लेवल (Level 1 से 5) के अनुसार मासिक जोखिम भत्ता देय है।\n• नाइट ड्यूटी अलाउंस (NDA): रात 22:00 से सुबह 06:00 बजे के बीच पेट्रोलिंग या इमरजेंसी ड्यूटी पर देय।\n• रक्षक (Rakshak) डिवाइस: ट्रेन आने की अग्रिम चेतावनी देने वाला उपकरण साथ रखना।',
        text_en: '• Risk & Hardship Allowance: Monthly allowance payable to all Track Maintainers (Level 1 to 5).\n• Night Duty Allowance (NDA): Payable for duty between 22:00 and 06:00 hrs.\n• Rakshak Device: Carry train warning device during gang work.',
        keywords: 'allowance risk hardship nda ta rakshak भत्ता रिस्क अलाउंस रक्षक'
      }
    ]
  },
  {
    id: 'acs',
    folder_hi: '📁 8. करेक्शन स्लिप्स व PDF (Latest ACS)',
    folder_en: '📁 8. Correction Slips & Official PDFs',
    desc_hi: 'IRPWM 2020 और नवीनतम एडवांस करेक्शन स्लिप (ACS) लिंक',
    desc_en: 'IRPWM 2020 & Latest Advance Correction Slips (ACS) Links',
    items: [
      {
        badge: 'Latest ACS Summary',
        title_hi: 'IRPWM 2020 की प्रमुख करेक्शन स्लिप्स (ACS) का संक्षिप्त विवरण',
        title_en: 'Key Advance Correction Slips (ACS) to IRPWM 2020',
        text_hi: '• ACS के माध्यम से ट्रैक मशीनों (Tamping, BCM, UNIMAT) के उपयोग, आधुनिक फिटिंग्स (Elastic Rail Clips Mk-III/Mk-V), और LWR रखरखाव के नियमों को अपडेट किया गया है।\n• सभी नवीनतम ACS और संपूर्ण IRPWM मैनुअल डाउनलोड करने के लिए नीचे दिए गए आधिकारिक रेलवे बोर्ड लिंक का उपयोग करें।',
        text_en: '• ACS updates cover modern track machines (Tamping, BCM), Elastic Rail Clips (Mk-III/Mk-V), and revised LWR maintenance parameters.\n• Use the official Railway Board link below to download complete IRPWM 2020 and all latest ACS PDFs.',
        link: 'https://indianrailways.gov.in',
        linkText_hi: '🔗 रेलवे बोर्ड ऑफिशियल IRPWM एवं ACS पेज खोलें',
        linkText_en: '🔗 Open Railway Board Official IRPWM & ACS Page',
        keywords: 'acs correction slip pdf download circular संशोधन पीडीएफ'
      },
      {
        badge: 'IRICEN Pune',
        title_hi: 'IRICEN हिंदी व अंग्रेजी पॉकेट बुक (Trackman Handbook)',
        title_en: 'IRICEN Hindi & English Pocket Books (Trackman Handbook)',
        text_hi: '• भारतीय रेल सिविल इंजीनियरिंग संस्थान (IRICEN) द्वारा जारी ट्रैक मेंटेनर पॉकेट बुक, वेल्डिंग मैनुअल और LWR मैनुअल यहाँ से देखें।',
        text_en: '• Access Track Maintainer Pocket Books, AT Welding Manual, and LWR Manual published by IRICEN.',
        link: 'https://iricen.gov.in',
        linkText_hi: '🔗 IRICEN ऑफिशियल पोर्टल पर जाएं',
        linkText_en: '🔗 Visit IRICEN Official Portal',
        keywords: 'iricen handbook manual book हैंडबुक किताब'
      }
    ]
  }
];

// Data is supplied for quick reference; verify each item against current official IRPWM, ACS and Railway Board/zonal instructions before operational use.
