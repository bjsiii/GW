// CFITOOLS test suite — runs against the real app code loaded by tests.html.
// Unit tests exercise the pure math/will-generation/docx functions exposed on window;
// integration tests drive the actually-rendered <App/> in the hidden #root.

const RESULTS = [];
function check(name, fn){
  try {
    fn();
    RESULTS.push({ name, pass: true });
  } catch (err) {
    RESULTS.push({ name, pass: false, detail: String(err && err.message || err) });
  }
}
function assert(cond, msg){ if(!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(actual, expected, msg){
  if(actual !== expected) throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const clone = o => JSON.parse(JSON.stringify(o));
const labels = bullets => bullets.map(b => b.label);
const byLabel = (bullets, label) => bullets.filter(b => b.label === label);

// ── data builders ────────────────────────────────────────────────────────────
function bwWith(walls, patch){
  const d = clone(window.INITIAL_BW);
  if(walls) d.walls = walls.map((w,i) => ({ id:i+1, n:i+1, length:String(w.length), g:!!w.g, wl:!!w.wl }));
  return Object.assign(d, patch || {});
}
function csWith(walls, patch){
  const d = clone(window.INITIAL_CS);
  if(walls) d.walls = walls.map((w,i) => ({ id:i+1, n:i+1, length:String(w.length), dir:w.dir||'N', cd:!!w.cd, wl:!!w.wl, eb:!!w.eb }));
  return Object.assign(d, patch || {});
}
// 24×12 closed rectangle, all CrawlDrain + EtremeBloc, wall liner on the two long sides
const CS_RECT = [
  { length:24, dir:'N', cd:true, wl:true,  eb:true },
  { length:12, dir:'E', cd:true, wl:false, eb:true },
  { length:24, dir:'S', cd:true, wl:true,  eb:true },
  { length:12, dir:'W', cd:true, wl:false, eb:true },
];

// ── BW math & wills ──────────────────────────────────────────────────────────
check('bw: empty flight plan → zero totals, only standing bullets', () => {
  const r = window.deriveBWBullets(clone(window.INITIAL_BW));
  assertEq(r.gutterLF, 0, 'gutterLF');
  assertEq(r.wlLF, 0, 'wlLF');
  assertEq(r.portsCount, 0, 'portsCount');
  assertEq(labels(r.contractor).join('|'), 'MSP|ACKNOWLEDGEMENT|INITIALS', 'contractor labels');
  assertEq(labels(r.customer).join('|'), 'PARKING|PERSONAL EFFECTS|RESPONSIBILITY|ACKNOWLEDGEMENT|INITIALS', 'customer labels');
});

check('bw: gutter/liner LF sums + auto ports (1 per gutter wall)', () => {
  const r = window.deriveBWBullets(bwWith([
    { length:30, g:true,  wl:true  },
    { length:20, g:true,  wl:false },
    { length:30, g:false, wl:true  },
    { length:20, g:false, wl:false },
  ]));
  assertEq(r.gutterLF, 50, 'gutterLF = 30+20');
  assertEq(r.wlLF, 60, 'wlLF = 30+30');
  assertEq(r.portsCount, 2, 'ports default = # gutter walls');
  assertEq(byLabel(r.contractor,'SYSTEM').length, 1, 'SYSTEM fires when gutterLF>0');
  assertEq(byLabel(r.contractor,'WALL LINER').length, 1, 'WALL LINER fires when wlLF>0');
  assertEq(byLabel(r.contractor,'INSPECTION PORTS').length, 1, 'PORTS fires');
});

check('bw: decimal lengths round up via Math.ceil after summing', () => {
  const r = window.deriveBWBullets(bwWith([
    { length:10.3, g:true }, { length:10.3, g:true },
  ]));
  assertEq(r.gutterLF, 21, 'ceil(20.6) = 21');
});

check('bw: ports qty "0" suppresses ports (explicit zero respected)', () => {
  const d = bwWith([{ length:30, g:true }]);
  d.items.ports.qty = '0';
  const r = window.deriveBWBullets(d);
  assertEq(r.portsCount, 0, 'explicit 0 wins over auto count');
  assertEq(byLabel(r.contractor,'INSPECTION PORTS').length, 0, 'no PORTS bullet');
});

check('bw: ports qty manual override', () => {
  const d = bwWith([{ length:30, g:true }]);
  d.items.ports.qty = '6';
  assertEq(window.deriveBWBullets(d).portsCount, 6);
});

check('bw: SYSTEM defaults read Triple pump + battery backup', () => {
  const r = window.deriveBWBullets(bwWith([{ length:30, g:true }]));
  const sys = byLabel(r.contractor,'SYSTEM')[0];
  assert(/triple primary sump pump and battery backup/.test(sys.text), 'default triple+BBU: ' + sys.text);
  assert(/perimeter drain system/.test(sys.text), 'perimeter wording');
});

check('bw: partial coverage flips wording and appends recommendation', () => {
  const r = window.deriveBWBullets(bwWith([{ length:30, g:true }], { coverage:'partial' }));
  const sys = byLabel(r.contractor,'SYSTEM')[0];
  assert(/partial drain system/.test(sys.text), 'partial wording');
  assert(/recommends a full perimeter system/.test(sys.text), 'recommendation appended');
});

check('bw: single pump, no BBU wording', () => {
  const d = bwWith([{ length:30, g:true }]);
  d.items.pump.variant = 'single'; d.items.pump.bbu = false;
  const sys = byLabel(window.deriveBWBullets(d).contractor,'SYSTEM')[0];
  assert(/single primary sump pump in the area/.test(sys.text), 'single, no BBU: ' + sys.text);
  assert(!/battery backup/.test(sys.text), 'no BBU text');
});

check('bw: secondary pump bullet with variant + BBU', () => {
  const d = bwWith([{ length:30, g:true }]);
  d.items.pumpSec = { checked:true, variant:'triple', bbu:true };
  const sec = byLabel(window.deriveBWBullets(d).contractor,'SUMP PUMP — SECONDARY')[0];
  assert(sec, 'secondary bullet fires');
  assert(/triple secondary sump pump as backup, including a battery backup unit/.test(sec.text), sec.text);
});

check('bw: Liquid Nails warning on all 6 demo bullets, not on stairs', () => {
  const d = bwWith([{ length:30, g:true }]);
  ['dwC_half','dwC_full','ctC','dwH_half','dwH_full','ctH','stairsC'].forEach(k => d.items[k].checked = true);
  const r = window.deriveBWBullets(d);
  const all = r.contractor.concat(r.customer);
  const ln = all.filter(b => /Liquid Nails/.test(b.text));
  assertEq(ln.length, 6, 'exactly the 6 drywall/cut-through bullets carry the warning');
  const stairs = byLabel(r.contractor,'CONTRACTOR DEMOLITION — STAIRS')[0];
  assert(stairs && !/Liquid Nails/.test(stairs.text), 'stairs bullet has no Liquid Nails');
});

check('bw: customer bullet ordering (PARKING/PE top, RESP/ACK/INITIALS bottom)', () => {
  const d = bwWith([{ length:30, g:true }]);
  d.items.digsafe.checked = true; d.items.elecH.checked = true;
  const l = labels(window.deriveBWBullets(d).customer);
  assertEq(l[0], 'PARKING'); assertEq(l[1], 'PERSONAL EFFECTS');
  assertEq(l[l.length-3], 'RESPONSIBILITY');
  assertEq(l[l.length-2], 'ACKNOWLEDGEMENT');
  assertEq(l[l.length-1], 'INITIALS');
});

// ── CS math & wills ──────────────────────────────────────────────────────────
check('cs: closed 24×12 rectangle — LF and SF totals', () => {
  const r = window.deriveCSBullets(csWith(CS_RECT, { height:'4' }));
  assertEq(r.cdLF, 72, 'CrawlDrain LF = perimeter 72');
  assertEq(r.wlSF, 192, 'wall liner SF = (24+24)×4');
  assertEq(r.etremeblocSF, 288, 'EtremeBloc SF = 72×4');
  assertEq(r.floorSF, 288, 'floor SF = 24×12');
  assertEq(r.floorOrderSF, 288, 'no overage → order = floor');
  assertEq(r.overagePct, 0);
});

check('cs: overage 3% applied to floor products only, before ceil', () => {
  const r = window.deriveCSBullets(csWith(CS_RECT, { height:'4', overage:'3' }));
  assertEq(r.floorSF, 288, 'display SF unchanged');
  assertEq(r.floorOrderSF, 297, 'ceil(288×1.03) = 297');
  assertEq(r.wlSF, 192, 'overage must not touch wall liner');
  assertEq(r.etremeblocSF, 288, 'overage must not touch EtremeBloc');
});

check('cs: overage clamped to 5%', () => {
  const r = window.deriveCSBullets(csWith(CS_RECT, { overage:'9' }));
  assertEq(r.overagePct, 5, 'clamped');
  assertEq(r.floorOrderSF, 303, 'ceil(288×1.05) = 303');
});

check('cs: L-shape floor area (shoelace)', () => {
  const r = window.deriveCSBullets(csWith([
    { length:24, dir:'N', cd:true }, { length:12, dir:'E', cd:true },
    { length:12, dir:'S', cd:true }, { length:12, dir:'E', cd:true },
    { length:12, dir:'S', cd:true }, { length:24, dir:'W', cd:true },
  ]));
  assertEq(r.floorSF, 432, '24×24 − 12×12 = 432');
});

check('cs: open shape auto-closes for area', () => {
  const r = window.deriveCSBullets(csWith(CS_RECT.slice(0,3)));
  assertEq(r.floorSF, 288, 'missing W wall still closes 24×12');
});

check('cs: calcCSFloorSF direct — unit square scaled', () => {
  const sq = [
    { length:'10', dir:'N' }, { length:'10', dir:'E' },
    { length:'10', dir:'S' }, { length:'10', dir:'W' },
  ];
  assertEq(window.calcCSFloorSF(sq), 100);
});

check('cs: empty flight plan → zero totals, no SYSTEM bullet', () => {
  const r = window.deriveCSBullets(clone(window.INITIAL_CS));
  assertEq(r.cdLF, 0); assertEq(r.floorSF, 0);
  assertEq(byLabel(r.contractor,'SYSTEM').length, 0);
});

check('cs: blank height falls back to 4 ft in SF math (documented behavior)', () => {
  const r = window.deriveCSBullets(csWith(CS_RECT, { height:'' }));
  assertEq(r.wlSF, 192, 'blank height treated as 4');
});

check('cs: EtremeBloc follows its own EB column, not CD or WL', () => {
  const r = window.deriveCSBullets(csWith([
    { length:24, dir:'N', cd:true,  wl:true, eb:true  },
    { length:12, dir:'E', cd:true,  wl:false, eb:false },
    { length:24, dir:'S', cd:false, wl:true, eb:true  },
    { length:12, dir:'W', cd:true,  wl:false, eb:false },
  ], { height:'4' }));
  assertEq(r.etremeblocSF, 192, 'EB walls only: (24+24)×4, CD/WL ignored');
  assertEq(byLabel(r.contractor,'ETREMEBLOC INSULATION').length, 1, 'bullet fires from EB walls');
});

check('cs: no EB walls → no EtremeBloc SF or bullet, even with full CrawlDrain', () => {
  const walls = CS_RECT.map(w => ({ ...w, eb:false }));
  const r = window.deriveCSBullets(csWith(walls, { height:'4' }));
  assertEq(r.etremeblocSF, 0, 'no EB walls → 0 SF');
  assertEq(byLabel(r.contractor,'ETREMEBLOC INSULATION').length, 0, 'no bullet');
  assertEq(r.cdLF, 72, 'CrawlDrain unaffected');
});

check('cs: WALL LINER bullet fires from WL wall checkboxes alone', () => {
  const r = window.deriveCSBullets(csWith([{ length:20, dir:'N', wl:true }]));
  assertEq(byLabel(r.contractor,'WALL LINER').length, 1);
});

check('cs: dehumidifier gravity vs condensate variants', () => {
  const d1 = csWith(CS_RECT); d1.items.dehum.checked = true;
  const g = byLabel(window.deriveCSBullets(d1).contractor,'DEHUMIDIFIER')[0];
  assert(/gravity drain/.test(g.text), 'gravity variant');
  const d2 = csWith(CS_RECT); d2.items.dehum.checked = true; d2.items.dehumCond.checked = true;
  const c = byLabel(window.deriveCSBullets(d2).contractor,'DEHUMIDIFIER')[0];
  assert(/condensate pump/.test(c.text), 'condensate variant');
});

// ── Cover & Move overview ────────────────────────────────────────────────────
check('overview: BW section — gutter LF, pump when system exists, wall liner', () => {
  const bw = bwWith([{ length:30, g:true, wl:true }]);
  const bwD = window.deriveBWBullets(bw);
  const ov = window.buildOverview('bulkhead', 'notes', bw, null, bwD, null);
  assert(ov.includes('through the bulkhead.'), 'access sentence');
  assert(ov.includes('BasementGutter: 30 LF'), 'gutter line');
  assert(/Primary sump pump \(Triple, w\/ BBU\): 1/.test(ov), 'pump line follows system');
  assert(ov.includes('Wall liner: 30 LF'), 'wall liner line');
});

check('overview: CS wall liner appears when WL walls are set (FINAL parity)', () => {
  const cs = csWith(CS_RECT, { height:'4' });
  const csD = window.deriveCSBullets(cs);
  const ov = window.buildOverview('', '', null, cs, null, csD);
  assert(csD.wlSF === 192, 'precondition: FINAL shows 192 SF');
  assert(ov.includes('Wall liner (SF): 192 SF'), 'overview must list the wall liner the FINAL view shows. Got:\n' + ov);
});

check('overview: CS pump only when checked', () => {
  const cs = csWith(CS_RECT);
  const ov1 = window.buildOverview('', '', null, cs, null, window.deriveCSBullets(cs));
  assert(!/Primary sump pump/.test(ov1), 'unchecked → absent');
  cs.items.pump.checked = true;
  const ov2 = window.buildOverview('', '', null, cs, null, window.deriveCSBullets(cs));
  assert(/Primary sump pump \(Triple, w\/ BBU\): 1/.test(ov2), 'checked → present');
});

check('overview: CS floor products use overage-adjusted order SF', () => {
  const cs = csWith(CS_RECT, { overage:'3' });
  cs.items.crawlLiner.checked = true; cs.items.drainMat.checked = true;
  const ov = window.buildOverview('', '', null, cs, null, window.deriveCSBullets(cs));
  assert(ov.includes('CrawlLiner: 297 SF'), 'CrawlLiner order SF');
  assert(ov.includes('Drainage Mat: 297 SF'), 'Drainage Mat order SF');
});

// ── DOCX generation ──────────────────────────────────────────────────────────
const DOCX_FIELDS = {
  customer:'Jane & John Doe', phone:'508-555-1234', address:'123 Main St, Franklin, MA',
  today:'Jul 2, 2026', why:'Water in basement <every> "spring"', expectations:'Line one\nLine two',
  overview:'[ACCESS]\nthrough the bulkhead', hazards:'Low joists & wiring', foreman:'',
  depositStr:'Check, Card', finalStr:'24-mo Financing',
};

check('docx: document.xml is well-formed XML with fields escaped', () => {
  const xml = window.buildCoverMoveDocXml(DOCX_FIELDS);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  assertEq(doc.getElementsByTagName('parsererror').length, 0, 'XML parse error');
  assert(xml.includes('Jane &amp; John Doe'), 'ampersand escaped');
  assert(xml.includes('&lt;every&gt;'), 'angle brackets escaped');
  assert(xml.includes('Deposit:       Check, Card'), 'deposit line');
  assert(xml.includes('Final Payment: 24-mo Financing'), 'final payment line');
});

check('docx: every <w:br/> lives inside a run (OOXML schema)', () => {
  const xml = window.buildCoverMoveDocXml(DOCX_FIELDS);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const brs = doc.getElementsByTagNameNS(W, 'br');
  assert(brs.length > 0, 'multiline content should produce breaks');
  for(let i = 0; i < brs.length; i++){
    assertEq(brs[i].parentNode.localName, 'r', `w:br #${i} parent must be w:r, got w:${brs[i].parentNode.localName}`);
  }
});

check('docx: zip container — signatures, 4 entries, document.xml present', async0 => {
  const xml = window.buildCoverMoveDocXml(DOCX_FIELDS);
  const blob = window.buildDocxBlob(xml);
  assert(blob.size > 500, 'plausible size');
  // synchronous read via FileReaderSync unavailable on main thread — stash for async phase
  window.__DOCX_BLOB__ = blob;
});

// ── Autosave store & download guard ─────────────────────────────────────────
check('store: saved job round-trips; wrong version and garbage are rejected', () => {
  const { JOB_KEY, loadSavedJob } = window.__CFI_STORE__;
  const payload = { v:1, savedAt: 123, customer:'Jane', address:'1 Elm St', phone:'', active:{bw:true,cs:false,fr:false,cl:false} };
  localStorage.setItem(JOB_KEY, JSON.stringify(payload));
  assertEq(loadSavedJob().customer, 'Jane', 'round-trip');
  localStorage.setItem(JOB_KEY, JSON.stringify({ ...payload, v: 99 }));
  assertEq(loadSavedJob(), null, 'future schema version rejected');
  localStorage.setItem(JOB_KEY, '{not json');
  assertEq(loadSavedJob(), null, 'garbage rejected');
  localStorage.removeItem(JOB_KEY);
});

check('store: mergeState fills keys an older save is missing', () => {
  const { mergeState } = window.__CFI_STORE__;
  const oldSave = { height:'6', items: { pump: { checked:true, variant:'single', bbu:false } } };
  const merged = mergeState(clone(window.INITIAL_CS), oldSave);
  assertEq(merged.height, '6', 'saved value wins');
  assertEq(merged.items.pump.variant, 'single', 'saved item wins');
  assert(merged.items.crawlLiner, 'missing items filled from defaults');
  assertEq(merged.overage, 0, 'missing top-level keys filled from defaults');
  const mergedCm = mergeState(clone(window.INITIAL_CM), { access:'bulkhead', pay:{ depCard:true } });
  assertEq(mergedCm.pay.depCard, true, 'saved pay wins');
  assertEq(mergedCm.pay.finCard, true, 'missing pay keys filled from defaults');
});

check('guard: unconfirmed requireds, empty systems, and TBD all warn', () => {
  const bw = bwWith([{ length:30, g:true }]);
  const bwD = window.deriveBWBullets(bw);
  let w = window.collectDownloadWarnings(bw, null, bwD, null, 'AquaGrate: TBD LF');
  assert(w.some(x => /BW: Utilities Protection/.test(x)), 'utilities warn');
  assert(w.some(x => /BW: Permit B/.test(x)), 'permit warn');
  assert(w.some(x => /TBD/.test(x)), 'TBD warn');
  assert(!w.some(x => /0 LF/.test(x)), 'no 0-LF warn when gutter exists');
  const csEmpty = clone(window.INITIAL_CS);
  w = window.collectDownloadWarnings(null, csEmpty, null, window.deriveCSBullets(csEmpty), '');
  assert(w.some(x => /CS is active but CrawlDrain is 0 LF/.test(x)), 'empty CS system warns');
});

check('guard: fully confirmed job produces no warnings', () => {
  const bw = bwWith([{ length:30, g:true }]);
  bw.items.util.checked = true; bw.items.permit.checked = true;
  const w = window.collectDownloadWarnings(bw, null, window.deriveBWBullets(bw), null, '[ACCESS]\nall good');
  assertEq(w.length, 0, 'no warnings, got: ' + JSON.stringify(w));
});

// ── Assessor address parsing / phone format ──────────────────────────────────
check('parse: comma-delimited town', () => {
  assertEq(window.parseAddressTown('123 Main St, Franklin, MA 02038'), 'franklin');
});
check('parse: two-word town with commas', () => {
  assertEq(window.parseAddressTown('45 Oak St, Fall River, MA'), 'fall river');
});
check('parse: two-word town without commas', () => {
  assertEq(window.parseAddressTown('45 Oak St Fall River MA'), 'fall river');
});
check('parse: town at end beats town-named street (no commas)', () => {
  assertEq(window.parseAddressTown('10 Providence St Worcester MA'), 'worcester');
});
check('parse: unknown town yields no assessor URL', () => {
  const t = window.parseAddressTown('1 Elm St, Springfield, MA');
  assert(!t || !window.ASSESSOR_MAP[t], 'springfield not in map → button stays disabled');
});
check('parse: nereval towns all use SearchInfo.aspx', () => {
  const bad = Object.entries(window.ASSESSOR_MAP)
    .filter(([,u]) => u.includes('nereval.com') && !u.includes('SearchInfo.aspx'));
  assertEq(bad.length, 0, 'inconsistent nereval URLs: ' + JSON.stringify(bad));
});
check('phone: formats and caps at 10 digits', () => {
  assertEq(window.formatPhone('5085551234'), '508-555-1234');
  assertEq(window.formatPhone('508555'), '508-555');
  assertEq(window.formatPhone('508'), '508');
  assertEq(window.formatPhone('50855512349999'), '508-555-1234');
});

// ── Integration: drive the real rendered app ─────────────────────────────────
const tick = (ms=40) => new Promise(r => setTimeout(r, ms));
function setInput(el, value){
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
async function checkAsync(name, fn){
  try { await fn(); RESULTS.push({ name, pass: true }); }
  catch (err) { RESULTS.push({ name, pass: false, detail: String(err && err.message || err) }); }
}

async function runIntegration(){
  await tick(100); // let the concurrent root flush the initial render

  await checkAsync('app: renders shell (job info bar + product bar + tabs)', async () => {
    assert(document.querySelector('#root .jib'), 'job info bar');
    assert(document.querySelector('#root .pbar'), 'product bar');
    assert(document.querySelectorAll('#root .main-tab').length === 2, 'two main tabs');
  });

  await checkAsync('app: FR/CL are disabled "coming soon" toggles', async () => {
    const fr = document.querySelector('.pbtn.fr'), cl = document.querySelector('.pbtn.cl');
    assert(fr && fr.disabled, 'FR disabled');
    assert(cl && cl.disabled, 'CL disabled');
  });

  await checkAsync('app: toggling BW shows FlightPlan sections expanded + output block', async () => {
    document.querySelector('.pbtn.bw').click();
    await tick();
    assert(document.getElementById('out-bw'), 'BW output block appears');
    const heightInput = Array.from(document.querySelectorAll('.rail input')).length;
    assert(heightInput > 0, 'walls/system sections render expanded (inputs visible)');
  });

  await checkAsync('app: wall LF entry flows to output materials', async () => {
    const wallInputs = document.querySelectorAll('.rail .wtbl input[inputmode="decimal"]');
    assert(wallInputs.length >= 4, 'four wall rows');
    setInput(wallInputs[0], '30');
    await tick();
    const gCheck = document.querySelector('.rail .wtbl input.chkbox.g');
    gCheck.click();
    await tick();
    const matl = document.querySelector('#out-bw .matl').textContent;
    assert(matl.includes('30 LF'), 'BasementGutter 30 LF in materials, got: ' + matl.slice(0,200));
  });

  await checkAsync('app: CS wall table renders EB column; preset flows to EtremeBloc SF', async () => {
    document.querySelector('.pbtn.cs').click();
    await tick();
    // rail switches to CS via the sub-tab when 2+ products active
    const csTab = document.querySelector('.rail-tab.cs');
    if(csTab){ csTab.click(); await tick(); }
    const headers = Array.from(document.querySelectorAll('.rail .wtbl th')).map(th => th.textContent);
    assert(headers.includes('EB'), 'EB header present, got: ' + headers.join(','));
    assert(document.querySelector('.rail .wtbl input.chkbox.eb'), 'EB checkbox rendered');
    // rectangle preset checks EB on all walls → 72×4 = 288 SF in the rail readout
    const preset = Array.from(document.querySelectorAll('.rail button')).find(b => /Rectangle Preset/.test(b.textContent));
    preset.click();
    await tick();
    const ebRow = () => Array.from(document.querySelectorAll('.rail .fp-item'))
      .find(el => el.textContent.includes('EtremeBloc'));
    assert(ebRow(), 'EtremeBloc row present');
    assert(ebRow().textContent.includes('0 SF'), 'preset defaults EB off → 0 SF, got: ' + ebRow().textContent);
    // opt the N24 and E12 walls in → (24+12)×4 = 144 SF
    const ebBoxes = document.querySelectorAll('.rail .wtbl input.chkbox.eb');
    ebBoxes[0].click(); await tick();
    ebBoxes[1].click(); await tick();
    assert(ebRow().textContent.includes('144 SF'), 'two walls opted in → 36×4 = 144 SF, got: ' + ebRow().textContent);
    // reset app state for the following tests (dirty job → needs a name to file)
    setInput(document.querySelector('#cust'), 'EB Test');
    await tick();
    document.querySelector('.btn-reset').click();
    await tick(80);
  });

  await checkAsync('app: New Customer resets Cover & Move fields', async () => {
    // fill a Cover & Move field
    const cmTab = document.querySelectorAll('.main-tab')[1];
    cmTab.click();
    await tick();
    const access = document.querySelector('input[placeholder^="e.g. side gate"]');
    assert(access, 'site access input present');
    setInput(access, 'bulkhead');
    await tick();
    assertEq(access.value, 'bulkhead', 'typed value stuck');
    // switch away and back — must survive (prior HIGH fix)
    document.querySelectorAll('.main-tab')[0].click(); await tick();
    document.querySelectorAll('.main-tab')[1].click(); await tick();
    const access2 = document.querySelector('input[placeholder^="e.g. side gate"]');
    assertEq(access2.value, 'bulkhead', 'value survives tab switch');
    // dirty job + no customer name → New Customer must REFUSE (no silent data loss)
    document.querySelector('.btn-reset').click();
    await tick(80);
    assertEq(document.querySelector('input[placeholder^="e.g. side gate"]').value, 'bulkhead',
      'nameless dirty job is NOT cleared by New Customer');
    const dlg = document.querySelector('[data-cfi-dialog]');
    assert(dlg, 'in-app dialog shown (not native alert)');
    assert(/customer name/i.test(dlg.textContent), 'dialog explains the name requirement');
    dlg.querySelector('[data-cfi-confirm]').click();
    await tick();
    assert(!document.querySelector('[data-cfi-dialog]'), 'dialog dismissed');
    // with a name, New Customer files the job and clears everything
    setInput(document.querySelector('#cust'), 'CM Test');
    await tick();
    document.querySelector('.btn-reset').click();
    await tick(80);
    const access3 = document.querySelector('input[placeholder^="e.g. side gate"]');
    assertEq(access3.value, '', 'named job files and Cover & Move clears');
    const hist = JSON.parse(localStorage.getItem(window.__CFI_STORE__.HIST_KEY));
    assert(hist[0].customer === 'CM Test' && hist[0].cm.access === 'bulkhead',
      'CM-only job was archived with its fields, not discarded');
  });

  await checkAsync('app: autosave persists, New Customer archives to history, restore brings it back', async () => {
    const { JOB_KEY, HIST_KEY } = window.__CFI_STORE__;
    setInput(document.querySelector('#cust'), 'Test Person');
    document.querySelector('.pbtn.bw').click(); // products were reset off above
    await tick();
    const wallInput = document.querySelector('.rail .wtbl input[inputmode="decimal"]');
    setInput(wallInput, '42');
    await tick(400); // let the 250ms autosave debounce flush
    const saved = JSON.parse(localStorage.getItem(JOB_KEY));
    assertEq(saved.customer, 'Test Person', 'autosaved customer');
    assert(saved.bwData.walls.some(w => w.length === '42'), 'autosaved wall length');
    assert(saved.active.bw, 'autosaved active products');
    // New Customer archives the job and clears the form
    document.querySelector('.btn-reset').click();
    await tick(400);
    const hist = JSON.parse(localStorage.getItem(HIST_KEY));
    assert(hist.length >= 1 && hist[0].customer === 'Test Person', 'history[0] is the archived job');
    assertEq(document.querySelector('#cust').value, '', 'form cleared after archive');
    // restore it from the Jobs dropdown
    const jobsBtn = document.querySelector('.btn-jobs');
    assert(jobsBtn, 'Jobs button visible once history exists');
    jobsBtn.click(); await tick();
    const item = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Test Person'));
    assert(item, 'history item listed in dropdown');
    item.click(); await tick(100);
    assertEq(document.querySelector('#cust').value, 'Test Person', 'restore rehydrates the job');
    const restoredWall = document.querySelector('.rail .wtbl input[inputmode="decimal"]');
    assertEq(restoredWall.value, '42', 'restored wall length back in the table');
  });

  await checkAsync('dialog: cfiConfirm resolves true on confirm, false on cancel and overlay click', async () => {
    let p = window.cfiConfirm({ title:'T', message:'M', confirmText:'Yes' });
    let dlg = document.querySelector('[data-cfi-dialog]');
    assert(dlg, 'confirm dialog rendered');
    assert(dlg.querySelector('[data-cfi-cancel]'), 'has a cancel button');
    dlg.querySelector('[data-cfi-confirm]').click();
    assertEq(await p, true, 'confirm → true');

    p = window.cfiConfirm({ title:'T', message:'M' });
    document.querySelector('[data-cfi-dialog] [data-cfi-cancel]').click();
    assertEq(await p, false, 'cancel → false');

    p = window.cfiConfirm({ title:'T', message:'M' });
    dlg = document.querySelector('[data-cfi-dialog]');
    dlg.dispatchEvent(new MouseEvent('click', { bubbles:true })); // click the backdrop itself
    assertEq(await p, false, 'overlay click → false');

    p = window.cfiAlert({ title:'T', message:'<b>escaped?</b>' });
    dlg = document.querySelector('[data-cfi-dialog]');
    assert(!dlg.querySelector('b'), 'message HTML is escaped');
    assert(!dlg.querySelector('[data-cfi-cancel]'), 'alert has no cancel button');
    dlg.querySelector('[data-cfi-confirm]').click();
    await p;
    assert(!document.querySelector('[data-cfi-dialog]'), 'no dialog left behind');
  });

  await checkAsync('docx: zip container bytes (async read)', async () => {
    const blob = window.__DOCX_BLOB__;
    assert(blob, 'blob was built');
    const buf = new Uint8Array(await blob.arrayBuffer());
    const u32 = off => (buf[off] | buf[off+1]<<8 | buf[off+2]<<16 | buf[off+3]<<24) >>> 0;
    const u16 = off => (buf[off] | buf[off+1]<<8);
    assertEq(u32(0), 0x04034b50, 'local file header signature');
    assertEq(u32(buf.length-22), 0x06054b50, 'EOCD signature at end');
    assertEq(u16(buf.length-22+10), 4, 'EOCD says 4 entries');
    const text = new TextDecoder('latin1').decode(buf);
    ['[Content_Types].xml','_rels/.rels','word/_rels/document.xml.rels','word/document.xml']
      .forEach(n => assert(text.includes(n), 'zip contains ' + n));
  });

  report();
}

function report(){
  const passed = RESULTS.filter(r => r.pass).length;
  const failed = RESULTS.length - passed;
  const lines = RESULTS.map(r =>
    (r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '\n      ' + r.detail : ''));
  document.getElementById('test-results').innerHTML = lines
    .map(l => `<div class="${l.startsWith('PASS') ? 'pass' : 'fail'}">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>`).join('');
  const summary = `CFITOOLS-TESTS: ${passed} passed, ${failed} failed, ${RESULTS.length} total`;
  document.getElementById('test-summary').textContent = summary;
  document.title = summary;
  window.__TESTS_DONE__ = true;
}

runIntegration();
