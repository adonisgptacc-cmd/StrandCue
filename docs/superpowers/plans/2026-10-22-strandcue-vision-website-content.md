# StrandCue Vision Website Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present the complete intended StrandCue experience on the public homepage while clearly distinguishing technical-alpha, in-development and planned capabilities.

**Architecture:** Keep the website as static semantic HTML and CSS with no JavaScript, third-party resources, forms or analytics. Replace the record-only homepage narrative with a specification-derived product story and status model, then extend existing content tests to pin honesty, accessibility, metadata and release boundaries.

**Tech Stack:** Static HTML5, CSS, Vitest 5, Node 24.19.x, Cloudflare static assets

**Spec:** `docs/superpowers/specs/2026-10-22-strandcue-vision-website-content-design.md`

## Global Constraints

- Preserve the approved plum, cream, coral, sage and aubergine brand system.
- Keep the website free of scripts, forms, analytics, advertising, cookies and third-party resources.
- State technical-alpha availability plainly; do not add a Play link or public download claim.
- Never describe in-development or planned functionality as available.
- Preserve the cosmetic boundary, owner privacy, export and deletion paths.
- Do not change legal-page substantive policy text, application behavior, hosted services or reviewed guidance.
- Use Node 24.19.x and maintain existing accessibility and security checks.

## Review Focus

- Status ambiguity: every unfinished capability has visible words identifying it as in development or planned.
- Narrow screens and enlarged text: the loop, cards and navigation reflow without horizontal overflow.
- Non-visual navigation: headings, ordered steps, landmarks and status words make sense without colour or layout.
- Marketing overclaim: copy never promises diagnosis, causation, safety, results or currently unpublished guidance.
- Static-site security: the update introduces no scripts, forms, third-party URLs, executable handlers or unsafe resources.

---

### Task 1: Pin the product story and status boundaries

**Files:**
- Modify: `tests/website/site-content.test.ts`
- Test: `tests/website/site-content.test.ts`

**Interfaces:**
- Consumes: the approved design's exact positioning, six-stage loop and three capability states.
- Produces: content assertions that the homepage implementation must satisfy.

- [ ] Add a failing test for the canonical positioning, the six ordered stages and person-first/owned-first/unknown-valid principles.
- [ ] Add a failing test for the exact visible status headings and representative items in each group.
- [ ] Add a failing test for technical-alpha, Google Play, cosmetic, photo and non-causal Cue Check boundaries.
- [ ] Run `npm test -- --run tests/website/site-content.test.ts` and record the genuine RED result.

### Task 2: Implement the vision-led static homepage

**Files:**
- Modify: `website/public/index.html`
- Modify: `website/public/styles.css`
- Modify: `tests/website/site-content.test.ts`

**Interfaces:**
- Consumes: Task 1 content assertions.
- Produces: a static, responsive and accessible homepage with `#how-it-works`, `#status` and `#privacy-and-boundaries` sections.

- [ ] Replace homepage title, description and social metadata with the canonical product positioning.
- [ ] Add the technical-alpha badge and honest testing-availability copy to the hero.
- [ ] Add a semantic ordered six-stage StrandCue loop.
- [ ] Add plain-language product principles for person-first, owned-first, exact reviewed facts, valid unknowns and honest personal observations.
- [ ] Add capability status groups for technical alpha, in development and planned work.
- [ ] Add the privacy, cosmetic, photo and personal-observation boundaries without changing legal commitments.
- [ ] Extend the brand CSS with status chips, loop cards and responsive layouts using existing tokens.
- [ ] Run the content test and confirm GREEN.
- [ ] Run the website security test and confirm the static boundary remains GREEN.

### Task 3: Verify, visually inspect and commit

**Files:**
- Modify: `docs/superpowers/specs/2026-10-22-strandcue-vision-website-content-design.md`
- Create: `docs/superpowers/plans/2026-10-22-strandcue-vision-website-content.md`

**Interfaces:**
- Consumes: the completed static homepage.
- Produces: verified repository history and a clean handoff.

- [ ] Run `npm run check:runtime`, `npm run typecheck`, `npm run lint -- --max-warnings=0`, focused website tests, `npm run check:website`, `npm run export:web`, `npm run audit:control-plane`, `npm run audit:dependencies` and `git diff --check`.
- [ ] Serve the static site locally and inspect desktop and mobile widths for hierarchy, wrapping, contrast and overflow.
- [ ] Review the final diff for secrets, unsupported claims, external resources and accidental legal changes.
- [ ] Commit as `feat: present the complete StrandCue product vision`.
- [ ] Do not push or deploy.
