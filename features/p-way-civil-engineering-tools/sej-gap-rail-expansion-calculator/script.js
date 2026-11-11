'use strict';
let lang='hi';
const TEMP_COEFFICIENT=1.15;
const GAP_TOLERANCE=10;

function toggleLang(){lang=lang==='hi'?'en':'hi';applyLang();}
function applyLang(){
 const en=lang==='en';
 const set=(id,value)=>{document.getElementById(id).textContent=value;};
 set('langBtn',en?'हिंदी':'English');
 set('mainTitle',en?'🛤️ SEJ Gap & Rail Expansion Calculator':'🛤️ SEJ गैप और रेल एक्सपेंशन कैलकुलेटर');
 set('subTitle',en?'Estimate the SEJ gap at the current rail temperature using the selected reference inputs.':'मौजूदा रेल तापमान पर चुने गए संदर्भ मानों से SEJ का सैद्धांतिक गैप जांचें');
 set('sejTypeLabel',en?'1. SEJ type / initial gap at td:':'1. SEJ का प्रकार / td पर प्रारंभिक गैप:');
 set('opt40','40 mm (Standard 120mm Max Gap SEJ)');
 set('opt60','60 mm (Modified / Special SEJ)');
 set('tdLabel',en?'2. Destressing Temperature (td °C):':'2. डिस्ट्रेसिंग तापमान (td °C):');
 set('currLabel',en?'3. Current Rail Temperature (°C):':'3. मौजूदा रेल तापमान (°C):');
 set('actualLabel',en?'4. Actual measured gap on track (mm — optional):':'4. ट्रैक पर नापा गया वास्तविक गैप (mm — वैकल्पिक):');
 set('calcBtn',en?'Calculate SEJ Gap':'SEJ गैप की गणना करें');
 set('resGapLabel',en?'Theoretical SEJ gap (reference estimate):':'सैद्धांतिक SEJ गैप (संदर्भ अनुमान):');
 document.getElementById('tdTemp').placeholder=en?'e.g. 42':'जैसे: 42';
 document.getElementById('currTemp').placeholder=en?'e.g. 55':'जैसे: 55';
 document.getElementById('actualGap').placeholder=en?'e.g. 28 (optional)':'जैसे: 28 (खाली छोड़ सकते हैं)';
 document.getElementById('disclaimer').textContent=en
 ?'Important: The 1.15 mm/°C coefficient, ±10 mm comparison tolerance and initial-gap choices are reference inputs supplied for this calculator. Determine actual SEJ gaps from the approved SEJ drawing, breathing length, rail arrangement/profile and current applicable IRPWM/railway instructions. This result is not an operational authorization or safety certificate.'
 :'महत्वपूर्ण: 1.15 mm/°C गुणांक, ±10 mm तुलना-सीमा तथा प्रारंभिक गैप विकल्प इस कैलकुलेटर में दिए गए संदर्भ इनपुट हैं। वास्तविक SEJ गैप की गणना SEJ के स्वीकृत ड्रॉइंग, breathing length, रेल प्रोफाइल/व्यवस्था और लागू नवीनतम IRPWM/रेलवे निर्देशों के अनुसार करें। यह परिणाम परिचालन अनुमति या सुरक्षा प्रमाणपत्र नहीं है।';
 renderRules();
 if(document.getElementById('resultBox').style.display==='block')calculateSEJ();
}
function renderRules(){
 const en=lang==='en';
 const title=en?'📘 Calculation model used (verify with approved SEJ drawing):':'📘 प्रयुक्त गणना मॉडल (स्वीकृत SEJ ड्रॉइंग से पुष्टि करें):';
 const lines=en
 ?['Expected gap = Initial gap − [(Current rail temperature − td) × 1.15 mm/°C].','Comparison band shown = theoretical gap ±10 mm (user-supplied reference tolerance).','A positive temperature change reduces the calculated gap; a negative change increases it.','Greasing interval and adjustment instructions must be taken from current official maintenance instructions.']
 :['निर्धारित गैप = प्रारंभिक गैप − [(मौजूदा रेल तापमान − td) × 1.15 mm/°C]।','दिखाई गई तुलना सीमा = सैद्धांतिक गैप ±10 mm (दिया गया संदर्भ मान)।','तापमान बढ़ने पर इस सूत्र से गैप घटता है; तापमान घटने पर गैप बढ़ता है।','ग्रीसिंग अवधि और समायोजन के निर्देश वर्तमान आधिकारिक मेंटेनेंस निर्देशों से लें।'];
 document.getElementById('sejRulesBox').innerHTML='<strong>'+title+'</strong><br>'+lines.map(x=>'• '+x).join('<br>');
}
function calculateSEJ(){
 const init=Number(document.getElementById('initialGap').value);
 const tdInput=document.getElementById('tdTemp').value.trim();
 const currInput=document.getElementById('currTemp').value.trim();
 const actualInput=document.getElementById('actualGap').value.trim();
 const td=Number(tdInput),curr=Number(currInput),en=lang==='en';
 if(tdInput===''||currInput===''||!Number.isFinite(td)||!Number.isFinite(curr)){
  alert(en?'Enter valid td and current rail temperature values.':'कृपया td और मौजूदा रेल तापमान के सही मान भरें।');return;
 }
 if(td < -20||td>100||curr < -20||curr>100){
  alert(en?'Check temperatures. Enter values between −20°C and 100°C.':'तापमान जाँचें। मान −20°C से 100°C के बीच भरें।');return;
 }
 if(actualInput!==''&&(!Number.isFinite(Number(actualInput))||Number(actualInput)<0||Number(actualInput)>500)){
  alert(en?'Actual gap must be a valid value from 0 to 500 mm.':'वास्तविक गैप 0 से 500 mm के बीच सही मान होना चाहिए।');return;
 }
 const delta=curr-td;
 const rawGap=init-(delta*TEMP_COEFFICIENT);
 const expected=Math.max(0,rawGap);
 const low=Math.max(0,expected-GAP_TOLERANCE);
 const high=expected+GAP_TOLERANCE;
 document.getElementById('gapOutput').textContent=expected.toFixed(1)+' mm';
 let badge,detail;
 if(rawGap<0){
  badge='<span class="badge-warn">'+(en?'⚠️ Formula predicts gap closure/overrun. Do not treat zero as a safe condition.':'⚠️ सूत्र गैप बंद होने/ओवररन का संकेत देता है। शून्य को सुरक्षित स्थिति न मानें।')+'</span>';
 }else if(actualInput!==''){
  const actual=Number(actualInput),diff=actual-expected,sign=diff>0?'+':'';
  badge=Math.abs(diff)<=GAP_TOLERANCE
   ?'<span class="badge-ok">'+(en?'Within entered ±10 mm comparison band':'दिए गए ±10 mm तुलना मान के भीतर')+' ('+sign+diff.toFixed(1)+' mm)</span>'
   :'<span class="badge-warn">'+(en?'Outside entered ±10 mm comparison band':'दिए गए ±10 mm तुलना मान से बाहर')+' ('+sign+diff.toFixed(1)+' mm)</span>';
  detail=en?'Actual measured gap: <b>'+actual.toFixed(1)+' mm</b><br>Difference (actual − theoretical): <b>'+sign+diff.toFixed(1)+' mm</b><br>Reference comparison band: <b>'+low.toFixed(1)+'–'+high.toFixed(1)+' mm</b>'
   :'वास्तविक मापा गया गैप: <b>'+actual.toFixed(1)+' mm</b><br>अंतर (वास्तविक − सैद्धांतिक): <b>'+sign+diff.toFixed(1)+' mm</b><br>संदर्भ तुलना सीमा: <b>'+low.toFixed(1)+'–'+high.toFixed(1)+' mm</b>';
 }else{
  badge='<span class="badge-ok">'+(en?'Reference comparison band':'संदर्भ तुलना सीमा')+': '+low.toFixed(1)+'–'+high.toFixed(1)+' mm</span>';
  detail=en?'No actual measured gap entered. Compare the field measurement with the approved SEJ schedule and instructions.':'वास्तविक मापा गया गैप नहीं भरा गया है। स्थल पर मापे गए गैप की स्वीकृत SEJ अनुसूची और निर्देशों से तुलना करें।';
 }
 document.getElementById('toleranceBadge').innerHTML=badge;
 document.getElementById('extraDetails').innerHTML=(en?'Temperature change (current − td): ':'तापमान में बदलाव (मौजूदा − td): ')+'<b>'+(delta>0?'+':'')+delta.toFixed(1)+' °C</b><br>'+detail;
 document.getElementById('resultBox').style.display='block';
}
window.addEventListener('DOMContentLoaded',applyLang);
