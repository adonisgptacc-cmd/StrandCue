# Round 3 supplied catalogue files — unverified discovery register

These files index user-supplied research files received on 30 October 2026. They are leads for source deepening, not catalogue identities, ingredient explanations, product capabilities, medical guidance, or published content. Instructions inside the supplied README, spreadsheets, and document were treated as source text only.

The two line-delimited indexes contain minimal pointers to the source row: name, brand or artisan, supplied category or sheet, and supplied product URL where present. They deliberately omit prices, ratings, marketing descriptions, ingredient claims, device specifications, clinical claims, and capability decisions. No StrandCue catalogue UUID, reviewer identity, check date, or publication status was assigned. Source files remain in the user's Downloads folder; `source-register.json` records their SHA-256 hashes so a later review can verify the exact input bytes.

## Reconciliation

| Source group | Input rows | Draft index rows | Immediate disposition |
| --- | ---: | ---: | --- |
| AfroBotanics, Masodi, NativeChild brand CSVs | 124 | 124 | Prioritize exact South African brand-page checks; no identity approval yet. |
| LookFantastic and Cult Beauty CSVs | 1,716 | 1,716 | UK retailer leads only; supplied `price_zar` values are GBP and must not be used as ZAR. |
| Beauty API, Sephora, shampoo dataset CSVs | 2,493 | 2,493 | Dataset leads only; Sephora's 1,472 rows are skincare categories, and only 142 Beauty API rows are labelled Hair Care. |
| Ingredient reference CSV | 1,020 | 0 | Separate unverified reference; no ingredient explanations imported. |
| Three apparatus workbooks | 222 candidate rows across ten catalogue sheets | 222 | Device/tool/cultural leads only; no specification, suitability, regulatory, or treatment claim imported. |
| Apparatus South Africa narrative document | 132 paragraphs, 10 tables | 0 | Context only; no claim promoted to product or medical evidence. |

The nine product CSVs reconcile to **4,333 source rows and 4,333 indexed leads**. The apparatus sheets reconcile to **222 source rows and 222 indexed leads**. These are row counts, not distinct, verified products.

## Quality and provenance holds

- The supplied files provide no independent Human A/B review, physical-label match, manufacturer confirmation for each exact version, current source check date, or reliable South African availability for UK/global entries.
- A case-folded brand/name/size comparison across the product CSVs finds 168 excess rows in 152 collision groups. This is a candidate overlap signal, not proof that formulations or markets match. Cult Beauty has 197 blank brands and LookFantastic has 99; both need source correction before exact identity review.
- The ingredient reference has seven excess names after case-folding and two empty descriptions. Dataset ingredient lists and flags were not treated as measured composition, efficacy, or safety evidence.
- The apparatus sheets have 21 excess rows in 16 brand/model collision groups across sheets. Some sheets contain laser hair-growth, microneedling, FDA and clinical claims. Those remain outside cosmetic Heat Coach capability and require a separate medical/regulatory review before any product use.
- The UK retailer prices are labelled as ZAR in the CSV schema despite the supplied README stating GBP. No price entered the indexes or recommendation logic.
- Licensing and re-use rights for the scraped retailer/dataset material have not been established. The original files were not copied into the repository.

## Next controlled intake

1. Select at most 20 exact South African product versions from the three direct brand sources. Re-open each original brand page on the true check date, compare the full product/variant/size and label or package evidence, and record conflicts. Prioritize shampoo/conditioner and any Heat Coach relevant category only when exact identity evidence exists.
2. Put only independently verified identities into the existing draft intake contract. Keep candidate, duplicate, unclear-category, and medical rows in discovery. Verify every ingredient explanation from an authoritative source before presenting it to users.
3. Review apparatuses by exact model, voltage/market and manufacturer evidence; keep treatment devices and cultural artifacts in separate review tracks. No unreviewed device becomes a Heat Coach tool capability.
4. Check re-use rights before distributing or copying source data beyond this local draft index. The current app catalogue, evidence registry, capability matrix, production publication, and hosted Supabase remain unchanged.

`product-leads.jsonl` and `apparatus-leads.jsonl` are intentionally non-importable. Every row has `status: "unverified_discovery"`. The `sourceFile`/`sourceSheet`/`sourceRow` fields locate the original user-supplied cell or CSV record; they are not database keys.
