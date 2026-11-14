import fs from 'node:fs';
import path from 'node:path';

const variablesPath = path.resolve('android/variables.gradle');
if (!fs.existsSync(variablesPath)) {
  throw new Error('Capacitor Android variables.gradle was not generated.');
}
let source = fs.readFileSync(variablesPath, 'utf8');
if (!source.includes('rgcfaIncludeGoogle')) {
  const extMatch = source.match(/ext\s*\{/);
  if (!extMatch) throw new Error('Could not find the Gradle ext block safely.');
  const insertAt = extMatch.index + extMatch[0].length;
  source = source.slice(0, insertAt) +
    "\n    rgcfaIncludeGoogle = true\n    androidxCredentialsVersion = '1.3.0'" +
    source.slice(insertAt);
}
fs.writeFileSync(variablesPath, source);
console.log('Configured native Google Credential Manager dependencies.');
