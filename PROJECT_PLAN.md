# SalesSim — AI Sales Roleplay Coach · PROJECT_PLAN

> Living checklist. Updated at the end of every stable phase.
> Status legend: `[ ]` not started · `[~]` in progress · `[x]` done & verified · `[!]` blocked / needs your action

---

## Phase 0 — Environment inspection & architecture  `[x]`
- [x] Inspect project directory (empty confirmed)
- [x] Identify OS (Windows 11, build 26200)
- [x] Verify Node / npm / Git present
- [x] Check ElevenLabs MCP availability (NOT connected — noted)
- [x] Check Git status (not a repo yet)
- [x] Explain proposed architecture in plain language
- [x] Create this PROJECT_PLAN.md
- [ ] You approve Phase 0 → we proceed to Phase 1

## Phase 1 — Application shell & static interface  `[x]`
- [x] Scaffold Vite + React + TypeScript (built manually for full control)
- [x] Add Tailwind CSS, ESLint (flat config), Vitest config
- [x] Dark-navy enterprise theme + layout shell (top bar, responsive nav)
- [x] Static screens: Scenario Briefing, Live Roleplay (mock), Final Report, History
- [x] `.gitignore`, `.env.example`, `git init` + first commit
- [x] Checks: typecheck ✅ · lint ✅ · tests ✅ (3/3) · build ✅ · 0 vulnerabilities
- [x] Visual smoke check in browser (renders correctly)

## Phase 2 — Typed roleplay & Demo Mode  `[x]`
- [x] ConversationProvider abstraction (Demo + LLM, identical interface)
- [x] LLMConversationProvider disabled until API config exists
- [x] Conversation engine: transcript, memory, stage, objections, state
- [x] State machine: Idle · GeneratingReply · WaitingForSeller · Evaluating · Completed · Error
- [x] AI customer persona module (Rohan Mehta) — separate, deterministic, non-repeating
- [x] Typed input + transcript rendering + loading indicator + stage updates
- [x] End Call → deterministic placeholder report (replaced by real evaluator in Phase 4)
- [x] Error handling: empty input, provider failure, invalid response, unavailable provider
- [x] Tests (37 total): engine, transitions, transcript, provider switching, demo provider, End Call
- [x] Checks: typecheck ✅ · lint ✅ · tests ✅ (37/37) · build ✅
- [x] Verified interactive flow in browser (discovery → objection → report)

## Phase 3 — Real-time evaluator & deterministic scoring  `[x]`
- [x] RealTimeEvaluatorProvider abstraction (Demo + LLM, identical interface)
- [x] LLM evaluator disabled until a secure endpoint exists
- [x] Deterministic signal detection (keywords, structure, context, length, repetition)
- [x] Strict runtime validation + safe fallback + non-blocking warning
- [x] Pure scoring engine: signal→score functions, clamp, immutable, reason log
- [x] Diminishing repeated rewards; penalties always apply
- [x] Pre/post-objection weighting; objection handling excluded until an objection
- [x] Smoothed visible score with ≤8-point/turn movement cap
- [x] Momentum from visible-score history (documented rule)
- [x] Score history entry written every seller turn
- [x] Engine flow: WaitingForSeller → Evaluating → GeneratingReply → WaitingForSeller
- [x] Live UI: overall, stage, momentum, feedback, next move, collapsible metrics, SVG trend, warning
- [x] Tests (106 total): evaluator, scoring, momentum, integration, UI
- [x] Checks: typecheck ✅ · lint ✅ · tests ✅ (106) · build ✅
- [x] Browser-verified all 11 steps (discovery↑, pitch penalty, objection activation, report)

### Architecture note — real-time scoring (Phase 3)
- **Signals, not scores.** The evaluator returns *behavioural signals* (booleans)
  + hints, never persistent metric values. An LLM must never write scores
  directly, or scoring becomes an opaque, unrepeatable black box.
- **Deterministic scoring.** Pure TS functions convert signals → metric deltas.
  Same signals ⇒ same numbers, so every score is explainable and unit-testable.
- **Conditional objection weighting.** Objection Handling isn't a real skill to
  assess until Rohan raises an objection, so it's excluded from the overall
  (and shown "Not yet assessed") pre-objection, then included post-objection
  with a re-normalised weight set (both weight sets sum to 1.0).
- **Smoothing + movement cap.** The visible overall moves toward the raw
  weighted score but never more than ±8 points/turn, preventing jarring jumps.
- **Repeated-reward control.** Diminishing returns per signal (full, ½, ¼, then
  0) stops "farming" the same achievement; penalties are never diminished.
- **Failure handling.** If the evaluator throws or returns an invalid shape, the
  engine substitutes a safe no-op result, shows a non-blocking warning, still
  writes a history entry, and the roleplay continues — evaluation never ends
  the call.
- **Execution order.** Evaluation runs *sequentially before* customer
  generation: the evaluator scores the exact pre-reply state, avoiding races.
  Evaluator output is never fed to the customer persona (no coaching leak).

## Phase 4 — Final report & session history  `[x]`
- [x] FinalEvaluatorProvider abstraction (Demo + LLM, identical interface)
- [x] LLM final evaluator disabled until a secure endpoint exists
- [x] Deterministic final transcript evaluator (7 categories, documented weights)
- [x] Strict schema validation + safe fallback + non-blocking warning
- [x] Live-vs-final comparison (score, difference, deterministic explanation)
- [x] Strongest/weakest statements are always real transcript entries
- [x] Objection analysis with a documented handled rule; only raised objections
- [x] Missed discovery questions from genuine gaps only
- [x] Recommended practice targeted at the weakest area
- [x] Short-call handling (0/1/2 turns) without fake precision
- [x] Versioned localStorage repository (save/list/get/delete/clearAll)
- [x] Corrupted-storage recovery, migration-ready versioning, 25-session retention
- [x] End Call flow: evaluate → validate → fallback → build → persist → display
- [x] Duplicate-save prevention (idempotent by id + ref guard)
- [x] Full report UI + session history UI; all placeholder labelling removed
- [x] Tests (179 total): final evaluator, persistence, end-call integration, UI
- [x] Checks: typecheck ✅ · lint ✅ · tests ✅ (179) · build ✅
- [x] Browser-verified all 15 steps (short call → multi-turn → history → corruption)

### Architecture note — final report & persistence (Phase 4)
- **Live vs final evaluation.** Live scoring rates each turn *incrementally* as
  the call unfolds (signals → deterministic deltas → smoothed visible score).
  Final scoring judges the conversation *as a whole* — discovery coverage,
  progression, objection outcomes, and whether a next step was earned. They
  answer different questions, so they legitimately differ; the report shows
  both plus a deterministic explanation of the gap.
- **Deterministic final score.** Seven category scores are computed from
  evidence (per-turn signals in the score history + transcript facts), never
  copied from the final live metrics. Overall = weighted blend:
  discovery .22, problem identification .18, value articulation .15,
  objection handling .15, opening .10, clarity .10, closing .10 (sum 1.0).
  When no objection was raised, objection handling is **excluded** and its
  weight redistributed proportionally, so a clean call is never penalised for
  a dimension that never became relevant.
- **Objection-handled rule.** Behaviour is attributed to the correct objection
  using the seller turns between when it was raised and the next objection.
  *Strongly handled* = acknowledged + clarified + answered + confirmed;
  *handled* = answered AND (acknowledged OR clarified); *not handled* =
  ignored or never answered. Objections that were never raised are never
  listed and never marked failed.
- **Session schema & versioning.** Stored records carry `schemaVersion`
  (currently 1). On read, each record passes through `migrate()`; unknown or
  newer versions are dropped rather than misread, leaving a clear hook for
  real migrations later.
- **Corrupted-storage recovery.** Unparseable JSON resets storage to `[]` and
  surfaces a one-shot warning; individually malformed records are skipped
  while good ones survive. The app never crashes on bad storage.
- **Only completed sessions persist.** An in-progress call has no final report
  and would pollute history with half-finished rows, so the session is built
  and saved only at End Call.
- **Fallback reports prevent data loss.** If the final evaluator throws or
  returns an invalid shape, a grounded fallback (based on the live average) is
  substituted, a warning is stored and displayed, and the session is still
  saved — the transcript and score history are never lost.

## Phase 5 — Browser speech input  `[x]`
- [x] SpeechRecognitionProvider abstraction (Browser + Mock), no browser APIs in components
- [x] Typed Web Speech API declarations (no `any`), standard + webkit prefixes
- [x] Recognition states separate from the conversation engine
- [x] Mic permission requested only on explicit user action
- [x] Interim / final / editable-draft tracked separately; no auto-submit
- [x] Controls: Speak, Stop, Cancel, Clear draft; double-start guarded
- [x] Voice and typed input converge on the same submitSeller path
- [x] Mic disabled during Evaluating / GeneratingReply / Completed
- [x] Media-coordination guard prepared for Phase 6 audio output
- [x] Accessibility: labels, aria-live, focus return, no colour-only state, reduced motion
- [x] Error mapping with friendly messages; no repeated permission prompts
- [x] Cleanup on unmount, navigation, and End Call
- [x] Tests (253 total): provider, hook, coordination, UI, integration
- [x] Checks: typecheck ✅ · lint ✅ · tests ✅ (253) · build ✅
- [x] Browser-verified: real permission-denied path, typed fallback, mobile layout, privacy

### Architecture note — speech input (Phase 5)
- **Provider abstraction.** `SpeechRecognitionProvider` has two implementations
  (browser + mock). React components never call `SpeechRecognition` directly,
  so the fragile browser API is isolated in one testable place and the UI can
  be driven deterministically in tests.
- **Recognised text is editable before sending.** Speech-to-text makes
  mistakes, so final results land in a draft the user can correct. Nothing is
  ever auto-submitted, and recognised text never enters the conversation
  transcript until the user presses Send.
- **One submit path.** Typed and spoken input both call the same
  `submitSeller`, so there is exactly one conversation/scoring pipeline — voice
  cannot drift from typed behaviour or bypass evaluation.
- **Browser support.** Chromium browsers expose `webkitSpeechRecognition`;
  Firefox generally has none; recognition needs a secure context and an
  internet connection, and stops itself after silence. We therefore use a
  manually controlled session (not endless continuous listening) with a
  30-second safety auto-stop, default language `en-IN` (configurable in code).
  Where unsupported, the mic is disabled and typed input carries the whole app.
- **Privacy.** No raw audio is captured, stored, or uploaded anywhere; interim
  text is never persisted; only submitted seller text enters the transcript and
  session history. Recognition is performed by the browser's own service, which
  for Chromium typically means audio is sent to the browser vendor — this is
  **not** a fully local/offline feature and is not claimed to be.
- **Cleanup lifecycle.** Sessions are aborted and handlers detached on unmount,
  on navigating away, when the conversation stops accepting input (Evaluating,
  GeneratingReply, End Call), and before every submit — so no stale handler can
  fire and no recognition outlives the call.
- **Phase 6 preparation.** `computeMediaActivity()` already blocks listening
  while customer audio is playing or preparing, so adding ElevenLabs output
  will not require reworking microphone logic (this prevents the mic hearing
  the customer's own voice).

## Phase 6 — ElevenLabs secure voice integration  `[~]`

### Phase 6a — voice output foundation (no key required)  `[x]`
- [x] VoiceProvider contract + VoiceState
- [x] BrowserSpeechSynthesisProvider (fallback)
- [x] SilentVoiceProvider (terminal fallback, always available)
- [x] MockVoiceProvider — test-only, never in the production chain
- [x] FallbackVoiceProvider orchestration + factory
- [x] MediaCoordinator + extended coordination (input/output exclusivity)
- [x] useVoiceOutput hook with turn-id deduplication
- [x] Voice UI: provider badge, preparing/speaking, Stop Speaking, Voice toggle,
      manual play after autoplay block, fallback warning
- [x] Tests (313 total) · typecheck ✅ · lint ✅ · build ✅
- [x] Secret scan of source **and built bundle** — no key present
- [x] Browser-verified: browser-voice fallback, one utterance per new turn,
      voice toggle, no playback on report/history/refresh, no audio persisted
- [x] **[!] Manual: ElevenLabs API key added locally (verified by existence only)**

### Phase 6b — ElevenLabs provider + secure route  `[x]`
- [x] **[!] Manual: ELEVENLABS_VOICE_ID added (verified by existence only)**
- [x] `POST /api/speak` serverless route (key server-side only, never `VITE_`)
- [x] Core handler is framework-agnostic; Vercel adapter + Vite dev middleware
      share it, so local and production behaviour match
- [x] ElevenLabsVoiceProvider (calls only `/api/speak`, never sees a key)
- [x] Upstream mapping: 402/429 → quota, 401/403 → auth, 503 → configuration,
      non-audio / empty → invalid response, abort/timeout → safe error
- [x] Best-effort in-memory rate limiting (20/min per caller)
- [x] Server-route tests with mocked upstream (22) + provider tests (17)
- [x] 356 tests · typecheck ✅ · lint ✅ · build ✅
- [x] Secret scan: no key, no `xi-api-key`, no `api.elevenlabs.io` in the bundle

### Architecture note — secure voice route (Phase 6b)
- **The browser never holds a credential.** `ElevenLabsVoiceProvider` posts
  `{ text }` to our own `/api/speak`; only the server reads
  `ELEVENLABS_API_KEY`. Verified by scanning the built bundle.
- **Voice ID is server-side configuration**, not a client input, so a caller
  cannot point the route at an arbitrary voice. A missing key *or* missing
  voice ID returns the same generic `VOICE_NOT_CONFIGURED` — the response never
  reveals which value is absent.
- **Upstream bodies are never forwarded or logged.** Only a numeric upstream
  status is exposed to a server-side diagnostic hook.
- **Request hardening:** POST only, JSON only, trimmed text, 600-character cap,
  64 KB body cap, 15s upstream timeout, and best-effort rate limiting.
- **Non-streaming by design:** one request → one audio blob → one playback.
  Object URLs are revoked on every exit path (success, failure, cancel).
- **Self-disabling:** on 503/401 the provider marks itself unavailable for the
  session so the app stops calling a route that cannot work. A 402/429 quota
  error does **not** disable it — quota can be restored mid-session.

#### Verification status — actual vs mocked (honest)
- **Verified against the real ElevenLabs API:** the route reaches ElevenLabs
  and receives a real HTTP response. The upstream returned **HTTP 402**, which
  confirms only that **usable credits were unavailable**. It does **not**
  validate the configured voice ID, because upstream validation order is not
  guaranteed — a request can be rejected for billing before the voice ID is
  ever checked.
- **NOT verified:** actual ElevenLabs audio playback **and the voice ID**.
  No ElevenLabs audio has ever been produced or heard from this app.
- **Verified live in-browser:** the full three-step fallback
  (ElevenLabs 402 → Browser voice → Silent Mode), the honest "Silent Mode"
  label plus its notice, one utterance per new customer turn, no playback on
  End Call, and every request-validation guard (405/400/413/415).
- **Mocked only:** ElevenLabs success path, 401/429/timeout/non-audio handling,
  object-URL revocation, autoplay rejection, and cancellation.

### Architecture note — voice output (Phase 6a)
- **Provider chain.** Production order is **ElevenLabs → Browser voice →
  Silent Mode**. `SilentVoiceProvider` is always available and always last, so
  `speak()` can never leave the roleplay broken. `MockVoiceProvider` lives in
  `src/voice/testing/` and is never imported by the factory.
- **One attempt per provider per utterance** — no retry storms. The UI shows
  the provider that *actually* spoke, so a fallback is never misreported as
  ElevenLabs.
- **Turn deduplication.** Playback is keyed by transcript **turn id**, marked
  *before* the async call. Re-renders, StrictMode double-invocation, remounts,
  navigation, refresh, and viewing history therefore cannot replay a turn.
  `isLiveCall` additionally gates out briefing, report, history, completed
  calls, and hydrated transcripts.
- **Media exclusivity.** `computeMediaActivity()` is the single source of truth:
  the mic cannot start while audio is preparing/playing, and output cannot
  start while recognition is active. `MediaCoordinator` brokers the two — voice
  output asks the *speech controller* to stop, so no component touches another
  component's browser APIs.
- **Autoplay.** A blocked autoplay is not a failure: the reply stays visible,
  a "Play customer response" button appears, and nothing auto-retries.
- **Privacy/secrets.** No audio is stored, no object URL persisted, nothing
  audio-related enters saved sessions. The key is server-side only and never
  appears in client source or the built bundle (scanned).
- **Verification status.** Browser voice and Silent Mode were verified in a
  real browser. **Actual ElevenLabs playback is not yet implemented or
  verified** — it lands in Phase 6b once a voice ID is configured.

## Phase 7 — Secure AI integration  `[x]`
- [x] Provider chosen: **OpenAI-compatible** (no Gemini/Anthropic key present)
- [x] Secure routes: `/api/conversation`, `/api/evaluate-turn`,
      `/api/evaluate-final`, plus a secret-free `/api/ai-status` probe
- [x] Shared framework-agnostic handlers (Vercel adapters + Vite dev middleware)
- [x] LLM providers wired for all three capabilities
- [x] Per-capability independent fallback with honest AI/Demo labelling
- [x] Session schema v2 + v1→v2 migration recording provider modes
- [x] 398 tests · typecheck ✅ · lint ✅ · build ✅
- [x] Secret scan: no key, no provider URL, no system prompt in the bundle

### Architecture note — secure AI integration (Phase 7)
- **Route architecture.** The browser never calls a model provider. It posts to
  same-origin routes; only the server reads `OPENAI_API_KEY`. Core handlers are
  dependency-injected so the Vercel functions, the Vite dev middleware, and the
  tests all execute identical logic.
- **Provider-independent fallback.** AI Mode is **not** all-or-nothing. The
  customer, turn evaluator, and final review each fall back to their
  deterministic counterpart on failure, independently, per request. A failed
  model never ends a call and never loses a session.
- **Deterministic scoring stays authoritative.** The AI evaluator returns
  **signals only** — the same 19 booleans the deterministic evaluator produces,
  validated by the same validator. It cannot write a score, weight, or metric.
- **Structured validation.** JSON-mode output, conservative fence-stripping (no
  permissive "repair" parsing), then strict schema validation. The final report
  is additionally checked against the transcript: an invented quote or an
  objection that was never raised is rejected and the deterministic report is
  used instead.
- **Cost controls.** Bounded context (12 recent turns for the customer, 8 for
  evaluation, 40 for the final review), capped output tokens, a 600-character
  cap on customer replies, transcript/message size limits, and **one request
  per capability per turn** with no retries beyond the single fallback.
- **Request deduplication.** Each provider aborts a prior in-flight request
  before starting a new one; the final review runs exactly once per completed
  call; playback and evaluation are keyed so re-renders cannot duplicate work.
- **Honest labelling.** The live screen shows which implementation produced the
  last customer reply and the last evaluation; the saved session records
  `providerModes` (`ai` / `demo` / `mixed`) per capability, and the report
  displays them.

#### Verification status — actual vs mocked (honest)

**Live attempt made with the user's project key (2026-07-23).** The key was
loaded specifically from this project's `.env.local` — `vite.config.ts` now
re-reads that file *after* `loadEnv` so a same-named ambient shell variable
cannot take precedence (confirmed: the two values differ).

- **Live AI generation: NOT VERIFIED.** Every request was rejected upstream
  with **HTTP 429 / `insufficient_quota`** — the OpenAI project has no
  available credit. **3 live attempts total**, all rejected at the quota gate,
  so **no tokens were billed**. Latency of a rejected call: ~0.3–1.6 s.
  This is consistent with a valid key on an account without credit, but key
  validity is **not asserted as proven** (provider validation order is not
  guaranteed).
- **Therefore unverified against a real model:** Rohan's in-character
  behaviour, reply conciseness, absence of coaching, natural objection
  emergence, live signal quality, and final-report quoting.
- **Verified live, in-browser, with zero credits consumed:**
  - `/api/ai-status` correctly reports configuration state.
  - Every validation guard (405 / 400 / 413) on all three AI routes, rejecting
    before any upstream call.
  - Real upstream failure → **per-capability deterministic fallback**: the call
    continued, the scripted persona replied, deterministic scoring ran
    (Discovery 40→50), coaching text appeared, and a capability warning was
    shown. Provider labels switched honestly to "Demo".
  - **Exactly one** `/api/conversation` and **one** `/api/evaluate-turn`
    request per seller turn, and one `/api/evaluate-final` per completed call —
    no duplicates on re-render, no retry storms.
  - Session persisted at **schema v2** with `providerModes` and fallback
    warnings; no prompts or secrets in stored sessions.
  - Server-side diagnostic surfaced only the short error code
    (`insufficient_quota`) — never the upstream message or the key.
  - A full **AI-success path with mocked routes**: labels read "AI Customer" /
    "AI Evaluation", AI coaching text rendered, and the **deterministic engine
    still set the score** from signals alone.
- **Mocked only:** all upstream model behaviour — success payloads, auth
  failure, rate limiting, timeouts, malformed JSON, and schema violations.
- **To complete live verification:** add credit to the OpenAI project. No code
  change is required; the AI providers are already first in every chain.

## Phase 7b — Testing & resilience  `[x]`
- [x] Scoring tests (all cases)
- [x] Conversation tests (valid/invalid JSON/empty/limits/demo)
- [x] Voice tests (fallback/cancel/overlap)
- [x] Persistence tests (save/read/delete/corrupt)
- [x] Checks + commit (folded into later phases; suite now 576 tests)

## Phase 8 — Visual transformation  `[x]`
- [x] White editorial system, single #315CFF accent (committed 5e3945c)
- [x] SALER intro overlay, transcript-first roleplay, narrative report

## Phase 9 — Deployment preparation & docs  `[~]`
- [x] Pre-deployment audit (git clean, scripts, adapters, routes, env)
- [x] Fixed stale `.env.example` (removed unread LLM_PROVIDER/LLM_API_KEY)
- [x] `vercel.json` — SPA rewrite excluding `/api`
- [x] Node engine pinned (>=20); restored safe production upstream diagnostics
- [x] README.md, docs/INTERVIEW_GUIDE.md, docs/DEMO_SCRIPT.md
- [x] typecheck · lint · tests (409) · build all green
- [x] Secret scan: tracked source + built bundle clean
- [ ] **[!] Manual: create GitHub repo + import to Vercel (no CLI/remote here)**
- [ ] Production smoke test (after your deploy)

### Deployment architecture
- Static Vite build → `dist/`; each `api/*.ts` becomes a Vercel serverless
  function; `vercel.json` rewrites non-`/api` paths to `index.html` so refresh
  never 404s. Client calls same-origin `/api/*` only.
- Dev middleware and Vercel adapters share the handlers in `src/server/`, so
  local and production behave identically (prod adds only a body cap + rate
  limit).
- All five env vars are server-side and OPTIONAL; the app deploys and runs in
  Demo Mode with none set. No `VITE_` secret; no client `import.meta.env`.

### Required-vs-optional environment classification
| Variable | Class |
| --- | --- |
| `OPENAI_API_KEY` | Optional enhancement — deterministic fallback |
| `OPENAI_BASE_URL` | Optional — defaults to OpenAI |
| `LLM_MODEL` | Optional — defaults to gpt-4o-mini |
| `ELEVENLABS_API_KEY` | Optional enhancement — browser/silent fallback |
| `ELEVENLABS_VOICE_ID` | Optional — required only alongside the key |

## Post-audit repairs

A production-readiness audit reproduced four confirmed defects. Repair Phase 1
addresses call integrity and coaching integrity; AI-route security is a
separate, later phase.

### Repair Phase 1 — call & coaching integrity  `[x]`
- [x] **Async call-completion race.** Call-epoch mechanism: every async step
  captures its epoch and discards its result after each await if the epoch
  moved on. End Call during an in-flight turn can no longer append a late
  reply, revive a completed call, or mutate score history after completion.
- [x] **Idempotent End Call.** Stable call id created once in `start()` and
  reused by `endCall()`; repeated/concurrent/post-resurrection calls resolve to
  one session. No timestamp-derived identity.
- [x] **Retry double-scoring.** Retry regenerates only the customer reply; the
  seller turn is never re-appended or re-scored.
- [x] **Fabricated strengths removed.** `buildStrengths` is 0–3, evidence-only,
  no filler; schema/validator accept 0–3; UI renders an honest empty state.
- [x] **Merit-gated strongest moment.** Punctuation-only/trivial turns are never
  the strongest moment; `''` when nothing qualifies.
- [x] **Final score reworked against spam.** Evidence-density + coverage model
  with repetition/noise penalties across categories, plus a live-vs-final
  divergence guard. Strong concise (69) reliably beats 20-turn spam (≤31).
- [x] **Minimum-evidence policy.** `none`/`limited`/`sufficient`; a zero-turn
  call is "Not scored" with no fabricated precision.
- [x] Tests: +25 (race/idempotency/retry, narrative grounding, spam-vs-strong,
  evidence). Suite **576**, all green. Adversarial battery (100 random / 20
  farming / 10 trivial / 10 race / 10 retry) — zero invariant violations.
- [x] typecheck · lint · build green; bundle secret scan clean.
- See `docs/SCORING_CALIBRATION.md` for formulas, weights, and epoch/retry design.

### Repair Phase 2 — AI route security & deterministic final authority  `[x]`
- [x] **All AI routes guarded** (`aiGuard`): same-origin check, per-client rate
  limit, and a capability requirement — shared by the Vercel adapters and the
  Vite dev middleware so local and prod cannot drift. Errors stay generic.
- [x] **Capability token** (`capability.ts`): short-lived HMAC token, server-only
  secret (`AI_CAPABILITY_SECRET`), issued from `GET /api/ai-capability`, sent as
  `x-saler-capability`. Dev-safe when no secret is set. Never stored in a session.
- [x] **Deterministic final-score authority**: `/api/evaluate-final` returns
  NARRATIVE ONLY and rejects any score/objection field; the client recomputes
  every number with the Repair-Phase-1 analysis. A model `overall_score:100` is
  rejected. Independent fallback to the Demo evaluator preserved.
- [x] **Narrative grounding** (`validateAiNarrative`): length/item caps, no
  markup/control chars, verbatim quotes only, fabricated-fact numerals rejected,
  missed-question de-duplication; plus capped/screened real-time feedback text.
- [x] **Prompt-injection hardening**: transcript delimited as DATA in every
  prompt; deterministic scoring immune regardless of model behaviour.
- [x] Tests: +60 (capability, guard, narrative grounding, score authority,
  injection, client capability/aiFetch). Suite **638**, all green. Security
  probes (100/route volume, cross-origin, missing/expired capability, malformed
  content-type, oversized body, injected scores/facts) — all pass. typecheck ·
  lint · build green; tracked-source and built-bundle secret scans clean (no
  key, prompt, capability secret, or `createHmac` in the client bundle).
- [x] Docs: README security section, INTERVIEW_GUIDE, SCORING_CALIBRATION §6–9.

### Repair Phase 3 — resilience & accessibility  `[x]`
- [x] **Touch targets**: every compact navbar control is a ≥44×44 CSS-px hit
  area (measured 44×44 at rest, growing with the dock, never below 44). The
  glyph stays small; only the invisible box grew. No overlap; 320/375 fit.
- [x] **Contrast**: `ink-muted` darkened `#8A8A8A → #737373` (3.45:1 → 4.74:1,
  browser-measured), meeting WCAG AA for the small meaningful text it carries.
- [x] **Error containment**: a top-level `ErrorBoundary` renders a minimal
  recovery screen (Reload / Return to start) instead of a blank page; no stack
  trace or detail is shown in the UI; dev-only console logging.
- [x] **localStorage quota**: `save()` returns a typed `SaveOutcome`, never
  throws; on quota it evicts the oldest and retries once, else preserves the
  newest in memory and reports failure. The report UI surfaces a non-blocking
  "could not be saved" notice — it never silently claims success.
- [x] **Active-call unload guard**: a `beforeunload` warning installs only while
  a call holds meaningful unsaved state (started, not completed, ≥1 turn or a
  draft) and is removed on completion / navigation / unmount.
- [x] **Capability-warning lifecycle**: the live warning reflects the current
  turn — it clears when the capability recovers — while the full fallback
  history is still saved with the completed session.
- [x] **Accessibility tree**: on a return-visit landing page the large letters
  duplicated by the navbar (A/L/E/R) are muted (aria-hidden, out of tab order,
  still pointer-clickable); Scenario — which the navbar lacks — stays actionable,
  so each destination is exposed exactly once and none becomes unreachable.
- [x] **Dead data**: `turn_quality` removed everywhere (it drove no score and
  was a second, unowned number); `asked_closed_question` retained and documented
  as final-analysis evidence, with a test asserting it is still produced.
- [x] Tests: +27 (ErrorBoundary, quota, unload guard, warning lifecycle, nav
  a11y/touch, save-failure UI, dead-data). Suite **665**, all green. Browser:
  44×44 targets, 4.74:1 contrast, single-exposure a11y tree, unload on/off,
  A↔L preserved with zero extra API calls, no console errors.

### Repair Phase 3.1 — final deployment blockers  `[x]`
Closes the two gaps the fresh re-audit flagged (`docs/PRODUCTION_READINESS_REAUDIT.md`).
- [x] **Caution contrast** — `caution` darkened `#B66A08 → #8A5108`
  (**4.16:1 → 6.44:1** on white, **5.98:1** on the `bg-caution/5` banner surface,
  browser-confirmed rendering `rgb(138,81,8)`). Central token change; all
  warning/notice/missed-opportunity/input-error text inherits it. `positive`
  4.60:1, `critical` 5.02:1, `accent` 5.12:1 all pass.
- [x] **Palette contrast regression tests** — pure `src/theme/contrast.ts`
  (WCAG luminance/ratio/alpha-blend) + a test that reads the REAL hex values out
  of `tailwind.config.js` and asserts every meaningful pairing ≥ 4.5:1 (never
  class strings; large-text exception not used). Would have caught this class of
  bug in CI.
- [x] **Fail-closed AI config** — AI is operational ONLY when `OPENAI_API_KEY`
  AND `AI_CAPABILITY_SECRET` are both set, in every environment. A key without
  the secret: `/api/ai-status` → disabled, AI routes → `503 AI_NOT_CONFIGURED`
  before any model call, one server diagnostic (no secret, no "which secret"
  leak), UI stays Demo Mode. Uses env config, not a client signal. No default
  secret is ever generated.
- [x] **Route-level integration tests** — end-to-end through the production
  `createAiRoute` adapter for all three routes: same-origin+valid-capability
  reaches core; cross-origin 403; invalid/expired capability 401; rate-limit
  429; oversized 413; bad content-type 415; fail-closed 503; Demo Mode; no
  upstream after any rejection; no key/secret/prompt/upstream-body leak; status
  matches availability; expiry boundary; scope isolation.
- [x] **Guard order cleanup (optional, taken)** — reordered to same-origin →
  rate-limit → fail-closed → capability, with explicit ordering tests.
- [x] Tests: +51 (716 total), all green. typecheck · lint · build clean;
  tracked-source and built-bundle secret scans clean.

### Deferred (later work)
- [ ] Replace in-memory rate limiter with a shared store for a distributed quota.
- [ ] Live-AI verification once the OpenAI account has credit (all AI behaviour
  is currently proven against mocks only).
- [ ] Real screen-reader (NVDA/JAWS/VoiceOver) and real touch-device passes —
  the a11y/geometry work above is verified structurally and via emulated
  viewports, not on assistive hardware.

---

## Environment snapshot (Phase 0)
- OS: Windows 11 Home Single Language, build 10.0.26200
- Shell: PowerShell (primary) + Git Bash available
- Node: v24.14.0 · npm: 11.9.0 · npx: 11.9.0
- Git: 2.53.0 · pnpm/yarn: not installed (npm is fine)
- Directory: `C:\Users\dell\Desktop\Saler` — empty
- Git repo: not initialized yet
- ElevenLabs status (corrected):
  - Claude account connector: reportedly enabled (in claude.ai interface)
  - Claude Code local MCP: not configured (absent from user/project/local scopes)
  - Production ElevenLabs API integration: pending (Phase 6, secure server route)
  - Project impact: none for Phases 1–5

## Manual tasks queued for you (one at a time, later)
1. ElevenLabs account + API key (Phase 6) — never pasted into chat.
2. Vercel project + environment variables (Phase 8).
3. LLM provider key (optional; Demo Mode works without it).
