# Risk routing

| Tier | Work | Gate |
|---|---|---|
| T0 | Typo/comment/format | Targeted check and diff review |
| T1 | Local low-risk fix | Reproducer, focused test, review |
| T2 | User-visible behaviour or interface | Accepted spec, Superpowers plan/TDD, fresh-context review, functional checks |
| T3 | Auth, ownership, history integrity, migrations, personal data, governance, CI | T2 plus security/architecture review, scoped authorization, rollback/recovery evidence |
| T4 | Production release, incident or irreversible operation | Approved runbook and explicit operation-specific authorization |

Use the higher materially applicable tier. Record T2–T4 work in `.assistant/audits/`. The current foundation is T3 and locally authorized; deployment is not part of that authorization. Optional framework availability never raises a typo to T3 or lowers an RLS change to T1.
