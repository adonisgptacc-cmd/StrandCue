# Extension admission

`extensions.yaml` records desired approved policy. `extensions.lock` records observations using schema `ai-project-extensions-lock.v2` and top-level `observed`. JSON syntax in either file is intentional and valid YAML; the local auditor uses dependency-free JSON parsing.

Reuse the host's available capabilities where sufficient. Any new installation first needs a concrete gap, source/permission review, pinned plan, appropriate static scan and narrow scope. Global changes need separately scoped authorization. Do not silently auto-update, install all optional packs, or claim a scan ran when no scanner is available.

Current observations document readable host skill files, not a project installation, upstream SHA assurance, runtime conformance, or a malware scan. A changed version/hash requires review. Host-managed updates may occur; project policy cannot technically prevent them. No `enforced-bounded` claim without technical denial and a negative test. No task data is sent to an additional service merely because a skill suggests it.
