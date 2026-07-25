# Saler — Production-Readiness Re-Audit

**Date:** 2026-07-25 · **Baseline commit:** `c9bc14c` · **Suite:** 665 passing
**Method:** Independent reproduction. Each prior defect was re-derived with fresh
throwaway probes (deleted before completion) and live browser measurement — not
accepted on the word of a repair report. Live OpenAI/ElevenLabs were **not**
called (no credit; all AI behaviour exercised through mocks and local route
probes). No application source was modified during this audit.

---

> ## Remediation update — Repair Phase 3.1 (`fix: close final deployment readiness gaps`)
>
> The two blocking items below have since been fixed and verified:
>
> - **M1 (caution contrast)** — `caution` darkened `#B66A08 → #8A5108`:
>   **6.44:1** on white, **5.98:1** on the `bg-caution/5` banner surface
>   (browser-confirmed). A palette contrast regression test now reads the real
>   `tailwind.config.js` values and asserts every meaningful pairing ≥ 4.5:1, so
>   this class of bug is caught in CI (closes m5).
> - **m1 (AI security config gate)** — the routes now **fail closed**: AI is
>   enabled only when `OPENAI_API_KEY` AND `AI_CAPABILITY_SECRET` are both set;
>   a key alone yields `503 AI_NOT_CONFIGURED` before any model call and an
>   `/api/ai-status: {enabled:false}`. End-to-end `createAiRoute` integration
>   tests were added for all three routes (closes missing test #2).
> - **m4 (guard order)** — reordered to same-origin → rate-limit → fail-closed →
>   capability, with explicit tests.
>
> Suite **716** passing. The remaining findings below (m2 token replay window,
> m3 per-instance limiter, and all *Unverified Areas*) are unchanged and remain
> post-deployment / external-credit work. The **READY WITH MINOR FIXES** verdict
> stands, now with the minor fixes applied.

---

# Executive Summary

Saler's deterministic core is **genuinely solid and the previously-reported
critical defects (B1–B7, B11, B13) are independently confirmed fixed.** I
reproduced every one and could not re-trigger any of them:

- End Call can no longer revive a completed call, append a late reply, mutate
  score history after completion, or persist a duplicate session — verified by
  holding providers open across the async boundary.
- The final score is deterministic and the AI path cannot influence it; a model
  returning `overall_score: 100` is rejected and the number is computed locally.
- Spam, feature-dumping, and unsupported-claim calls all score **below** a
  concise strong call (strong 69 vs spam 27, dump 16, unsupported 16).
- Weak/trivial/zero-turn calls invent no praise and no strongest moment.
- AI routes are guarded (rate-limit → same-origin → capability) before any body
  read; cross-origin is rejected, invalid/expired capabilities are rejected, and
  no secret/prompt/upstream body leaks in any error path.

Remaining issues are **not** critical. The most material is a **WCAG AA contrast
failure on warning/notice text** (`caution` `#B66A08` = 4.16:1) — a class of
meaningful small text that Repair Phase 3 fixed for `ink-muted` but left
untouched for `caution`. The AI-route security is strong **only if the operator
sets `AI_CAPABILITY_SECRET`** in production; without it the routes fall back to
rate-limit + same-origin, which a non-browser client can bypass. Live AI and
ElevenLabs audio remain **unverified** by necessity.

**Verdict: READY WITH MINOR FIXES.** Confidence **high** on the deterministic
product, **not applicable / unverified** on live model behaviour.
Production-readiness: **~90%** (Demo-Mode deployment); **~85%** for a
credentialed AI deployment, gated on one config step and the contrast fix.

- **Critical (new):** 0
- **Major (new):** 1 (warning-text contrast fails AA)
- **Minor (new):** 5
- **Architecture:** 8.5/10 · **State machine:** 9/10 · **Scoring:** 8/10 (internal
  agreement only) · **Security:** 8/10 · **Accessibility:** 7/10 · **Reliability:** 8.5/10

---

# Previous Defects — Fixed / Partially Fixed / Still Present

| ID | Defect | Status | How re-verified |
|----|--------|--------|-----------------|
| **B1** | End Call revives a completed call / late mutation | **FIXED** | Held customer (60ms) and evaluator (60ms) open across End Call; status stayed `Completed`, transcript frozen, no `LATE-REPLY`, no late score entry, `finalReport` present with status never `WaitingForSeller`. |
| **B2** | Duplicate persisted sessions | **FIXED** | Repeated + concurrent + post-resolve End Call all resolved to one stable UUID; browser flow persisted exactly 1 log per call. |
| **B3** | Open AI proxy | **FIXED (with deploy caveat)** | All three routes + capability route run `guardAiRequest` before body read. Cross-origin → 403; missing/invalid/expired capability → 401; rate budget → 429; errors carry no secret/prompt. **Caveat below.** |
| **B4** | Fabricated strengths | **FIXED** | `?`/`ok`/`sure`/nonsense/zero-turn all yield `strengths: []` and `strongest_statement: ''`. |
| **B5** | Final-score farming | **FIXED** | strong 69 > spam 27, feature-dump 16, unsupported 16, irrelevant 28; one discovery occurrence < 100 in its category. |
| **B6** | AI assigns the final score | **FIXED** | `LLMFinalEvaluatorProvider` recomputes every number; a model `overall_score:100` + `category_scores` is rejected by `validateAiNarrative` and the score is deterministic. |
| **B7** | Ungrounded AI narrative | **FIXED** | `validateAiNarrative` rejects invented %, team sizes, prices, dates, `Nx` multipliers, invented quotes, markup/control chars, and any score/objection field; de-dupes already-asked questions. |
| **B8** | Nav touch targets | **FIXED** | Measured 44×44 at 320/375/desktop; stays ≥44 while dock-magnified (grows to 46–50, never shrinks); no overlap, no body overflow. |
| **B9** | Muted-text contrast | **PARTIALLY FIXED** | `ink-muted` now 4.74:1 (was 3.45:1) ✅. But `caution` warning text measured **4.16:1 at 12px — still fails AA** (new Major finding). |
| **B10** | No error containment / storage crash | **FIXED** | `ErrorBoundary` renders a recovery screen (also observed catching a real runtime fault live); `save()` returns a typed `SaveOutcome`, evicts-oldest-and-retries on quota, reports `unavailable` on SecurityError, never throws. |
| **B11** | Retry double-scoring | **FIXED** | Fail-once provider: after retry, exactly one seller turn, one score entry, reward counters unchanged, last turn is the customer reply. |
| **B12** | Active-call refresh warning | **FIXED** | `beforeunload` installs with a draft or a turn, not idle, removed after End Call / unmount (unit + prior browser). |
| **B13** | Insufficient-evidence reports | **FIXED** | `none`/`limited`/`sufficient` ladder deterministic; several-turn all-trivial call is `limited` with empty strengths. |
| **B14** | Dead `turn_quality` | **FIXED** | Removed from type/validator/provider/prompt/fixtures; `asked_closed_question` retained and still produced (it feeds final analysis). |
| **B16** | Sticky capability warning | **FIXED** | Warning clears on the next successful turn; full fallback history still saved with the session. |
| **B17** | Scenario discoverability | **FIXED** | Scenario stays actionable on the landing page (the one route the navbar lacks). |
| **B18** | Duplicate a11y letters | **FIXED** | Landing exposes 6 actions once each (Home + Scenario + A/L/E/R); 10 DOM buttons, 6 in the a11y tree, 0 duplicates. |

**Every previously-reported critical defect is fixed.** No prior critical defect
re-manifested.

---

# New Critical Findings

**None.**

---

# New Major Findings

### M1 — Warning/notice text fails WCAG AA contrast
- **Severity:** Major (accessibility) · **Confidence:** Certain (measured in browser)
- **What:** `caution` `#B66A08` on white computes to **4.16:1** at 12–14px normal
  weight; AA requires 4.5:1. Used for meaningful text throughout: the
  "Limited evidence" / "Not scored" banners, the save-failure notice, capability
  warnings, "Evaluation notices", the "Biggest missed opportunity" heading,
  "Missed opportunities", and seller input errors (`text-caution` appears in 8+
  components).
- **Why it slipped:** Repair Phase 3 darkened `ink-muted` (3.45 → 4.74) but did
  not re-check the `caution` token, which carries a comparable class of small
  meaningful text.
- **Fix:** darken `caution` to ≈ `#8A5108` (≈ 4.9:1) or reserve the current
  orange for ≥18px/bold text only. ~1 hour incl. re-measure.
- **Note:** `positive` `#15835B` (~4.6:1) and `critical` `#C73E3E` (~5.0:1) pass.
  A transient measurement of the green "Live" pill at "ratio 1" was an
  alpha-handling artifact in the probe, not a real failure.

---

# Minor Findings

### m1 — AI security depends on an operator config step (deploy caveat)
The capability requirement only engages when `AI_CAPABILITY_SECRET` is set. If
an operator sets `OPENAI_API_KEY` but **not** the capability secret, the routes
fall back to rate-limit + same-origin only, and a non-browser client that omits
`Origin`/`Referer` passes the same-origin check (documented policy) and reaches
the model, bounded only by 40/min/instance. Confirmed by probe (no-header
request → 200 through a leaky core). **Deployment gate:** production with AI
enabled MUST set `AI_CAPABILITY_SECRET`. Recommend failing loud (or logging a
prominent warning) when a key is present but the secret is not.

### m2 — Capability token is a replayable bearer token (15-min window)
The token binds only to expiry and scope, not to the client. A script running in
the page origin can read a fresh token (same-origin GET) and replay it for its
15-minute life, refreshing by reloading. This raises the bar well above `curl`
but is not a per-user quota. Acceptable for the threat model (protecting the
owner's credit from casual abuse); note it honestly and don't oversell it.

### m3 — In-memory rate limiter is per-instance
Already documented in code. On serverless it bounds one hot instance, not the
deployment; effective ceiling is 40/min × instance count. Fine as a runaway-loop
guard; replace with a shared store for a real global quota.

### m4 — Rate limit is checked before same-origin
Cheap-check-first ordering means a cross-origin flood consumes that IP's own
rate bucket before the 403. Because buckets are per-`clientId`, this cannot
starve legitimate same-origin users, but it does spend work on obviously-invalid
requests. Cosmetic; reordering (origin → rate) is marginally cleaner.

### m5 — Contrast/assistive behaviour has no automated regression test
There is no unit test asserting token contrast ratios, so M1 was invisible to CI
and only surfaced by manual measurement. A tiny pure-function contrast test over
the palette would prevent recurrence.

---

# Architecture Assessment — 8.5/10

Clean provider abstraction with per-capability deterministic fallback; one
`ConversationEngine` instance owns transcript/memory/stage/objections/scoring;
pure modules (`scoring`, `detect`, `analyze`, `narrative`, `dock`, `capability`,
`aiGuard`) are individually testable. Server handlers are framework-agnostic and
shared by the Vercel adapters and Vite dev middleware, so local and prod cannot
drift. No circular dependencies observed; `node:crypto` stays server-side (not in
the client bundle). The engine is framework-agnostic and re-created only on
explicit reset (with `dispose()` bumping the epoch first). Deductions: the AI
security relies on a runtime config step (m1), and there is minor duplication
between the Demo and LLM final evaluators' score assembly.

# State-Machine Assessment — 9/10

The call-epoch design is the standout repair. Every async continuation captures
its epoch and bails after each `await` if it moved (start/end/dispose bump it),
which structurally prevents post-completion mutation — a plain AbortController
would not, since deterministic providers resolve after abort. Verified: double
start → one opening; double send → one turn; submit-after-complete → ignored;
End Call mid-eval/mid-generation → frozen; dispose during fetch → discarded;
retry regenerates only the reply. No impossible `finalReport + WaitingForSeller`
state reachable. One residual class not exercised here: interleaving voice
playback with rapid A↔L navigation was checked for state preservation and zero
extra API calls, but audio race conditions on real hardware remain unverified.

# Scoring and Evaluation Assessment — 8/10

Signals→deterministic-score separation holds end to end; the evidence-density +
coverage model plus the divergence guard resist every farming pattern I threw at
it, and category/overall scores stayed in `[0,100]` across the broad suite
(strong, novice, pitcher, repetitive, irrelevant, strong-discovery-no-close,
recovery-after-poor-opening, unsupported, zero/trivial). Strongest/weakest
selection is merit-gated and transcript-grounded. **Explicit caveat:** these
measure **internal fixture agreement and inferred quality**, not **real-world
sales accuracy**, which is unverified — the weights are reasoned, not empirically
fitted, and the calibration fixtures are author-written (a consistency check, not
ground truth). The product presents this honestly.

# Security Assessment — 8/10

Guard wired before body read on all AI routes; capability HMAC is server-only and
constant-time compared; prompts delimit transcript as data; validators reject
score fields, ungrounded quotes, invented numerals, and markup; the built bundle
scans clean of keys, `xi-api-key`, provider URLs, and `createHmac`; errors are
generic. No XSS surface (no `dangerouslySetInnerHTML`/`eval`). Residuals are m1
(config-gated), m2 (bearer replay window), m3 (per-instance limiter) — all
acceptable and documented, none an open-proxy in a correctly-configured deploy.

# Accessibility Assessment — 7/10

Strong: 44×44 targets at every tested width including during magnification;
single-exposure a11y tree; `aria-current` on the active section; real `<button>`
elements; keyboard arrow navigation; decorative shadows/duplicates `aria-hidden`;
`role="alert"` + focused primary action on the ErrorBoundary. **Gap:** M1
warning-text contrast fails AA. **Unverified:** real screen-reader semantics
(NVDA/JAWS/VoiceOver), real touch input, and `prefers-reduced-motion` on real
assistive setups — all verified structurally/emulated only.

# Persistence and Reliability Assessment — 8.5/10

Versioned schema (v2) with migration and corrupted-JSON recovery; typed
`SaveOutcome`; quota → evict-oldest → retry-once → preserve-newest-in-memory +
non-blocking "could not be saved" notice (never a false success claim);
SecurityError → `unavailable`; bounded write attempts; 25-session retention.
Browser-verified: one log per call, survives reload, stores schemaVersion 2 +
providerModes + fallbackWarnings. ErrorBoundary contains render/effect faults
(observed live). Session size ~37KB/20 turns → ~0.9MB at full retention, well
under quota in normal use.

---

# Unverified Areas (explicit)

- **Live OpenAI behaviour** — persona fidelity, injection resistance against a
  real model, malformed/partial/truncated streaming. All AI paths exercised via
  mocks only; no paid call succeeded (no credit).
- **ElevenLabs audio** — never produced; voice ID never validated.
- **Real assistive tech** — screen readers, real touch devices, reduced-motion
  on assistive hardware.
- **Real serverless deployment** — never deployed; rate-limit distribution,
  cold-start behaviour, and header population (`x-forwarded-for`, `origin`) on
  the target platform are assumed, not observed.
- **Voice/mic race conditions on real hardware** — coordination logic is
  correct in code and tests, but real-device audio timing is unverified.

---

# Missing Tests

1. **Palette contrast** — a pure-function AA check over `ink-muted`/`caution`/
   `positive`/`critical`/accent on their surfaces (would have caught M1).
2. **Route-level guard integration** — existing tests cover `guardAiRequest` and
   handlers separately; an end-to-end `createAiRoute` test (cross-origin/expired
   capability/rate-limit through the adapter) exists only as my throwaway probe.
3. **No-secret dev-safe path** — assert that with no `AI_CAPABILITY_SECRET`, a
   no-Origin request is allowed (documents m1 explicitly so it can't regress
   silently into "we thought this was closed").
4. **Capability token replay/expiry boundary** — token valid at T, invalid at
   T+ttl (exists for `verifyCapability`; not at the route level).
5. **Reduced-motion** assertions on the dock/intro beyond the shell.
6. **Weak-assertion note:** the `SalerNav.a11y` test asserts the `min-h/min-w`
   *class strings*, not computed pixels — jsdom has no layout, so the real 44×44
   guarantee is browser-only. Acceptable but worth stating in the test.
7. **Voice/mic coordination** under rapid navigation is covered for state, not
   for playback races.

**jsdom false-confidence to flag:** pixel geometry, contrast, focus-ring
visibility, and real motion are not observable in jsdom; those guarantees rest on
browser verification, which is manual and not in CI.

---

# Deployment Recommendation

## READY WITH MINOR FIXES

**Confidence:** High for the deterministic product (every critical defect
independently reproduced as fixed); N/A for live model behaviour (unverifiable
without credit). **Production-readiness: ~90%** for a Demo-Mode deployment,
**~85%** for a credentialed AI deployment.

### Required before deployment
1. **Fix M1** — darken `caution` to meet AA (≈ `#8A5108`), re-measure. (~1h)
2. **Gate m1** — when deploying with AI enabled, set `AI_CAPABILITY_SECRET`;
   ideally make the server log a loud warning (or refuse) when `OPENAI_API_KEY`
   is present without it. (~1–2h)
3. Add the palette-contrast regression test (missing test #1). (~1h)

*(A Demo-Mode deployment with no AI/voice keys needs only M1 + the contrast test;
it is otherwise ready.)*

### Recommended after deployment
- Replace the in-memory limiter with a shared store for a real global quota (m3).
- Reorder guard checks origin-before-rate (m4).
- Add route-level guard + no-secret + token-boundary integration tests (#2–#4).
- Obtain OpenAI credit and run the live-AI verification pass (persona, injection,
  malformed output) that is currently mocks-only.
- Real screen-reader, touch, and reduced-motion passes on hardware.

### Estimated engineering hours
- **Blocking (M1 + m1 gate + contrast test):** ~4–5 h.
- **Recommended post-deploy (m3/m4 + integration tests + a11y hardware pass):**
  ~16–22 h.
- **Live-AI + ElevenLabs verification (requires credit; not code):** ~10–14 h.
- **Total to "fully verified production":** ~30–40 h, most of it gated on
  external credit and real hardware rather than code changes.

---

*No application source was modified during this audit. Only this document was
created; all temporary probes were deleted before completion.*
