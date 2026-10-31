# StrandCue brand integration design

## Intent

Adopt the approved flowing-strand and coral-cue logo as StrandCue's single visual identity. The brand should feel warm, confident, supportive and recognisable while the product remains calm, readable and accessible.

## Approved system

- Preserve the supplied square artwork as the master source.
- Primary plum: `#63295E`, sampled from the supplied artwork.
- Warm cream: `#FDF2E6`, sampled from the supplied artwork.
- Cue coral: `#F37368`, sampled from the supplied artwork. Use for graphical cues and selected highlights, not body text on cream.
- Dark aubergine: `#2C172A`, used for readable text and primary actions.
- Muted sage: `#E8EDDF`, retained only for supportive, available and successful states.
- White: `#FFFFFF`; quiet plum: `#6C5268`; line: `#DDCEDA`; error: `#8C2F39`.

## Surfaces

- Mobile launcher, Android adaptive/themed icon, splash and web favicon.
- Mobile Page header and shared design tokens.
- Public website header/footer lockups, favicon, social preview, CSS tokens and hero treatment.
- Repository brand source and asset provenance.
- Store-ready 512px icon and 1024px master export. Store submission itself is outside this change.

## Accessibility and behavior

- Decorative logo images use empty alternative text or are hidden from accessibility when the adjacent `StrandCue` wordmark names the brand.
- Brand home links retain the existing descriptive accessible name.
- Coral is never the only indicator and is not used for small text on cream.
- Interactive controls retain at least 44px targets and WCAG AA text contrast.
- The logo does not change medical/cosmetic boundaries, product copy or functionality.
- No animation is introduced.

## Asset provenance

The source is the user-approved file `ChatGPT Image 21 Oct 2026, 18_23_51.png`. Derived sizes are deterministic exports from that source. The generative transparent-background attempt was rejected because it introduced edge artifacts and is not used.
