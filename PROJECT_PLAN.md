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

## Phase 5 — Browser speech input  `[ ]`
- [ ] SpeechRecognition / webkitSpeechRecognition wrapper
- [ ] Typed fallback when unsupported / denied
- [ ] Mic disabled while customer audio plays
- [ ] Checks + commit

## Phase 6 — ElevenLabs secure voice integration  `[ ]`
- [ ] VoiceProvider interface + Mock + BrowserSpeechSynthesis providers
- [ ] Server-side ElevenLabs endpoint (key server-only, never VITE_)
- [ ] ElevenLabsVoiceProvider (client calls server)
- [ ] Quota-exhausted / failure graceful fallback
- [ ] Stop playback control
- [ ] Checks + commit
- [ ] **[!] Manual: you create ElevenLabs account + add key to server env**

## Phase 7 — Testing & resilience  `[ ]`
- [ ] Scoring tests (all cases)
- [ ] Conversation tests (valid/invalid JSON/empty/limits/demo)
- [ ] Voice tests (fallback/cancel/overlap)
- [ ] Persistence tests (save/read/delete/corrupt)
- [ ] Checks + commit

## Phase 8 — Documentation & deployment prep  `[ ]`
- [ ] README.md
- [ ] docs/INTERVIEW_GUIDE.md
- [ ] docs/DEMO_SCRIPT.md
- [ ] Vercel config + serverless routes verified
- [ ] **[!] Manual: you configure Vercel project + env vars**

## Phase 9 — Strict final audit  `[ ]`
- [ ] typecheck · lint · unit tests · production build all green
- [ ] Secret scan before final commit
- [ ] Demo Mode verified working end-to-end
- [ ] Honest limitations documented

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
