# Garnier Banana physical-label packet — 2026-10-24

**DRAFT RESEARCH — HUMAN REVIEW REQUIRED — NOT PUBLISHED**

This folder preserves ten user-supplied photographs as byte-identical source
artifacts. The user explicitly authorised copying them into the Git research
archive on 2026-10-24. They show products offered in a South African retail
store, but they do not establish purchase or possession.

The photographs cover two distinct products and must never be merged:

1. Garnier Ultimate Blends Nourishing Banana Hair Food Multi-Use Mask for dry
   hair, 400 ml, visually transcribed F.I.L. `Z70034167/4`, EAN-13
   `3600542231572`.
2. Garnier Ultimate Blends Banana Hair Food Nourishing Conditioner for dry
   hair, 350 ml, visually transcribed F.I.L. `Z79329/2`, EAN-13
   `3600542342896`.

Both barcodes pass the EAN-13 check-digit calculation. That check detects a
mistyped digit; it does not independently prove the product identity.

## Important version finding

The photographed conditioner is a possible reformulation or successor version.
The existing web-backed draft conditioner records F.I.L. `C239429/2`, while
this package appears to record F.I.L. `Z79329/2`. The photographed version is
therefore a separate draft intake row. It must not overwrite, silently update,
or publish the existing version.

The mask is outside the deliberately narrow `basic_wash` intake schema, which
currently accepts only `shampoo | conditioner`. Its record stays quarantined in
`physical-label-intake.json` until a reviewed mask category and migration path
exist.

## Evidence boundary

The package may support identity, barcode, size, label directions, warnings,
ingredient transcription and formulation comparison. Marketing statements
such as “up to 7x smoother”, “up to 7x more nourishment”, “deeply nourishes”,
“stronger”, “repair”, “natural origin”, “biodegradable”, “vegan” and “tested
under dermatological control” remain attributed label claims. They are not
independent efficacy evidence and create no StrandCue capability.

Every transcription in `physical-label-intake.json` remains draft. A human
reviewer must compare it with the original-resolution images before adoption.
No reviewer identity, publication decision or possession claim is recorded.

## Files

The SHA-256 hashes in `manifest.json` bind each descriptive filename to the
original user-supplied filename and allow byte-for-byte verification.
