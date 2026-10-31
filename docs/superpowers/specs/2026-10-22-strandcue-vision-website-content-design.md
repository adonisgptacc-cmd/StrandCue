# StrandCue Vision Website Content Design

**Date:** 22 October 2026
**Status:** Approved by product owner
**Authority:** `2026-10-10-canonical-product-spec.md` and the approved StrandCue brand identity

## Intent

Update the public StrandCue website so visitors understand the complete product vision: a private, evidence-aware hair-care companion that combines the person's hair record, owned products and tools, current needs, reviewed guidance, actual routine execution and personal observations over time.

The site must feel supportive, confident and useful. It must never imply that unfinished capabilities are already available, that StrandCue diagnoses hair or scalp conditions, or that a product caused a personal outcome.

## Audience and desired action

The primary audience is an adult considering StrandCue for her own hair-care decisions. A visitor should quickly understand what StrandCue is, how the intended experience works, what makes it different from a generic hair quiz, and that the current release is still a technical alpha.

The primary action remains joining or trying an authorised test build when one is available. Privacy, support and account deletion remain easy to find.

## Chosen approach

Use a vision-led homepage with honest status labels.

The alternatives considered were:

1. Describe only currently available technical-alpha features. This is accurate but continues to present StrandCue as a simple record keeper.
2. Make the roadmap the main story. This is transparent but reads like a development project rather than a consumer product.
3. Present the complete intended experience while distinguishing **Available in the technical alpha**, **In development** and **Planned**. This is the chosen approach because it explains the real product without presenting unfinished work as live.

## Message hierarchy

1. **Positioning:** “Your hair. Your products. Your next best step.”
2. **Promise:** StrandCue brings the person's hair facts, treatment history, owned products, tools, current condition and desired result together to prepare practical, explainable guidance.
3. **Difference:** It starts with the person and what she already owns, uses reviewed product information, preserves unknowns and explains limitations.
4. **Continuous loop:** Know your hair → add products and tools → choose today's goal → inspect a routine → record what happened → describe how it felt → use private history to make later choices more relevant.
5. **Trust:** Cosmetic guidance only, deterministic reviewed rules, no diagnosis, no promised results, private owner-controlled records, export and deletion.
6. **Release status:** Technical alpha; broad reviewed guidance and later features are still being built and tested.

## Homepage structure

### Header

Keep the approved logo, wordmark and existing legal/support navigation. Add a compact link to “How it works” without crowding mobile navigation.

### Hero

Use the canonical positioning line as the main heading. The supporting copy should describe a private hair-care companion that helps a person decide what to do next using her own hair facts, products, tools and goals.

The hero must show a clear technical-alpha badge and must not present a public download button until an authorised distribution link exists.

### The StrandCue loop

Show six understandable stages:

1. Know your hair through the Hair Passport and service history.
2. Add products and tools already owned.
3. Tell StrandCue what is true today and the desired result.
4. Review a practical routine, reasons, unknowns and alternatives.
5. Record only what was actually done.
6. Complete immediate or later Cue Checks and build a private history.

### Built around real life

Explain the product principles in plain language:

- Person first rather than a generic hair type.
- Owned products first and “no purchase needed” when appropriate.
- Unknown is a valid answer.
- Exact reviewed product versions and directions.
- Explanations and limitations before starting.
- Personal observations with sample counts and no causal claims.

### Capability status

Use three clearly styled groups:

**Available in the technical alpha**

- Account and private profile foundation.
- Structured Hair Passport and service history.
- My Shelf and My Tools foundations.
- Activities and owner history.
- Privacy controls, export and account deletion foundations.

**In development**

- Condition-aware Today check-in.
- Targeted missing-information questions.
- Explainable protocol preview and execution.
- Cue Checks and honest personal outcome summaries.
- Expanded reviewed product and tool catalogue.

**Planned after the core loop**

- Private progress photos and comparisons.
- Barcode, label-photo and OCR-assisted product discovery.
- Weather and travel context.
- Routine Audit and product comparison.
- Optional reminders.

Every status statement must remain conservative. A capability moves groups only when the repository's capability matrix and tested release support it.

### Privacy and cosmetic boundary

Keep a prominent section explaining:

- StrandCue provides cosmetic hair-care guidance, not diagnosis or medical treatment.
- Photos will support private progress records, not automated damage, growth or scalp diagnosis.
- Personal Cue Checks are observations and do not prove a product caused a result.
- Records are owner-scoped and support export and deletion.
- The public website itself uses no analytics, advertising, cookies or contact forms.

### Closing action

Invite visitors to follow testing availability and review privacy information. Do not create a mailing-list or contact form. Keep the existing support email and legal links.

## Visual direction

Continue the approved brand system:

- Deep plum for primary action and structure.
- Warm cream for the main canvas.
- Coral for cue points and limited emphasis.
- Sage for supportive information and status areas.
- Dark aubergine for body text.

Use the strand logo as the visual anchor. Add simple numbered paths, status chips and spacious editorial panels. Avoid stock photographs, stereotypical hair silhouettes, excessive pink, clinical imagery, gradients behind body text and decorative motion.

## Accessibility and responsive behavior

- Preserve the skip link and semantic landmarks.
- Maintain one page-level heading and ordered heading structure.
- Do not use colour alone for capability status.
- Ensure graphical and text contrast meets the existing accessibility checks.
- Keep touch targets at least 44 CSS pixels.
- Present the six-stage loop as meaningful ordered content.
- Keep the page usable at 320 CSS pixels and with enlarged text.
- Respect reduced-motion preferences; no animation is required.

## Content governance

- Copy must be derived from the canonical specification and current capability matrix.
- Do not publish product efficacy claims, reviewer identities, evidence details or Banana approval.
- Do not claim that guidance is live while the production bundle remains draft.
- Do not claim that photos, OCR, weather, reminders or personal ranking exist.
- Do not change privacy, terms or deletion commitments without a corresponding legal/product requirement.
- Metadata and social-sharing descriptions must use the same honest positioning as the visible page.

## Scope

This update includes the homepage, shared website styling, metadata, navigation wording and website content tests. Legal pages retain their substantive policy text, receiving only shared navigation/status wording where necessary.

It does not deploy the website, create a public APK link, add analytics, add forms, change app behavior, change hosted services or publish reviewed guidance.

## Acceptance criteria

- A first-time visitor can explain the intended StrandCue loop after reading the homepage.
- Current, in-development and planned capabilities are visually and textually distinct.
- No unfinished capability is described as available.
- The page communicates person-first, owned-first, evidence-aware and privacy-first principles.
- Cosmetic and photo boundaries are explicit.
- Existing privacy, support, terms and deletion routes remain valid.
- Website content, security and accessibility tests pass.
- The page is visually checked at desktop and mobile widths before commit.
