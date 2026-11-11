import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, codesInQuery, extractCodes, fold, KnowledgeIndex, sameDevice, solStatus, toks } from '../src/kb.js';
import { SEED_DOCS, SEED_SOLUTIONS } from '../src/seed.js';
import type { Doc, Solution } from '../src/types.js';

const doc = (id: string, title: string, brand: string, model: string, text: string): Doc =>
  ({ id, title, brand, model, kind: 'manual', chunks: chunkText(text), createdAt: '' });
const seedDocs = (): Doc[] => SEED_DOCS.map((d, i) => doc(String(i), d.title, d.brand, d.model, d.text));
const seedSols = (): Solution[] => SEED_SOLUTIONS.map((s, i) => ({ ...s, id: 's' + i, userId: null, photo: '', photoNote: '', votes: {}, rewarded: false, date: '' }));

test('chunkText splits on markdown headings', () => {
  const c = chunkText('# A\nbir\n\n# B\niki');
  assert.deepEqual(c.map((x) => x.h), ['A', 'B']);
});

test('text is folded: Turkish letters, upper case and the dotless i all compare equal', () => {
  assert.equal(fold('ŞARJ SÜRESİ Işık'), 'sarj suresi isik');
  assert.equal(fold('INSTALLATION'), 'installation', 'English capitals are not turned into dotless i');
  assert.equal(fold('Dräger'), 'drager');
  assert.deepEqual(toks('Şarj SÜRESİ uzadı ve'), ['sarj', 'suresi', 'uzadi']);
  assert.deepEqual(toks('sarj suresi uzadi'), toks('Şarj süresi uzadı'));
  assert.deepEqual(toks('Hata E-21, model PM-12'), ['hata', 'e21', 'model', 'pm12']);
});

test('solStatus thresholds', () => {
  assert.equal(solStatus({ ok: 3, fail: 0 }), 'ver');
  assert.equal(solStatus({ ok: 3, fail: 2 }), 'pen');
  assert.equal(solStatus({ ok: 0, fail: 3 }), 'rej');
});

test('search finds the right manual section, with or without Turkish letters', () => {
  const ix = new KnowledgeIndex();
  ix.rebuild(seedDocs(), []);
  for (const q of ['defibrilatör şarj süresi uzadı', 'defibrilator sarj suresi uzadi', 'DEFİBRİLATÖR ŞARJ SÜRESİ UZADI']) {
    const hits = ix.search(q, '', 3, 'doc');
    assert.match(hits[0].doc.chunks[hits[0].ci].h, /Şarj süresi/, q);
  }
});

test('a Turkish fault report finds the section in an English manual, and the other way round', () => {
  const english = doc('en', 'Infusion pump service manual', 'Acme', 'IP-7', `# Occlusion alarm
If the downstream occlusion alarm sounds, check the tubing for kinks and clean the pressure sensor.

# Battery does not charge
Check fuse F1 and the charger board output voltage. Replace the battery pack if capacity is low.

# Display
The touch screen can be calibrated from the service menu.`);
  const ix = new KnowledgeIndex();
  ix.rebuild([english, ...seedDocs()], []);
  const charge = ix.search('batarya şarj olmuyor sigorta', 'Acme IP-7', 2, 'doc');
  assert.equal(charge[0].doc.id, 'en');
  assert.equal(charge[0].doc.chunks[charge[0].ci].h, 'Battery does not charge');
  const pressure = ix.search('tıkanıklık alarmı basınç sensörü', 'Acme IP-7', 2, 'doc');
  assert.equal(pressure[0].doc.chunks[pressure[0].ci].h, 'Occlusion alarm');
  // English query against the Turkish sample manuals.
  const tr = ix.search('flow sensor calibration error', '', 2, 'doc');
  assert.match(tr[0].doc.chunks[tr[0].ci].h, /Akış sensörü kalibrasyonu/);
});

test('with a device selected its own manual wins, and another device\'s procedure is pushed down', () => {
  const ix = new KnowledgeIndex();
  ix.rebuild(seedDocs(), seedSols());
  const any = ix.search('batarya kapasite testi', '', 5, 'doc').map((h) => h.doc.model);
  assert.ok(new Set(any).size > 1, 'without a device several manuals answer');
  const monitor = ix.search('batarya kapasite testi', 'Örnek Hasta Monitörü PM-12', 3, 'doc');
  assert.equal(monitor[0].doc.model, 'Hasta Monitörü PM-12');
  // The device name may be spelled differently, e.g. typed or read from a label.
  const typed = ix.search('batarya kapasite testi', 'ornek hasta monitoru pm12', 3, 'doc');
  assert.equal(typed[0].doc.model, 'Hasta Monitörü PM-12');
  assert.equal(sameDevice('Philips MX450', 'Philips IntelliVue MX450'), true);
  assert.equal(sameDevice('Philips MX450', 'Philips MX800'), false);
  assert.equal(sameDevice('Örnek', 'Örnek Ventilatör VX-300'), false, 'a brand alone is not a device');
});

test('error codes are extracted from code tables', () => {
  const docs = seedDocs();
  const pm = extractCodes(docs[0]);
  assert.deepEqual(pm.map((c) => c.code), ['E21', 'E24', 'E30']);
  assert.match(pm[0].text, /^Güç kartı haberleşme hatası\. .*J5 yassı kablosunu yeniden oturtun\.$/);
  const df = extractCodes(docs[2]);
  assert.deepEqual(df.map((c) => c.code), ['D03', 'D07', 'D11'], 'several codes on one line');
  assert.equal(df[1].text, 'Kaşık (paddle) bağlantı hatası.');
  // Other layouts: a table row, a dash, a keyword before a bare number. Component names in running text are not codes.
  const other = doc('x', 'Pump', 'Acme', 'P1', `# Error codes
E-01 | Door open | Close the door
E02 - Air in line. Prime the set and check sensor Q3.
Error 105: Motor stalled.

# Power supply
TP1: 15 V test point. Q3: MOSFET.`);
  assert.deepEqual(extractCodes(other).map((c) => [c.code, c.text]), [
    ['E01', 'Door open | Close the door'],
    ['E02', 'Air in line. Prime the set and check sensor Q3.'],
    ['105', 'Motor stalled.'],
  ]);
});

test('codes typed in a fault report are recognised and looked up for the selected device only', () => {
  assert.deepEqual(codesInQuery('Ekranda E-21 var, bazen e24'), ['E21', 'E24']);
  assert.deepEqual(codesInQuery('hata 105 veriyor'), ['HATA105', '105']);
  const ix = new KnowledgeIndex();
  const twin = doc('t', 'Other monitor', 'Acme', 'M9', '# Error codes\nE21: Printer out of paper.');
  ix.rebuild([...seedDocs(), twin], []);
  const all = ix.lookupCodes('cihaz E21 veriyor', '');
  assert.deepEqual(all.map((c) => c.device).sort(), ['Acme M9', 'Örnek Hasta Monitörü PM-12']);
  const mine = ix.lookupCodes('cihaz e-21 veriyor', 'Örnek Hasta Monitörü PM-12');
  assert.equal(mine.length, 1);
  assert.match(mine[0].text, /Güç kartı haberleşme/);
  assert.deepEqual(ix.lookupCodes('E21', 'Örnek Ventilatör VX-300'), [], 'never another device\'s meaning for the same code');
  assert.deepEqual(ix.lookupCodes('TP2 noktasında 0.2 V ölçtüm, Q3 ısınıyor', ''), [], 'test points and parts are not codes');
  assert.deepEqual(ix.codesOf('Örnek Defibrilatör DF-200').map((c) => c.code), ['D03', 'D07', 'D11']);
});

test('an error code in the report pulls up the section that explains it', () => {
  const ix = new KnowledgeIndex();
  ix.rebuild(seedDocs(), seedSols());
  const hits = ix.search('E24', 'Örnek Hasta Monitörü PM-12', 1, 'doc');
  assert.equal(hits[0].doc.chunks[hits[0].ci].h, 'Hata kodları');
});

test('AI search words and AI-found codes on a section are indexed', () => {
  const d = doc('k', 'Analyzer', 'Acme', 'A1', '# Section 4\nRefer to the pneumatic assembly procedure.');
  d.chunks[0].k = 'hava kaçağı basınç düşük leak';
  d.chunks[0].codes = [{ code: 'P-07', text: 'Pressure too low.' }];
  const ix = new KnowledgeIndex();
  ix.rebuild([d], []);
  assert.equal(ix.search('hava kaçağı', '', 1, 'doc')[0].doc.id, 'k');
  assert.equal(ix.lookupCodes('P07 hatası', '')[0].text, 'Pressure too low.');
});
