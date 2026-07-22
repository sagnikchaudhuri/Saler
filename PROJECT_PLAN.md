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

## Phase 2 — Typed roleplay & Demo Mode  `[ ]`
- [ ] Conversation engine (turn manager, state)
- [ ] AI customer persona module (Rohan Mehta) — separate from evaluator
- [ ] Scripted Demo Mode customer responses (deterministic)
- [ ] Typed input + transcript rendering
- [ ] Provider-agnostic LLM interface (server route stub)
- [ ] Checks + commit

## Phase 3 — Real-time evaluator & deterministic scoring  `[ ]`
- [ ] Evaluator module returns structured signals (separate from customer)
- [ ] Deterministic signal → score-change functions
- [ ] Clamp / smooth / per-turn cap / objection activation / weighting
- [ ] Momentum from score history
- [ ] Live UI: score, momentum, stage, feedback, next move, chart
- [ ] Unit tests for scoring
- [ ] Checks + commit

## Phase 4 — Final report & session history  `[ ]`
- [ ] Transcript evaluator (final pass)
- [ ] Final report screen (all required fields)
- [ ] localStorage persistence (save/read/delete/corrupt recovery)
- [ ] Session history screen
- [ ] Tests + checks + commit

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
