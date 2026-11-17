import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(here, '../script.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const elementIds = ["langBtn","mainTitle","subTitle","inputTypeLabel","curveType","optDeg","optRad","curveValLabel","curveVal","speedLabel","trainSpeed","routeLabel","routeGroup","optAB","optC","optDE","calcBtn","resultBox","resCantTitle","cantOutput","statusBadge","extraInfo","principleBox","disclaimer"];
function harness({ curveType = 'radius', curveVal = '875', speed = '110', group = '165_75' } = {}) {
  const elements = Object.fromEntries(elementIds.map(id => [id, {
    id, value: '', textContent: '', innerHTML: '', style: {}, placeholder: ''
  }]));
  elements.curveType.value = curveType;
  elements.curveVal.value = curveVal;
  elements.trainSpeed.value = speed;
  elements.routeGroup.value = group;
  const alerts = [];
  const context = {
    document: { getElementById: id => elements[id] },
    window: { addEventListener: () => {} },
    alert: message => alerts.push(message),
    Math, Number
  };
  vm.runInNewContext(source, context, { filename: scriptPath });
  return { elements, alerts, calculate: () => vm.runInNewContext('calculateCant()', context) };
}

test('Group C uses 165 mm maximum cant and 75 mm deficiency', () => {
  const h = harness({ group: '165_75' });
  h.calculate();
  assert.equal(h.alerts.length, 0);
  assert.match(h.elements.extraInfo.innerHTML, /Max Ca 165 mm \+ Cd 75 mm/);
  const expected = Math.floor(Math.sqrt(((165 + 75) * 875) / (1750 / 127)));
  assert.match(h.elements.extraInfo.innerHTML, new RegExp('Theoretical limiting speed.*' + expected + ' km/h'));
});

test('Groups A/B retain 165 mm cant and 100 mm deficiency', () => {
  const h = harness({ group: '165_100' });
  h.calculate();
  assert.match(h.elements.extraInfo.innerHTML, /Max Ca 165 mm \+ Cd 100 mm/);
});

test('Groups D/E retain 140 mm cant and 75 mm deficiency', () => {
  const h = harness({ group: '140_75' });
  h.calculate();
  assert.match(h.elements.extraInfo.innerHTML, /Max Ca 140 mm \+ Cd 75 mm/);
});

test('degree input converts to radius using the calculator convention', () => {
  const h = harness({ curveType: 'degree', curveVal: '2', speed: '80', group: '165_75' });
  h.calculate();
  assert.match(h.elements.extraInfo.innerHTML, /Curve radius: <b>875\.0 m/);
});

test('zero or invalid inputs fail without producing a result', () => {
  const h = harness({ curveVal: '0' });
  h.calculate();
  assert.equal(h.alerts.length, 1);
  assert.equal(h.elements.resultBox.style.display, undefined);
});
