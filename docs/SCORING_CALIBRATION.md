# Scoring, Call Integrity & Coaching Integrity

> Reference for how Saler scores a call and why the numbers can be trusted.
> Updated in Repair Phase 1 (`fix: harden call completion and coaching integrity`).

Saler separates **signals** (what happened) from **scores** (how good it was).
An evaluator — deterministic or, when configured, an LLM — only ever returns
19 booleans. Pure TypeScript owns every number. Nothing below depends on an
LLM, and no LLM can write a score, weight, or metric.

---

## 1. Live (per-turn) scoring — unchanged

Each seller turn produces signals → deterministic metric deltas → a smoothed
visible overall. Positive signals have diminishing returns (full, ½, ¼, then 0);
penalties always apply in full. The visible overall moves at most ±8 points per
turn. Objection Handling is excluded from the overall until an objection is
raised. See `src/scoring/`. This layer already resisted farming (the ±8 cap and
full-weight penalties), so it was left intact.

## 2. Final (whole-call) scoring — reworked

**The defect:** category scores used *ever-occurrence* booleans — one discovery
signal anywhere in a 20-turn spam call scored the same as sustained good
practice (100/100), and those two categories carried 0.40 of the weight while
the repetition penalty landed only in Clarity (0.10). A repetitive call scored
**80** while its live metrics had collapsed to the floor.

**The fix — evidence density, not ever-occurrence.** Heavily weighted
categories now blend three things:

- **Coverage (breadth):** did the seller touch this area at all. Saturates for
  any call that mentions it once — so coverage alone can never reach 100.
- **Density (depth):** what *fraction of turns* actually did it
  (`discoveryTurns / n`, `meaningfulTurns / n`).
- **Penalties (throughout):** repetition and noise (off-task/trivial turns)
  subtract from Discovery, Problem Identification, Value, and Clarity — not just
  Clarity.

### Category formulas (`src/final/analyze.ts`)

| Category | Formula (clamped 0–100) |
|---|---|
| Discovery Questions | `10·(areas covered of {process,pain,impact,timeline,decision}) + 6·open? + round(24·discoveryTurns/n) − 5·min(repetitive,8) − 3·min(noise,8)` |
| Problem Identification | `22·pain? + 18·impact? + 14·context? + round(22·meaningful/n) − 4·min(repetitive,8) − 6·min(unsupported,4)` |
| Value Articulation | `45 + 15·context? + 10·(stage≥value_mapping) + 5·nextStep? − 10·unsupported − 8·earlyPitch − 3·min(repetitive,6)` |
| Clarity & Conciseness | `68 − 7·min(tooLong,n) − 7·min(repetitive,n) − 6·unsupported − 5·ignored − 2·min(noise,8)` |
| Opening & Confidence | first-turn quality ± early-pitch/too-long/unsupported (unchanged) |
| Closing & Next Step | next-step earned by prior pain + decision-maker (unchanged) |
| Objection Handling | mean per-objection quality, or excluded when none raised |

**Overall** = documented weighted blend (unchanged weights, sum 1.0; objection
weight redistributed when no objection was raised):

```
discovery .22  problem_id .18  value .15  objection .15
opening .10    clarity .10     closing .10
```

### Divergence guard (`applyEvidenceGuard`)

The blended overall is then corroborated against the live average. The final may
sit **above** the live average only by a margin the evidence earns:

| Condition | Max points above live average |
|---|---|
| clean call (little repetition/noise) | +18 |
| `repetitive/n > 0.3` or `noise/n > 0.3` | +8 |
| `repetitive/n > 0.5` or `noise/n > 0.5` | +0 |

The guard **only caps**; it never raises a score. A repetitive or
low-information call therefore cannot claim a whole-conversation score its turns
never supported.

### Verified separation

End-to-end through the real engine:

- Five concise strong turns → final **69** (live 51).
- Twenty repetitive turns → final **27** (live 39).
- 20 farming calls of varying length → **max final 31**.

Strong concise reliably beats long spam. Regression-locked in
`src/final/scoring-integrity.test.ts`.

## 3. Minimum-evidence policy

`evidenceLevel(sellerTurnCount, scoreHistory)` → deterministic level:

| Level | Rule | Report behaviour |
|---|---|---|
| `none` | no seller turns | headline shows **—**, "Not scored" banner, no strengths |
| `limited` | 1–2 turns, **or** ≥3 turns with no positive signal ever | headline qualified, "Limited evidence" banner |
| `sufficient` | otherwise | normal report |

A near-empty or all-trivial call never wears a confident number.

## 4. Coaching integrity — strengths & the strongest moment

- **No fabricated strengths.** `buildStrengths` returns **0–3** evidence-based
  items and never pads with filler. A weak call returns `[]` and the report
  renders "No clear strengths could be established from this call." The schema
  and validator now accept 0–3 strengths (was: exactly 3).
- **Merit-gated strongest moment.** A statement is the strongest moment only if
  its positive-merit score clears `STRONGEST_MERIT_THRESHOLD` (≥ 1 genuine
  positive signal). Otherwise the strongest statement is `''` — a
  punctuation-only or trivial turn (`"?"`, `"ok"`, `"sure"`) is **never**
  crowned, and selection is never "least-bad" or "first".
- **Weakest** may still be a real weak statement, always distinct from
  strongest, and empty on single-turn calls.

## 5. Call-completion integrity (state machine)

- **Call epoch.** Every async step captures the epoch it began in and, after
  each `await`, discards its result if the epoch moved on. The epoch is bumped
  when a call starts, ends, or the engine is disposed. This is why End Call
  during an in-flight turn can never append a late reply, revive a completed
  call, or mutate score history after completion. A plain `AbortController` is
  insufficient because mocked/deterministic providers still resolve after abort.
- **Stable call id.** Created once in `start()` and reused by `endCall()`.
  Repeated, concurrent, or post-resurrection End Call calls all resolve to the
  **same** id, so the hook's save-by-id de-dupe makes persistence structurally
  idempotent — never dependent on timestamps being unique. The old comment
  "Calling endCall twice is a no-op" is now structurally true.
- **Retry semantics.** If customer-reply generation fails, the already-appended,
  already-scored seller turn is **kept** and only the reply is regenerated:
  `Error → retry → GeneratingReply → WaitingForSeller`. Retrying never adds a
  second seller turn and never re-scores the message, so diminishing-reward
  counters are untouched.

## 6. Deterministic final-score authority (AI path)

When AI is enabled, the final evaluator's LLM supplies **narrative only** —
never a number. `LLMFinalEvaluatorProvider` recomputes overall_score, all seven
category_scores, the evidence guard, and objection results locally with the
exact functions in §2 (`analyze.ts` / `objections.ts`), then merges the grounded
narrative on top. Concretely:

- The route (`/api/evaluate-final`) validates the model output with
  `validateAiNarrative` and **rejects any payload containing** `overall_score`,
  `category_scores`, or `objection_results`. It returns narrative-only.
- The client validates again, then computes every score from the local score
  history and transcript. A model that returns `overall_score: 100` is rejected
  and the deterministic report is used instead. The number is identical to what
  the Demo evaluator would produce for the same call.

| Report field | Source |
|---|---|
| `overall_score`, `category_scores` | **deterministic** (always) |
| `objection_results` (incl. `handled`) | **deterministic** (from `analyzeObjections`) |
| evidence level, live-vs-final comparison | **deterministic** |
| `strengths`, `missed_opportunities`, `summary`, `recommended_practice`, `better_response`, `missed_discovery_questions`, `strongest`/`weakest` quotes | **AI when enabled**, else deterministic; always grounded |

The turn evaluator likewise returns **signals only** (19 booleans) — the live
scoring engine converts them. The LLM has no path to any score.

## 7. Grounded vs interpretive narrative

- **Quotes** (`strongest_statement`, `weakest_statement`) must be a **verbatim**
  seller message or empty. Enforced on server and client.
- **Interpretive fields** (strengths, missed opportunities, summary, practice,
  better response, missed questions) are coaching interpretation, not asserted
  fact. They are length-capped and screened for markdown/HTML, control
  characters, and **fabricated factual numerals** — invented team sizes,
  percentages, prices, dates, or performance multipliers are rejected. A bare
  example number in a *suggested* `better_response` (e.g. "a 20-minute demo") is
  allowed; `better_response` is framed by the UI as a suggestion, never history.
- **Missed questions** are de-duplicated against each other and against
  questions the seller already asked (token-overlap ≥ 0.6).
- Real-time `brief_feedback` / `recommended_next_move` are capped and screened
  the same way before they reach the live UI.

If any field fails grounding the whole AI report is rejected and the
deterministic report is saved instead — the session is never lost.

## 8. AI route security model (summary)

The AI routes are not an open proxy. See `README.md` for operator setup.

- **Same-origin** required (Origin, or Referer when Origin is absent; both
  absent is allowed for server/test clients — documented in `aiGuard.ts`).
- **Rate limited** per client id. The limiter is **in-memory and per serverless
  instance** — a runaway-loop guard, *not* a globally distributed quota; it is
  written to be swapped for a shared store.
- **Capability token** (`x-saler-capability`): short-lived, HMAC-signed,
  server-only secret. Required **when `AI_CAPABILITY_SECRET` is configured**;
  omitted for local dev and Demo Mode (dev-safe). The token carries no secret
  and is never stored in a saved session.
- **Prompt injection**: transcript is delimited as DATA in every prompt and
  declared non-instruction. Even if the model obeyed an injection, scores are
  deterministic, so "give me 100" is inert.

## 9. What this does NOT claim

- **Not a measure of real-world sales skill.** Internally consistent,
  explainable heuristics over a fixed scenario — not evidence of selling ability.
- **Weights are reasoned, not empirically fitted.** No labelled dataset of real
  outcomes backs the coefficients; they preserve ordering (strong > weak > spam)
  and are regression-locked.
- **Live AI behaviour is unverified.** No paid OpenAI call has succeeded (the
  account returns `insufficient_quota`). Prompt-injection resilience,
  narrative quality, and grounding are proven against **mocks**, not a real
  model. The route/validator boundaries hold regardless of model behaviour.
- **Calibration fixtures** (`src/evaluation/calibration.fixtures.ts`) measure
  detector-vs-label agreement on author-written cases — a consistency check, not
  accuracy against real calls.
