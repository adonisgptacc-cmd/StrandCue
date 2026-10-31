# I6.5 assessed heat-step design (local synthetic route)

## Intent

Let Today show and start a protocol step for a Heat Coach assessment only when the exact reviewed heat instruction, owned items and thermal limits are preserved through generation, preview, storage and start. This is a local test-fixture design. Production Heat Coach publications remain empty/draft and no real catalogue item is approved by this work.

## Current boundary

The trusted Today handler binds only `no_heat`. The generic protocol engine can select a tool but emits `apply`; its step has no method, temperature, setting, passes, duration or zones. The execution snapshot copies those same fields. The database rejects bound heated starts. The assessment already stores an immutable selected method and thermal details plus the exact request and prepared owner items. Both evaluators now require the reviewed `heat-tool` capability.

## Approaches

1. **Extend the existing trusted protocol and execution path (recommended).** Add a distinct `heat` action with a structured prescription derived by the server from the owned assessment. Reuse the immutable run, start operation and historical execution model. This adds contract and migration work but gives one consistent start and restore path.
2. **Create a separate Heat Coach execution path.** This isolates heat but duplicates ownership, idempotency, restore and event semantics, making the two histories harder to reconcile.
3. **Put heat details in step reasons or display text.** This cannot enforce numeric limits or exact method and setting at start, so it is unsuitable.

## Proposed contract

- Add an `assessed_heat_action` effect to the reviewed Today rule contract. It names the exact Heat Coach publication ID and digest. The guidance engine emits a heat-action reference only from that effect; the trusted server matches that reference to the owned assessment before filling a step. An eligible assessment alone must not turn a generic tool `apply` into heat guidance.
- `action: 'heat'` carries a structured prescription with method, temperature, setting, passes, duration minutes and zones. The server copies these fields from `assessment.result.selected`; the client supplies no verdict or limit. The step and execution snapshot preserve the exact publication reference.
- The heat step references one exact owned tool ID/version. If protection is required, a separate preceding product `apply` step references the exact assessed product ID/version. A step never combines tool and product identities.
- An `appropriate` result may use only its selected technique. A `lower_heat` result may use its evaluator-adjusted selected temperature only after the user explicitly chooses that lower option. Choosing an unheated or other displayed alternative creates a new assessment for that intent; the stripped display alternatives do not authorize a start. The Today command carries only the resulting assessment ID. This avoids an editable alternative choice or stale version lookup.
- For the first local route, require a known numeric temperature, passes and duration, and an exact recorded tool setting or temperature matching the prescription. Unknown temperature plus a reviewed named setting, or an adjusted lower bound the owned tool cannot express exactly, remains `content_pending` until a separate reviewed mapping is implemented.
- Preview states the assessed method and limits with reviewed copy. It never labels the activity safe, risk-free or damage-free. The execution snapshot preserves the structured prescription; viewing/generating it creates no actual heat event.

## Trust and concurrency

At trusted-run insert and at a new execution start, PostgreSQL verifies the assessment owner, source fingerprint, publication ID/digest, current published rule and capability registry, the matching reviewed Today heat-action reference, exact tool and product owner IDs/versions, availability and assessed prescription. The prescription must equal every field of `assessment.result.selected` in its recorded unit; missing or extra fields and null method, temperature, passes or duration fail, while setting may be null. Zones retain their canonical array order. If protection is required, its exact product `apply` step must precede the heat step. The database locks the publication and source revision against withdrawal/correction races before creating an execution. An idempotent replay returns its original receipt even after later withdrawal; historical execution remains unchanged.

Confirming a protocol heat step records protocol execution history only. Actual heat event entry remains a separate explicit flow and must not be inferred from the plan or confirmation. Production release needs device acceptance of that distinction.

## Tests and release gate

Use synthetic reviewed fixtures to prove a valid adjusted lower/direct heat step and failures for wrong method, excess temperature, wrong setting or zones, missing or changed tool/product version, owner switch, correction and publication or registry withdrawal. Run domain/SQL parity, Edge, preview, execution, restore and two-session PostgreSQL races. Keep production heated generation `content_pending` until the reviewed guidance rule, exact product/tool registry, Human A/B review, device acceptance and dependency audit gates pass. No push, deployment, production publication or hosted Supabase write is part of this design.
