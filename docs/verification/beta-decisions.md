# Beta decisions log

Every decision below gates provider setup, builds or reviews. Status starts
UNDECIDED; a decision is recorded only with a value, a decider and a date.
Guessed providers, people, domains or credentials must never be hardcoded
anywhere — implementations keep reading them from configuration.

## D1. Production Supabase project and region

- **Context:** Drives data residency, backup capability, cross-border assessment and the rehearsal target.
- **Needed:** Project ref, cloud region, paid-backup (PITR) confirmation.
- **Status:** UNDECIDED
- **Decision:**
- **Decided by / date:**

## D2. Owned HTTPS domain and Android application identifier

- **Context:** Needed for Universal/App Links (recovery + email confirmation), the sender domain and the Play listing. The `.maestro` placeholder appId and deep-link hosts take these values.
- **Needed:** Domain, Android applicationId.
- **Status:** UNDECIDED
- **Decision:**
- **Decided by / date:**

## D3. Transactional email provider and sender domain

- **Context:** Verification and recovery delivery plus SPF/DKIM/DMARC. The provider must offer a data-processing agreement acceptable under POPIA.
- **Needed:** Provider, sender domain, authentication records confirmed.
- **Status:** UNDECIDED
- **Decision:**
- **Decided by / date:**

## D4. Named operating humans

- **Context:** Information Officer (POPIA §21 duties), support owner, security reviewer, verification operator. Reviews and incidents route to names, not roles.
- **Needed:** Four names with contact paths; segregation respected (reviewer differs from code author).
- **Status:** UNDECIDED
- **Decision:**
- **Decided by / date:**

## D5. PostHog and Sentry hosting regions and subprocessors

- **Context:** Analytics and crash pipelines exist but disabled with no provider. Cross-border transfer rules (§21.8) apply before either is enabled.
- **Needed:** Hosting regions, subprocessor list, adequacy assessment.
- **Status:** UNDECIDED
- **Decision:**
- **Decided by / date:**
