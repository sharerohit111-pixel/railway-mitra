import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapperRoot = path.resolve(here, '..');
const repositoryRoot = path.resolve(wrapperRoot, '..');
const webRoot = path.join(wrapperRoot, 'web');

// Explicit allowlist: package only the app/site files needed at runtime.
// Backend source, Git metadata, CI files, native workspace and repository
// administration/configuration files are deliberately excluded.
const runtimeEntries = [
  'about.html',
  'app.html',
  'contact.html',
  'disclaimer.html',
  'index.html',
  'terms-and-conditions.html',
  'manifest.json',
  'service-worker.js',
  'assets',
  'config',
  'employee-benefits-calculators',
  'features',
  'guides',
  'install',
  'other-exams'
];

if (!fs.existsSync(path.join(repositoryRoot, 'app.html'))) {
  throw new Error('Could not locate repository app.html. Run this script from android-wrapper.');
}

fs.rmSync(webRoot, { recursive: true, force: true });
fs.mkdirSync(webRoot, { recursive: true });

for (const entry of runtimeEntries) {
  const source = path.join(repositoryRoot, entry);
  const destination = path.join(webRoot, entry);

  if (!fs.existsSync(source)) {
    throw new Error(`Required runtime entry is missing: ${entry}`);
  }

  fs.cpSync(source, destination, {
    recursive: true,
    filter: (sourcePath) => {
      const name = path.basename(sourcePath);
      return !['.DS_Store', 'Thumbs.db'].includes(name);
    }
  });
}

const requiredFiles = [
  'app.html',
  'manifest.json',
  'assets/js/auth-guard.js',
  'assets/js/firebase.js',
  'features/auth/login.html'
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(webRoot, relativePath))) {
    throw new Error(`Packaged app is missing required file: ${relativePath}`);
  }
}

// Android WebView: use durable IndexedDB persistence and inject the native auth bridge
// only into the staged Android login page. The production website remains untouched.
const firebasePath = path.join(webRoot, 'assets/js/firebase.js');
let firebaseSource = fs.readFileSync(firebasePath, 'utf8');
firebaseSource = firebaseSource.replace(
  'import { getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";',
  'import { initializeAuth, indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";'
);
firebaseSource = firebaseSource.replace('const auth = getAuth(app);', 'const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });');
if (!firebaseSource.includes('initializeAuth(app, { persistence: indexedDBLocalPersistence })')) {
  throw new Error('Could not safely configure Firebase IndexedDB persistence for Android.');
}
fs.writeFileSync(firebasePath, firebaseSource);

const loginHtmlPath = path.join(webRoot, 'features/auth/login.html');
let loginHtml = fs.readFileSync(loginHtmlPath, 'utf8');
const moduleScript = '<script type="module" src="./login.js"></script>';
if (!loginHtml.includes(moduleScript)) {
  throw new Error('Could not locate the login module script for native bridge injection.');
}
loginHtml = loginHtml.replace(moduleScript, '<script src="../../assets/js/native-google-auth.js"></script>\\n    ' + moduleScript);
fs.writeFileSync(loginHtmlPath, loginHtml);


const appHtmlPath = path.join(webRoot, 'app.html');
let appHtml = fs.readFileSync(appHtmlPath, 'utf8');
const shareScript = '<script src="features/share/share.js" defer></script>';
if (!appHtml.includes(shareScript)) {
  throw new Error('Could not locate the share feature script for native bridge injection.');
}
appHtml = appHtml.replace(shareScript, '<script src="assets/js/native-share.js"></script>\\n    ' + shareScript);
fs.writeFileSync(appHtmlPath, appHtml);

// Inject the updater bridge only into the staged Android web bundle.
for (const page of ['index.html', 'app.html']) {
  const pagePath = path.join(webRoot, page);
  let html = fs.readFileSync(pagePath, 'utf8');
  const updaterScript = '<script src="assets/js/native-updater.js"></script>';
  if (!html.includes(updaterScript)) {
    const headClose = html.toLowerCase().lastIndexOf('</head>');
    if (headClose < 0) throw new Error(`Could not find </head> in staged ${page}.`);
    html = html.slice(0, headClose) + '    ' + updaterScript + '\n' + html.slice(headClose);
    fs.writeFileSync(pagePath, html);
  }
}

console.log(`Prepared local Android web bundle at: ${webRoot}`);
console.log(`Packaged ${runtimeEntries.length} runtime entries.`);
