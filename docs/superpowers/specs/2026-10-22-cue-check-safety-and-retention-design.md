# Cue Check safety and retention design

**Intent.** Close the two product decisions left by Increment 4 without turning StrandCue into a symptom assessor or retaining retry payloads for the life of an account.

**Approved behavior.** New and corrected Cue Checks do not ask the immediate-reaction question and personal-outcome summaries do not use that field. The stored schema remains compatible, and existing reaction answers remain visible as historical owner records. Cue Checks, their revision history, confirmed steps and notes remain until account deletion. Private Cue Check operation receipts expire after 30 days and are removed by the existing scheduled retention pass.

**Constraints.** No diagnosis, triage, product-safety inference, ranking change or new recommendation behavior. No destructive rewrite of existing Cue Check records. The cleanup routine is service-role only, uses an explicit as-of time, deletes only strictly older receipts, returns a count only, and cannot delete Cue Checks, revisions or confirmed steps. Exact idempotent replay is guaranteed only while a receipt exists.

**Approaches considered.** Keeping the question with a disclaimer leaves an unresolved symptom-like flow. Deleting the field or old answers breaks compatibility and history. The approved approach makes the field dormant for new input and summaries while preserving historical display. Keeping all receipts until account deletion duplicates private notes unnecessarily; hashing every receipt is a larger protocol redesign. A 30-day cleanup through the established retention worker is the bounded choice.

**Follow-on.** A future adverse-reaction feature requires separately reviewed safety wording, escalation behavior, privacy rules and South African product/legal review before the question may return.
