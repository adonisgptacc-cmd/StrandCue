# Accessibility Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce device-observed accessibility evidence (TalkBack, large text, contrast) and fix what it reveals, closing the UX ledger gap to review-ready.

**Architecture:** Three device passes on the Plan A build — TalkBack traversal of auth-to-settings, largest-font rendering check, contrast spot-measurement — each with a findings log; code fallout fixed test-first in `tests/mobile/accessibility.test.ts`; output is an evidence section plus a WCAG 2.2 AA review packet for the external reviewer (D4).

**Tech Stack:** Android TalkBack, system font-size/display-size settings, existing `apps/mobile/src/components` primitives, `tests/mobile/accessibility.test.ts` (4 contracts: labels+roles, 48dp targets, choice states, disabled announcement).

**Spec:** `StrandCue-PRD-v1.1-audit.md`; `docs/verification/device-evidence.md` (Plan A/B output); `tests/mobile/accessibility.test.ts:27-60`; `docs/verification/phase-1-reconciliation.md` (UX row, currently Partial).

## Global Constraints

- Node 24; `npm run verify` exits 0 before and after every task.
- No `allowFontScaling={false}` anywhere in `apps/mobile/src` (today: zero occurrences — Task 2 locks that in as a regression guard).
- Touch targets stay ≥ 48dp; every interactive primitive keeps label + role; findings that weaken these are app-bugs, not accepted deviations.
- HUMAN device passes record observations the same day; screenshots stay local, never committed.
- Consent/account-deletion screens are in scope for every pass (they carry legal weight under POPIA).

---

### Task 1: TalkBack traversal pass

**Files:**
- Modify: `docs/verification/device-evidence.md` (append `## Accessibility (date)`)
- Per finding: owning source file + `tests/mobile/accessibility.test.ts`

**Interfaces:**
- Consumes: installed Plan A/B build; TalkBack enabled (Settings → Accessibility → TalkBack).
- Produces: traversal log with per-screen verdicts; test-first fixes for unlabeled controls.

- [ ] **Step 1: HUMAN — traverse the critical path with TalkBack on**

Screens in order, swipe-navigate only (no sighted taps): signup → signin → recovery request → tab bar (all 7 tabs) → Settings → Privacy choices → Export → Delete account. For each screen record: does every control announce a meaningful label? Does focus order match visual order? Can the back action be reached?

Append:

```markdown
## Accessibility (2026-09-24)

### TalkBack traversal

- Signup: PASS | FAIL — <observation>
- Signin: PASS | FAIL — <observation>
- Recovery request: PASS | FAIL — <observation>
- Tabs (Passport/Services/Activities/Shelf/Tools/History/Settings): PASS | FAIL — <observation>
- Privacy choices: PASS | FAIL — <observation>
- Export: PASS | FAIL — <observation>
- Delete account: PASS | FAIL — <observation>
```

- [ ] **Step 2: Fix each FAIL test-first**

For an unlabeled control, extend `tests/mobile/accessibility.test.ts` with a case naming the exact component file and missing prop (example shape, adapted to the real finding):

```ts
it('announces the privacy toggle purpose and state', () => {
  // render the owning component, assert accessibilityLabel + accessibilityState
});
```

Implement the label in the owning component, run `npx vitest run tests/mobile/accessibility.test.ts`, commit per fix: `fix: TalkBack label for <control>`.

- [ ] **Step 3: Commit the log**

```bash
git add -- docs/verification/device-evidence.md tests/mobile/accessibility.test.ts apps/mobile/src/<fixed-files>
git commit -m "docs: TalkBack traversal evidence with fixes"
```

---

### Task 2: Largest-text rendering pass

**Files:**
- Create: regression guard inside `tests/mobile/accessibility.test.ts` (new `it` block)
- Modify: `docs/verification/device-evidence.md`

**Interfaces:**
- Consumes: device font-size + display-size at maximum (Settings → Display).
- Produces: overflow/truncation log; guard test pinning zero `allowFontScaling={false}`.

- [ ] **Step 1: Add the regression guard (green on arrival — state that in the commit)**

```ts
it('never disables font scaling on text elements', async () => {
  const { readdir: readDir, readFile } = await import('node:fs/promises');
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readDir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) files.push(...await walk(path));
      else if (/\.tsx$/.test(entry.name)) files.push(path);
    }
    return files;
  };
  const files = await walk('apps/mobile/src');
  const contents = await Promise.all(files.map(file => readFile(file, 'utf8')));
  expect(contents.join('\n')).not.toMatch(/allowFontScaling\s*=\s*\{?\s*false/);
});
```

Run: `npx vitest run tests/mobile/accessibility.test.ts` — PASS (zero occurrences today; the guard prevents future regressions).

- [ ] **Step 2: HUMAN — largest-font pass**

Screens: signup, Passport empty state ("Start with what you know."), Settings, Privacy choices, Export, Delete account. Record clipping, overlap, or truncation of interactive controls:

```markdown
### Largest text (font + display size at maximum)

- Signup: PASS | FAIL — <observation>
- Passport empty state: PASS | FAIL — <observation>
- Settings: PASS | FAIL — <observation>
- Privacy choices: PASS | FAIL — <observation>
- Export: PASS | FAIL — <observation>
- Delete account: PASS | FAIL — <observation>
```

FAILs are layout app-bugs: fix with wrapping/scroll (never by disabling scaling), test-first where a unit assertion is possible, else re-verify on device and log.

- [ ] **Step 3: Commit**

```bash
git add -- tests/mobile/accessibility.test.ts docs/verification/device-evidence.md apps/mobile/src/<fixed-files>
git commit -m "docs: largest-text evidence with scaling guard"
```

---

### Task 3: Contrast spot-measurement

**Files:**
- Modify: `docs/verification/device-evidence.md`

**Interfaces:**
- Consumes: screenshots from the Plan A/B build (local only).
- Produces: contrast table against WCAG 2.2 AA thresholds (body text ≥ 4.5:1, large text/UI components ≥ 3:1).

- [ ] **Step 1: HUMAN — measure six pairs**

Use any color-picker/contrast tool on device screenshots. Pairs: body text on card background; heading on card background; button label on button fill (primary + secondary); error text on background; subtitle/hint text on background.

```markdown
### Contrast (WCAG 2.2 AA)

| Pair | Ratio | Threshold | Verdict |
|---|---|---|---|
| Body on card | <n>:1 | 4.5:1 | PASS / FAIL |
| Heading on card | <n>:1 | 4.5:1 | PASS / FAIL |
| Primary button label on fill | <n>:1 | 4.5:1 | PASS / FAIL |
| Secondary button label | <n>:1 | 4.5:1 | PASS / FAIL |
| Error text | <n>:1 | 4.5:1 | PASS / FAIL |
| Subtitle/hint text | <n>:1 | 4.5:1 | PASS / FAIL |
```

- [ ] **Step 2: Fix FAILs as theme changes (test-first where possible)**

Contrast lives in `apps/mobile/src/styles` (or the style constants file owning the pair). If a hex value changes, add/extend a unit test pinning the new value's ratio (compute relative luminance in-test; assert ≥ threshold). Run `npm run verify`, commit per fix: `fix: contrast for <pair>`.

- [ ] **Step 3: Commit**

```bash
git add -- docs/verification/device-evidence.md apps/mobile/src/<theme-files> tests/mobile/<tests>
git commit -m "docs: contrast evidence with fixes"
```

---

### Task 4: WCAG review packet for the external reviewer

**Files:**
- Create: `docs/verification/accessibility-review-packet.md`

**Interfaces:**
- Consumes: evidence sections from Tasks 1–3; D4 security reviewer (Alain Ado) or an external WCAG reviewer.
- Produces: a packet the reviewer can sign without re-doing the device work.

- [ ] **Step 1: Write the packet**

```markdown
# Accessibility review packet (2026-09-24)

Scope: auth, all 7 tabs, Settings incl. privacy/export/deletion.
Device: <model + Android version> · Build: <EAS build ID from device-evidence.md>

- TalkBack traversal: <n PASS / n FAIL fixed in <commits>>
- Largest text: <n PASS / n FAIL fixed in <commits>>
- Contrast: <n PASS / n FAIL fixed in <commits>>
- Open deferrals: <none | list with owner + date>
- Reviewer sign-off: ________________  date: __________
```

- [ ] **Step 2: Run full verify**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add -- docs/verification/accessibility-review-packet.md
git commit -m "docs: accessibility review packet"
```

---

### Task 5: Reconciliation update for the UX gate

**Files:**
- Modify: `docs/verification/phase-1-reconciliation.md` (UX row)

**Interfaces:**
- Consumes: evidence + packet from Tasks 1–4.
- Produces: UX row citing dated device evidence.

- [ ] **Step 1: Update honestly**

UX row moves from Partial toward Implemented, unverified with TalkBack/large-text/contrast evidence cited — but stays out of Proven complete until the external reviewer signs the packet (Beta plan). Any open deferral is named in the gap column.

- [ ] **Step 2: Run the reconciliation contract test**

Run: `npx vitest run tests/tooling/reconciliation.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -- docs/verification/phase-1-reconciliation.md
git commit -m "docs: reconciliation reflects accessibility evidence"
```

## Self-Review

- Spec coverage: TalkBack, large text, contrast, external review — the four ledger gaps — each map to a task. No gaps.
- Placeholder scan: no TBD/TODO; measurement thresholds and evidence formats are literal.
- Type consistency: evidence section headers (`## Accessibility`, `### TalkBack traversal`, etc.) are identical in Tasks 1–3; the packet in Task 4 references those exact headers.
