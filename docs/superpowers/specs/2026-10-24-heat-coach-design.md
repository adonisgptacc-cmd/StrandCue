# Heat Coach design authority

Status: approved implementation authority for Increment 6. It does not publish production content.

## Purpose and boundary

Heat Coach evaluates recorded cosmetic facts against an exact reviewed rule publication. It may lower or remove heat from an eligible routine, request a missing fact, or refuse an assessment. It does not diagnose hair or scalp conditions, infer facts, prescribe treatment, or promise an outcome.

The decision states are exactly:

`content_pending | needs_input | restricted | lower_heat | no_heat | appropriate | unavailable`

Necessity is exactly:

`not_needed | optional | supports_goal | unknown`

Missing-fact destinations are exactly:

`today | my_hair | services | my_shelf | my_tools`

Publication lifecycle is exactly:

`draft | reviewed | withdrawn`

Production Heat Coach publication: `draft`

## Recorded facts and trust boundaries

The evaluator may consume only a validated prepared guidance input, confirmed care-event heat facts, exact owner Tool and Shelf bindings, and rules carried by the reviewed publication supplied to it. It does not access a clock, network, environment, mutable database or locale-sensitive ordering.

A product protection prerequisite is satisfied only by an exact matched and available product version carrying the required reviewed, published capability. A product name, category, ingredient list, photograph, marketing sentence or unmatched Shelf record is never capability evidence.

A numeric temperature exists only when the owner recorded a number and unit. Wattage, model name, tool type, attachment and labels such as High or Medium do not create a number. An unknown value stays unknown.

## Unit policy

Numeric rule bands store separate reviewed values for `C` and `F`. No runtime unit conversion creates a reviewed limit. A recorded Celsius value may match only the Celsius band; a recorded Fahrenheit value may match only the Fahrenheit band.

A named setting may match only a separately reviewed named-setting rule bound to the exact tool version. It never satisfies a numeric band.

## Evaluation order

The pure evaluator follows this order:

1. Validate the complete input and publication.
2. Require one exact reviewed, current publication.
3. Apply active hard restrictions.
4. Request required recorded facts without guessing.
5. Determine whether heat is needed, optional, goal-supporting or unknown.
6. Resolve an eligible method, exact tool and exact product combination.
7. Prefer the eligible option with less recorded heat exposure.
8. Add reviewed alternatives in canonical order.
9. Emit structured reason codes and reviewed copy keys.

Contradictory, unavailable, expired, mismatched, draft or withdrawn material fails closed. A hard conflict produces `restricted` or `unavailable`, never a partial successful assessment.

## Output boundary

Owner-facing decisions contain stable structured values only: state, necessity, selected recorded settings, missing-fact destinations, reason codes and reviewed copy keys. They never contain raw rule expressions, database error codes, reviewer identities, evidence identifiers, URLs, record identifiers or free-form engine prose.

All arrays use canonical domain ordering with explicit tie-breaks. Equivalent reordered inputs must produce byte-identical decisions, and evaluation must not mutate either input.

