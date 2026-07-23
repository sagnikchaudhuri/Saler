# Saler

**Practice the conversation before it matters.**

Saler is a browser-based AI sales-roleplay coach. You hold a live B2B sales
conversation with a sceptical AI customer, receive coaching while you speak,
and get a full written review when the call ends.

It is built so that **every part degrades gracefully**: with no API keys, no
network, no microphone and no audio, the whole experience still works.

---

## Screenshots

> _Placeholders — replace with real captures before sharing._

| Screen | Image |
| --- | --- |
| SALER intro | `docs/screenshots/intro.png` |
| Scenario briefing | `docs/screenshots/briefing.png` |
| Live roleplay | `docs/screenshots/roleplay.png` |
| Final report | `docs/screenshots/report.png` |
| Session history | `docs/screenshots/history.png` |

---

## Features

- **Live roleplay** against Rohan Mehta, a sceptical Sales Enablement Manager
  who raises objections naturally and never coaches you.
- **Real-time coaching** — a single conversation-health score, momentum, the
  current sales stage, one line of feedback, and a recommended next move.
- **Deterministic scoring** across six dimensions, fully explainable and
  unit-tested.
- **Final coaching report** that reads as a narrative: what happened, the
  strongest and weakest moments, objection analysis, discovery gaps, and one
  specific thing to practise next.
- **Speak or type** — browser speech recognition with an editable draft, so you
  can fix transcription mistakes before sending.
- **Customer voice output** via ElevenLabs, falling back to the browser voice,
  then to Silent Mode.
- **Session history** persisted locally, with the full transcript and report.
- **Demo Mode** — the entire product with no credentials at all.

---

## Architecture

```
Browser (React + Vite)
  │
  │  same-origin fetch only — the client never holds a credential
  ▼
/api/*  (Vercel serverless functions)
  │  conversation · evaluate-turn · evaluate-final · speak · ai-status
  ▼
OpenAI-compatible LLM  ·  ElevenLabs TTS
```

**Request flow for one seller turn:**

```
seller submits
  → Evaluating       evaluator returns behavioural SIGNALS
  → deterministic scoring engine converts signals → score changes
  → GeneratingReply  customer persona produces the reply
  → WaitingForSeller
```

Evaluation runs **before** generation and sequentially, so the score reflects
the exact pre-reply state and there are no races. The evaluator's output is
**never** passed to the customer persona — that is what stops the AI customer
from accidentally coaching you.

### Layout

| Path | Responsibility |
| --- | --- |
| `src/conversation/` | Engine state machine, Rohan persona, providers |
| `src/evaluation/` | Real-time evaluator, signal detection, validation |
| `src/scoring/` | Pure deterministic scoring, weights, momentum, history |
| `src/final/` | Final transcript evaluator and report schema |
| `src/speech/` | Speech-recognition abstraction (browser + mock) |
| `src/voice/` | Voice output chain (ElevenLabs → browser → silent) |
| `src/media/` | Microphone/audio exclusivity coordinator |
| `src/persistence/` | Versioned localStorage repository |
| `src/server/` | Framework-agnostic route handlers |
| `api/` | Thin Vercel adapters over `src/server/` |
| `src/screens/`, `src/components/` | Presentation only |

---

## Providers and fallback design

Every capability is a provider behind an interface, and **each falls back
independently** — AI Mode is not all-or-nothing.

| Capability | Order |
| --- | --- |
| Customer | AI customer → deterministic persona |
| Turn evaluation | AI evaluator → deterministic evaluator |
| Final review | AI reviewer → deterministic reviewer |
| Voice output | ElevenLabs → browser speech synthesis → Silent Mode |
| Speech input | Browser recognition → typed input |

One attempt per provider per turn — no retry storms. The UI always reports the
provider that **actually** handled the request, so a fallback is never
misreported as AI.

---

## Deterministic scoring

The model never writes a score. It returns **behavioural signals** — 19
booleans such as `asked_open_question` or `made_unsupported_claim` — and pure
TypeScript converts those into metric changes.

- Signal → metric deltas are fixed constants (e.g. open question → Discovery +5).
- Scores clamp to 0–100; updates are immutable; every change is logged with a
  reason.
- Repeating the same achievement earns diminishing returns (full, ½, ¼, then
  nothing); penalties always apply in full.
- **Objection Handling is excluded** from the overall score until an objection
  is actually raised, with its weight redistributed.
- The visible score is smoothed and can move at most **8 points per turn**.
- Momentum compares the current score to two turns earlier (±3 threshold), so a
  one-point wobble never flips it.

This is why every score is explainable and repeatable.

## Live vs final evaluation

**Live** scoring rates each turn incrementally as the call unfolds. **Final**
scoring judges the conversation as a whole — discovery coverage, progression,
objection outcomes, and whether a next step was earned — from seven weighted
categories. They answer different questions, so they legitimately differ; the
report shows both plus a deterministic explanation of the gap.

The final reviewer is constrained: quoted statements must appear verbatim in
the transcript, and objections must be ones actually raised. Anything invented
fails validation and the deterministic reviewer takes over.

## Voice architecture

Customer speech is generated server-side and played back non-streaming: one
request, one audio blob, one playback, object URLs always revoked.

The microphone and audio output are mutually exclusive, brokered by
`MediaCoordinator`: the mic cannot open while audio is preparing or playing,
and starting playback closes the mic *through the speech controller* rather
than by reaching into another component. This prevents the mic hearing the
customer's own voice.

Playback is deduplicated by transcript turn id, so re-renders, StrictMode,
navigation, refresh, and opening a historical report can never replay a turn.

## Demo Mode

With no credentials, Saler runs entirely on deterministic implementations. The
conversation, scoring, final report, and persistence are all fully functional.
The UI labels this honestly — it never claims AI or premium voice was used when
it was not.

## Security

- Secrets live only in server environment variables; **no `VITE_` secret
  exists**, and the client contains no `import.meta.env` access at all.
- The browser only ever calls same-origin `/api/*`. It never sees a key and
  never contacts a provider directly.
- Server routes validate method, content type, body shape, and length; upstream
  response bodies are never forwarded, and errors are generic.
- A missing key and a missing voice ID return the *same* error, so the response
  never reveals which is absent.
- No audio is recorded or stored; interim speech text is never persisted; only
  submitted seller text enters the transcript.
- System prompts stay server-side and are never returned to the browser.

---

## Local setup

```bash
npm install
npm run dev
```

Open http://localhost:5173. It works immediately with no configuration.

To enable AI or premium voice, copy `.env.example` to `.env.local` and fill in
what you have. The dev server reads `.env.local` with precedence over ambient
shell variables.

### Environment variables

All are **server-side and optional**.

| Variable | Required? | Effect if omitted |
| --- | --- | --- |
| `OPENAI_API_KEY` | Optional | AI customer and both evaluators fall back to deterministic |
| `OPENAI_BASE_URL` | Optional | Defaults to `https://api.openai.com/v1` |
| `LLM_MODEL` | Optional | Defaults to `gpt-4o-mini` |
| `ELEVENLABS_API_KEY` | Optional | Voice falls back to browser, then Silent Mode |
| `ELEVENLABS_VOICE_ID` | Optional | Same as above — both are required together |

---

## Testing

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

409 tests cover the scoring engine, evaluators, persistence and migration,
speech and voice providers, media coordination, server routes (with mocked
upstreams), and the UI.

---

## Deployment

Deployed on Vercel. The Vite build produces `dist/`; each file in `api/`
becomes a serverless function. `vercel.json` rewrites non-`/api` paths to
`index.html`.

Set environment variables in **Project Settings → Environment Variables**.
None are required — the app deploys and runs in Demo Mode without any.

---

## Known limitations

- **Live AI generation is unverified.** The configured OpenAI project returned
  `insufficient_quota` on every attempt, so no model output has ever been
  produced. The fallback path is verified; the success path is covered only by
  mocked tests.
- **ElevenLabs audio is unverified.** The account returned HTTP 402, so no
  premium audio has ever played, and the configured voice ID is unvalidated.
- Real microphone capture was not exercised in automation; speech input is
  covered by mock-provider tests and a verified permission-denied path.
- Signal detection in Demo Mode is keyword and structure based, so unusual
  phrasing can be missed.
- Session history is per-browser and capped at 25 sessions.
- The intro animation was verified with deterministic timer tests rather than
  visually in motion.

---

## AI-assisted development disclosure

This project was built collaboratively with **Claude (Anthropic)** acting as a
pair programmer, across a phased plan captured in `PROJECT_PLAN.md`. The
architecture decisions, provider boundaries, deterministic-scoring approach,
and verification standards were directed by the author and implemented with AI
assistance. All test results, security scans, and verification claims in this
repository reflect commands actually executed — where something could not be
verified, it is stated as unverified rather than assumed.
