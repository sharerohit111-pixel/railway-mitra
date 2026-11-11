let currentLang = (window.RailwayMitraLanguage && window.RailwayMitraLanguage.get() === 'en') ? 'en' : 'hi';
let selectedFolder = 'patrolling';

function folderTitle(folder) { return currentLang === 'hi' ? folder.folder_hi : folder.folder_en; }
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderFolders() {
  const grid = document.getElementById('folderGrid');
  if (!grid) return;
  grid.replaceChildren();
  irpwmData.forEach(folder => {
    const button = el('button', 'folder-card' + (folder.id === selectedFolder ? ' active' : ''));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(folder.id === selectedFolder));
    button.append(el('span','folder-title',folderTitle(folder)));
    button.append(el('span','folder-desc',currentLang === 'hi' ? folder.desc_hi : folder.desc_en));
    button.addEventListener('click', () => selectFolder(folder.id));
    grid.append(button);
  });
}
function selectFolder(id) {
  selectedFolder = id;
  const search = document.getElementById('searchInput');
  if (search) search.value = '';
  renderFolders();
  const folder = irpwmData.find(x => x.id === id);
  if (folder) renderDetailedFolder(folder);
}
function addSection(article, section) {
  const box = el('section','detail-section');
  box.append(el('h4','detail-subheading',currentLang === 'hi' ? section[0] : section[1]));
  box.append(el('p','detail-body',currentLang === 'hi' ? section[2] : section[3]));
  article.append(box);
}
function renderTopic(topic) {
  const article = el('article','rule-item detailed-topic');
  article.append(el('span','rule-badge',topic.ref));
  article.append(el('h3','rule-heading',currentLang === 'hi' ? topic.hi : topic.en));
  article.append(el('p','rule-text detail-intro',currentLang === 'hi' ? topic.introHi : topic.introEn));
  (topic.sections || []).forEach(s => addSection(article,s));
  return article;
}
function renderDetailedFolder(folder) {
  const panel = document.getElementById('contentPanel');
  if (!panel) return;
  panel.replaceChildren(el('h2','panel-heading',folderTitle(folder)));
  const details = (window.PWayDetailedContent || []).find(x => x.id === folder.id);
  if (details && details.topics && details.topics.length) {
    details.topics.forEach(topic => panel.append(renderTopic(topic)));
  } else {
    (folder.items || []).forEach(item => {
      const article = el('article','rule-item');
      article.append(el('span','rule-badge',item.badge));
      article.append(el('h3','rule-heading',currentLang === 'hi' ? item.title_hi : item.title_en));
      article.append(el('p','rule-text',currentLang === 'hi' ? item.text_hi : item.text_en));
      if (item.link) {
        const a = el('a','action-link',currentLang === 'hi' ? item.linkText_hi : item.linkText_en);
        a.href=item.link; a.target='_blank'; a.rel='noopener noreferrer'; article.append(a);
      }
      panel.append(article);
    });
  }
}
function searchAll() {
  const input = document.getElementById('searchInput');
  const q = input ? input.value.trim().toLocaleLowerCase() : '';
  if (!q) { const f=irpwmData.find(x=>x.id===selectedFolder); if(f) renderDetailedFolder(f); return; }
  const panel=document.getElementById('contentPanel');
  panel.replaceChildren(el('h2','panel-heading',currentLang==='hi'?'🔍 विस्तृत खोज परिणाम':'🔍 Detailed search results'));
  let count=0;
  (window.PWayDetailedContent || []).forEach(group => {
    const folder=irpwmData.find(x=>x.id===group.id);
    (group.topics||[]).forEach(topic => {
      const hay=[topic.ref,topic.hi,topic.en,topic.introHi,topic.introEn,...(topic.sections||[]).flat()].join(' ').toLocaleLowerCase();
      if(hay.includes(q)) {
        if(count===0 || !panel.querySelector('[data-folder="'+group.id+'"]')) {
          const heading=el('h3','search-folder-heading',folder ? folderTitle(folder) : group.id);
          heading.dataset.folder=group.id; panel.append(heading);
        }
        panel.append(renderTopic(topic)); count++;
      }
    });
  });
  if(!count) panel.append(el('p','empty-result',currentLang==='hi'?'कोई परिणाम नहीं मिला। दूसरा शब्द खोजें।':'No results found. Try another term.'));
}
function handleSearch(){ searchAll(); }
function toggleLanguage() {
  currentLang=currentLang==='hi'?'en':'hi';
  try {
    if(window.RailwayMitraLanguage) window.RailwayMitraLanguage.set(currentLang==='en'?'en':'mix');
    localStorage.setItem('railwayMitra.pwayManuals.language.v1',currentLang);
  } catch(e) { console.warn('Language preference could not be saved:',e); }
  const button=document.getElementById('lang-toggle');
  const title=document.getElementById('ui-title');
  const subtitle=document.getElementById('ui-subtitle');
  const search=document.getElementById('searchInput');
  const disclaimer=document.getElementById('ui-disclaimer');
  if(button) button.textContent=currentLang==='hi'?'Switch to English':'हिंदी में बदलें';
  if(title) title.textContent=currentLang==='hi'?'📚 भारतीय रेलवे P-Way मैनुअल एवं दिशानिर्देश':'📚 Indian Railways P-Way Manuals & Guidelines';
  if(subtitle) subtitle.textContent=currentLang==='hi'?'IRPWM, एडवांस करेक्शन स्लिप्स, सुरक्षा नियम और विस्तृत तकनीकी अध्ययन':'IRPWM, Advance Correction Slips, safety rules and detailed technical study';
  if(search) search.placeholder=currentLang==='hi'?'🔍 विषय, नियम, पैरा नंबर या तकनीकी शब्द खोजें...':'🔍 Search topics, rules, paragraph numbers or technical terms...';
  if(disclaimer) disclaimer.textContent=currentLang==='hi'
    ? 'महत्वपूर्ण सुरक्षा सूचना: यह अध्ययन एवं त्वरित संदर्भ सामग्री है, नियंत्रित रेलवे आदेश/मैनुअल का विकल्प नहीं। कार्य करने से पहले लागू IRPWM-2024, नवीनतम ACS, RDSO प्रक्रिया आदेश, G&SR, Accident Manual तथा अपने रेलवे/डिवीजन के वर्तमान निर्देश और सक्षम अधिकारी की अनुमति देखें। किसी भी विरोध की स्थिति में वर्तमान आधिकारिक आदेश मान्य होगा।'
    : 'IMPORTANT SAFETY NOTICE: This is learning/reference material, not a substitute for controlled Railway instructions. Before work, consult applicable IRPWM-2024, latest ACS, RDSO procedure orders, G&SR, Accident Manual, current Railway/Division instructions and competent authority. Current official orders prevail.';
  renderFolders();\n  renderHindiReader();\n  const q=search?search.value.trim():'';
  if(q) searchAll(); else { const f=irpwmData.find(x=>x.id===selectedFolder); if(f) renderDetailedFolder(f); }
}
document.addEventListener('DOMContentLoaded',()=>{
  try {
    const saved=localStorage.getItem('railwayMitra.pwayManuals.language.v1');
    if(saved==='hi'||saved==='en') currentLang=saved;
    else if(window.RailwayMitraLanguage) currentLang=window.RailwayMitraLanguage.get()==='en'?'en':'hi';
  } catch(e) {}
  const button=document.getElementById('lang-toggle');
  if(button) button.textContent=currentLang==='hi'?'Switch to English':'हिंदी में बदलें';
  renderFolders();\n  renderHindiReader();\n  const first=irpwmData.find(x=>x.id===selectedFolder);
  if(first) renderDetailedFolder(first);
});

function renderHindiReader(){
 const root=document.getElementById('hindiReader');
 const data=window.IRPWMHindiReader;
 if(!root||!data)return;
 root.replaceChildren();
 const head=el('div','hindi-reader-head');
 head.append(el('h2','',currentLang==='hi'?data.titleHi:data.titleEn));
 const source=el('a','reader-source',currentLang==='hi'?'आधिकारिक मूल मैनुअल और नवीनतम ACS खोलें':'Open official manual and latest ACS');
 source.href='https://rb.indianrailways.gov.in/show-irPersonnel/preview/204';source.target='_blank';source.rel='noopener noreferrer';
 head.append(source);root.append(head);
 root.append(el('p','reader-note',currentLang==='hi'?'यह अध्यायवार हिंदी अध्ययन रूपांतरण है। मूल नियम, संख्यात्मक मान और कार्यवाही लागू आधिकारिक मैनुअल/ACS से सत्यापित करें।':'Chapter-wise Hindi study adaptation. Verify rules, numerical limits and procedures against the applicable official manual/ACS.'));
 data.chapters.forEach(ch=>{
  const card=el('article','reader-chapter');
  card.append(el('h3','',currentLang==='hi'?ch.hi:ch.en));
  card.append(el('p','',currentLang==='hi'?ch.introHi:ch.introEn));
  ch.sections.forEach(s=>{
   card.append(el('span','reader-ref',s.ref));
   card.append(el('h4','',currentLang==='hi'?s.hi:s.en));
   card.append(el('p','',currentLang==='hi'?s.hiText:s.enText));
  });
  root.append(card);
 });
}
