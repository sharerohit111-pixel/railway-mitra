let currentLang = (window.RailwayMitraLanguage && window.RailwayMitraLanguage.get() === 'en') ? 'en' : 'hi';
let selectedFolder = 'patrolling';

function getFolderTitle(folder) {
  return currentLang === 'hi' ? folder.folder_hi : folder.folder_en;
}

// Render chapter folders
function renderFolders() {
  const grid = document.getElementById('folderGrid');
  if (!grid) return;

  grid.innerHTML = '';
  irpwmData.forEach(folder => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-card' + (folder.id === selectedFolder ? ' active' : '');
    button.setAttribute('aria-pressed', String(folder.id === selectedFolder));

    const title = document.createElement('span');
    title.className = 'folder-title';
    title.textContent = getFolderTitle(folder);

    const desc = document.createElement('span');
    desc.className = 'folder-desc';
    desc.textContent = currentLang === 'hi' ? folder.desc_hi : folder.desc_en;

    button.append(title, desc);
    button.addEventListener('click', () => selectFolder(folder.id));
    grid.appendChild(button);
  });
}

// Select a folder and show its rules
function selectFolder(id) {
  selectedFolder = id;
  const search = document.getElementById('searchInput');
  if (search) search.value = '';

  renderFolders();
  const folder = irpwmData.find(item => item.id === id);
  if (folder) renderItems(folder.items, getFolderTitle(folder));
}

// Render rules in the content panel
function renderItems(items, heading) {
  const panel = document.getElementById('contentPanel');
  if (!panel) return;

  if (!items || items.length === 0) {
    panel.innerHTML = '<p class="empty-result">' +
      (currentLang === 'hi' ? 'कोई परिणाम नहीं मिला। कृपया दूसरा शब्द खोजें।' : 'No matching rules found. Try another keyword.') +
      '</p>';
    return;
  }

  const headingEl = document.createElement('h2');
  headingEl.className = 'panel-heading';
  headingEl.textContent = heading;
  panel.replaceChildren(headingEl);

  items.forEach(item => {
    const article = document.createElement('article');
    article.className = 'rule-item';

    const badge = document.createElement('span');
    badge.className = 'rule-badge';
    badge.textContent = item.badge;

    const title = document.createElement('h3');
    title.className = 'rule-heading';
    title.textContent = currentLang === 'hi' ? item.title_hi : item.title_en;

    const description = document.createElement('p');
    description.className = 'rule-text';
    description.textContent = currentLang === 'hi' ? item.text_hi : item.text_en;

    article.append(badge, title, description);

    if (item.link) {
      const link = document.createElement('a');
      link.className = 'action-link';
      link.href = item.link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = currentLang === 'hi' ? item.linkText_hi : item.linkText_en;
      article.appendChild(link);
    }

    if (item.tool) article.appendChild(createMiniTool());
    panel.appendChild(article);
  });
}

// Interactive track protection reference tool
function createMiniTool() {
  const wrapper = document.createElement('div');
  wrapper.className = 'mini-tool';

  const label = document.createElement('strong');
  label.textContent = currentLang === 'hi'
    ? '🛠️ त्वरित ट्रैक प्रोटेक्शन संदर्भ (Gauge Selector):'
    : '🛠️ Quick Track Protection Reference (Gauge Selector):';

  const select = document.createElement('select');
  select.id = 'gaugeSelect';
  select.setAttribute('aria-label', currentLang === 'hi' ? 'गेज चुनें' : 'Select gauge');

  const bg = document.createElement('option');
  bg.value = 'BG';
  bg.textContent = 'Broad Gauge (BG - 1676 mm)';

  const mg = document.createElement('option');
  mg.value = 'MG';
  mg.textContent = 'Metre Gauge (MG - 1000 mm)';

  select.append(bg, mg);

  const result = document.createElement('div');
  result.id = 'protectionResult';
  result.className = 'protection-result';

  select.addEventListener('change', () => updateProtectionInfo(select.value, result));
  wrapper.append(label, select, result);
  updateProtectionInfo('BG', result);
  return wrapper;
}

function updateProtectionInfo(gauge, resultElement) {
  const result = resultElement || document.getElementById('protectionResult');
  const select = document.getElementById('gaugeSelect');
  const selectedGauge = gauge || (select ? select.value : 'BG');
  if (!result) return;

  if (selectedGauge === 'BG') {
    result.textContent = currentLang === 'hi'
      ? '👉 दिए गए कोड का BG संदर्भ: 30m (लाल झंडी) → 600m (बैनर फ्लैग) → 1200m (3 डेटोनेटर)'
      : '👉 Supplied BG reference: 30m (Red Flag) → 600m (Banner Flag) → 1200m (3 Detonators)';
  } else {
    result.textContent = currentLang === 'hi'
      ? '👉 दिए गए कोड का MG संदर्भ: 30m (लाल झंडी) → 400m (बैनर फ्लैग) → 800m (3 डेटोनेटर)'
      : '👉 Supplied MG reference: 30m (Red Flag) → 400m (Banner Flag) → 800m (3 Detonators)';
  }
}

// Search across every chapter
function handleSearch() {
  const input = document.getElementById('searchInput');
  const query = input ? input.value.toLocaleLowerCase().trim() : '';

  if (!query) {
    const folder = irpwmData.find(item => item.id === selectedFolder);
    if (folder) {
      renderFolders();
      renderItems(folder.items, getFolderTitle(folder));
    }
    return;
  }

  const matches = [];
  irpwmData.forEach(folder => {
    folder.items.forEach(item => {
      const searchable = [
        item.badge, item.title_hi, item.title_en,
        item.text_hi, item.text_en, item.keywords,
        folder.folder_hi, folder.folder_en
      ].join(' ').toLocaleLowerCase();

      if (searchable.includes(query)) matches.push(item);
    });
  });

  const heading = currentLang === 'hi'
    ? '🔍 खोज परिणाम (' + matches.length + ')'
    : '🔍 Search Results (' + matches.length + ')';
  renderItems(matches, heading);
}

// Hindi / English switch; also remembers the module choice
function toggleLanguage() {
  currentLang = currentLang === 'hi' ? 'en' : 'hi';

  try {
    if (window.RailwayMitraLanguage) {
      window.RailwayMitraLanguage.set(currentLang === 'en' ? 'en' : 'mix');
    }
    localStorage.setItem('railwayMitra.pwayManuals.language.v1', currentLang);
  } catch (error) {
    console.warn('Language preference could not be saved:', error);
  }

  const button = document.getElementById('lang-toggle');
  const title = document.getElementById('ui-title');
  const subtitle = document.getElementById('ui-subtitle');
  const search = document.getElementById('searchInput');
  const disclaimer = document.getElementById('ui-disclaimer');

  if (button) button.textContent = currentLang === 'hi' ? 'Switch to English' : 'हिंदी में बदलें';
  if (title) title.textContent = currentLang === 'hi'
    ? '📚 भारतीय रेलवे P-Way मैनुअल एवं दिशानिर्देश'
    : '📚 Indian Railways P-Way Manuals & Guidelines';
  if (subtitle) subtitle.textContent = currentLang === 'hi'
    ? 'IRPWM, एडवांस करेक्शन स्लिप्स, सुरक्षा नियम और तकनीकी संदर्भ'
    : 'IRPWM, Advance Correction Slips, safety rules and technical references';
  if (search) search.placeholder = currentLang === 'hi'
    ? '🔍 नियम, पैरा नंबर या टूल खोजें (जैसे: Patrolling, Detonator, Gauge, ACS)...'
    : '🔍 Search rules, para number or tool (e.g. Patrolling, Detonator, Gauge, ACS)...';
  if (disclaimer) disclaimer.textContent = currentLang === 'hi'
    ? 'संदर्भ नोट: यह मॉड्यूल त्वरित संदर्भ के लिए है। नियमों, दूरियों, उपकरणों और प्रक्रियाओं की पुष्टि लागू IRPWM संस्करण, नवीनतम ACS, रेलवे बोर्ड/जोनल निर्देश तथा सक्षम अधिकारी से करें। किसी भी परिचालन निर्णय में आधिकारिक आदेश ही मान्य होंगे।'
    : 'Reference note: This module is for quick reference only. Verify rules, distances, equipment and procedures against the applicable IRPWM edition, latest ACS, Railway Board/zonal instructions and competent authority. Official orders govern all operational decisions.';

  renderFolders();
  const query = search ? search.value.trim() : '';
  if (query) {
    handleSearch();
  } else {
    const folder = irpwmData.find(item => item.id === selectedFolder);
    if (folder) renderItems(folder.items, getFolderTitle(folder));
  }
}

// Restore module language preference and initialize the library
document.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = localStorage.getItem('railwayMitra.pwayManuals.language.v1');
    if (saved === 'hi' || saved === 'en') currentLang = saved;
    else if (window.RailwayMitraLanguage) {
      currentLang = window.RailwayMitraLanguage.get() === 'en' ? 'en' : 'hi';
    }
  } catch (_) {}

  const button = document.getElementById('lang-toggle');
  if (button) button.textContent = currentLang === 'hi' ? 'Switch to English' : 'हिंदी में बदलें';
  selectFolder(selectedFolder);
});
