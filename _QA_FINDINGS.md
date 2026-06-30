# GW Demo-Readiness Audit — Findings

Generated 2026-06-30 via 6-dimension fan-out audit (45 agents, 39 confirmed findings, 0 false positives).
All findings verified against source in `_src/app/`. Severity = **demo impact**, not code purity.

Verdict: **GO for demo.** Core back-wiring is intact (toggles → flight plan → outputs flow correctly,
single source of truth, no crashes, valid .docx). Fix the 2 HIGH items before stage; the rest is polish.

---

## 🔴 HIGH — fix before demo (the two "looks broken on stage" issues)

### 1. FlightPlan sections start COLLAPSED (inverted default)
- **File:** `SectionLabel.jsx:4` — `defaultCollapsed=true`
- **Problem:** The author passes `defaultCollapsed` only on *secondary* sections; primary ones (Walls, System,
  Electrical, Required) omit it and inherit `true`. So when you toggle BW/CS on, the whole rail renders
  collapsed — including the Walls length-entry table and the System LF readout.
- **On stage:** Click BW → FlightPlan looks empty; you must hand-expand every section to type wall lengths.
- **Fix:** Change `SectionLabel` signature to `defaultCollapsed=false` (so omitting = expanded), **or** add
  `defaultCollapsed={false}` to the Walls + System SectionLabels in both FlightPlanBW and FlightPlanCS.
  *(Confirm intended accordion behavior first.)*

### 2. Cover & Move inputs RESET on every tab switch
- **File:** `App.jsx:524` — `{mainTab === 'cm' && <CoverMove .../>}` (conditional unmount)
- **Problem:** CoverMove holds all its fields (Site Access, Notes, Hazards, Foreman, 8 Payment checkboxes,
  etc.) in component-local state. Switching to the Flight Plan FINAL tab unmounts it; returning wipes
  everything and silently reverts payment toggles to Check/Card defaults.
- **On stage:** Fill out Cover & Move → switch to FINAL to show scope → come back → form is blank, payment
  flipped back. Hit Download and the .docx comes out wrong.
- **Fix:** Lift CoverMove's field state up into `App` (alongside `bwData`/`csData`), **or** keep it mounted and
  hide with CSS (`display:none`) instead of conditionally unmounting.

---

## 🟠 MEDIUM — fix if time allows (visible contradictions / polish)

### 3. BW SYSTEM "will" wired to gutter length, not the pump checkbox
- **File:** `App.jsx:143` (vs CS does it right at `App.jsx:268`)
- The SYSTEM bullet asserts "…with a single primary sump pump" whenever `gutterLF > 0`, but the pump
  *material line* is gated on `items.pump.checked`. Pump defaults unchecked, so the most natural demo path
  (type wall lengths, tick G boxes) makes the will-text claim a pump the material list doesn't show — the
  flagship BW output panel contradicts itself, and unchecking the pump doesn't change the will text.
- **Fix:** Gate the BW SYSTEM bullet's pump wording on `items.pump?.checked` like CS does (or auto-check pump
  when `gutterLF>0`), and mirror into the materials list (`App.jsx:470`).

### 4. Cover & Move overview hard-codes a Primary pump even when unselected
- **File:** `CoverMove.jsx:18` (and CS at `:33`)
- `buildOverview` pushes "Primary sump pump: 1" unconditionally while every other line is `if(...checked)`
  guarded. The FINAL panel gates it on `pump.checked`. So the auto-filled Installation Overview (and the
  downloaded .docx) lists a pump that isn't in the FINAL estimate.
- **Fix:** Wrap the pump lines in the same `if(...checked)` guard as their neighbors.

### 5. East Providence assessor link is almost certainly broken
- **File:** `JobInfoBar.jsx:217` — uses `Search.aspx`; all 17 other nereval towns use `SearchInfo.aspx`
- **Fix:** One-character change → `SearchInfo.aspx`, then click-test live.

### 6. Ships React DEVELOPMENT builds + in-browser Babel
- **Files:** `vendor/react.development.js`, `vendor/3acf75fe.js` (react-dom dev), `vendor/cf21904c.js` (Babel standalone)
- Dev builds spray console warnings ("Download React DevTools…", in-browser Babel warning) if a judge opens
  DevTools, and add transpile overhead. Nothing breaks; it just reads as "not production ready."
- **Fix:** Swap to `react.production.min.js` / `react-dom.production.min.js`; ideally precompile JSX and drop
  the `text/babel` Babel-standalone path. No app-code changes needed.

### 7. "Copy All Wills" buttons silently fail over file://
- **File:** `App.jsx:360` — uses `navigator.clipboard` with no fallback (unlike `WillBlock.jsx:25`)
- `navigator.clipboard` is undefined when index.html is opened via `file://`. The multi-product "Copy All
  Contractor/Customer Wills" buttons (a likely wow-moment) do nothing — no copy, no feedback.
- **Fix:** Serve the demo over `http://localhost`, **or** add the `execCommand` textarea fallback WillBlock
  already uses. (Same applies to the assessor address-copy at `JobInfoBar.jsx:315`.)

---

## 🟡 LOW — nice-to-have cleanups (won't hurt a scripted demo)

| # | Issue | File |
|---|-------|------|
| 8 | "Required" section warning pill (⚠ missing Utilities/Permit) never renders — pill only shows when `count>0`, but Required passes `warn` with no `count` | `SectionLabel.jsx:10`, `FlightPlan.jsx:189/353` |
| 9 | System count badge can stay inflated by a hidden sub-item (`airCond`/`dehumCond` not cleared when parent unchecked) | `FlightPlan.jsx:27/229` |
| 10 | Orphaned `wallLF` dead variable in both FlightPlans (refactor leftover) | `FlightPlan.jsx:11/224` |
| 11 | WillBlock empty-state "[W] badge" hint is unreachable (bullets never empty) | `WillBlock.jsx:47` |
| 12 | Inspection-ports qty can't be set to 0 (`parseInt(0)||fallback`) | `FlightPlan.jsx:15` |
| 13 | No PDF/print path exists — output is .docx + clipboard only (see note below) | `CoverMove.jsx:204` |
| 14 | DOCX Installation Overview omits Additional/Side discharge + demolition items the FINAL view shows | `CoverMove.jsx:24` |
| 15 | Checked-but-blank qty prints literal "? LF" in docx and FINAL view | `CoverMove.jsx:22`, `App.jsx:473+` |
| 16 | CS secondary pump variant (Single/Triple) dropped in DOCX overview | `CoverMove.jsx:34` |
| 17 | Negative wall length silently subtracts from LF/SF totals (unguarded text input) | `WallTable.jsx:37` |
| 18 | No `inputMode` on numeric/phone fields → QWERTY keyboard on tablet | `WallTable.jsx:37`, `JobInfoBar.jsx:333` |
| 19 | Blank CS Height computes SF using default 4, not 0 (UI vs math disagree) | `App.jsx:254` |
| 20 | Phone field caret jumps to end on mid-string edits (reformat-on-keystroke) | `JobInfoBar.jsx:333` |
| 21 | `window.open` for assessor lookup omits `noopener,noreferrer` (security-review flag) | `JobInfoBar.jsx:314` |
| 22 | ~30 assessor links are `http://` (browser "Not Secure"); MA equivalents use https | `JobInfoBar.jsx` (Cape Cod + RI block) |
| 23 | Freetown link drops `www.` subdomain its peers use | `JobInfoBar.jsx:31` |
| 24 | No-comma addresses can match a street name as the town (longest-substring) | `JobInfoBar.jsx:275` |
| 25 | FR/CL "coming soon" products visible — decide roadmap framing vs hide | `ProductBar.jsx:5`, `App.jsx:411-420` |
| 26 | Assessor lookup opens live municipal sites — pre-pick a known-good town for the demo | `JobInfoBar.jsx:314` |

## ⚪ POLISH — only a source-reading judge would notice
- Lowercase `single`/`triple` renders next to capitalized "Single" dropdown — `FlightPlan.jsx:46` etc.
- Access door shows stray "0" when unchecked — `FlightPlan.jsx:310`
- CS Access door qty locked at 1 (no input) — `FlightPlan.jsx:307`
- BW Height collected but unused in BW math — `FlightPlan.jsx:38`
- `setRailProd` called inside `setActive` updater (impure; harmless, no StrictMode) — `App.jsx:337`
- CoverMove auto-overview effect re-runs each App render (no loop; identity smell) — `CoverMove.jsx:71`
- `para()` would emit invalid OOXML if bold+color combined (dead branch today) — `CoverMove.jsx:87`
- Exeter deep-links to Search.aspx; Hopkinton uses next.axisgis.com (style outliers) — `JobInfoBar.jsx:235/97`

---

## ⚠️ Note on "PDF outputs"
There is **no PDF or print path anywhere** in the app. The only generated artifact is a **`.docx`** (Word)
download from Cover & Move, plus clipboard copies of the wills. If a judge asks "can it hand the customer a
PDF on site?" the honest answer today is no — they'd open the .docx and export. **Decide before submitting:**
either add a `window.print()` button + print CSS on the FINAL view (instant browser Save-as-PDF), or reframe
the pitch around Word/.docx output so the demo claim matches reality.
