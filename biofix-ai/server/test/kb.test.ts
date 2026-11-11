import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, codesInQuery, extractCodes, fold, KnowledgeIndex, sameDevice, solStatus, splitLessons, toks } from '../src/kb.js';
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

test('a pasted paragraph without line breaks is cut at sentence ends, so no section is too long to quote in full', () => {
  const sentence = 'Check the charger board output voltage and replace the fuse if it is open. ';
  const c = chunkText('# Charging\n' + sentence.repeat(120)); // one line of about 9000 characters
  assert.ok(c.length > 4);
  assert.ok(c.every((x) => x.h === 'Charging' && x.t.length <= 2100), `longest: ${Math.max(...c.map((x) => x.t.length))}`);
  assert.ok(c.every((x) => x.t.endsWith('.')), 'cut between sentences, not inside one');
  assert.equal(c.map((x) => x.t).join(' ').replace(/\s+/g, ' '), sentence.repeat(120).trim(), 'nothing is lost');
  // Text with no spaces at all still gets cut.
  assert.ok(chunkText('x'.repeat(5000)).every((x) => x.t.length <= 2100));
});

test('training content becomes one lesson per heading, however long a lesson is', () => {
  const body = 'Kalibrasyon adımları şunlardır. '.repeat(100) + '\n\nİKİNCİ PARAGRAF\n' + 'Ölçüm değerlerini kaydedin. '.repeat(60);
  const lessons = splitLessons(`Giriş notu\n# Ders 1\n${body}\n\n# Ders 2\nKısa ders.\n# Boş ders\n`);
  assert.deepEqual(lessons.map((l) => l.h), ['', 'Ders 1', 'Ders 2']);
  assert.ok(lessons[1].t.length > 4000 && lessons[1].t.includes('İKİNCİ PARAGRAF'), 'not cut by length or by a line in capitals');
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

test('text files are decoded whatever their encoding; binary files are not text', async () => {
  const { decodeText } = await import('../src/text.js');
  const line = 'Şarj ünitesi ısınıyor, çıkış gerilimi düşük: 4,6 V\n';
  assert.equal(decodeText(Buffer.from(line, 'utf8')), line);
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(line, 'utf8')])), line, 'UTF-8 with a byte-order mark');
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(line, 'utf16le')])), line, 'UTF-16 as Windows tools write it');
  assert.equal(decodeText(Buffer.from('ERROR E21 at 08:14\r\nCOMM timeout\r\n'.repeat(5), 'utf16le')), 'ERROR E21 at 08:14\r\nCOMM timeout\r\n'.repeat(5), 'UTF-16 without a mark');
  // Windows-1254, the old Turkish "ANSI" encoding: ş=0xFE ü=0xFC ı=0xFD ç=0xE7 ğ=0xF0 ö=0xF6 İ=0xDD
  const ansi = Buffer.from([0xde, 0x61, 0x72, 0x6a, 0x20, 0xfc, 0x6e, 0x69, 0x74, 0x65, 0x73, 0x69, 0x20, 0xfd, 0x73, 0xfd, 0x6e, 0xfd, 0x79, 0x6f, 0x72, 0x2c, 0x20, 0xe7, 0xfd, 0x6b, 0xfd, 0xfe]);
  assert.equal(decodeText(ansi), 'Şarj ünitesi ısınıyor, çıkış');
  assert.equal(decodeText(Buffer.from('\u001b[31mERROR\u001b[0m E21\n')), 'ERROR E21\n', 'terminal colour codes are dropped');
  // Not text: a JPEG header with noise, a zip (as .docx files are), random bytes.
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)])), null);
  assert.equal(decodeText(Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.from(Array.from({ length: 400 }, (_, i) => (i * 37) % 256))])), null);
});
