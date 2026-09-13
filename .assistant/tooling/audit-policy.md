# Control-plane audit scope

Run `npm run audit:control-plane`. This is a small project-authored checker, not the missing upstream v4.5 auditor. It checks JSON manifest/observed schema, per-target observations, approved reference drift, partial bootstrap status, unapproved observations, stale external claims and unproven enforced-boundary claims.

It does not rehash host files, perform a security scan, prove tool installation, validate all instruction prose, or establish behavioural conformance. Host entry checksums are point-in-time evidence. Before changing extension policy, inspect the actual source/scope again. Before adding another agent host, run the conformance scenarios on that host.

Non-zero findings hold adoption changes until resolved. `METADATA-PASS` is deliberately distinct from release approval. A fresh-session behavioural report is recorded separately in `docs/verification/`.
