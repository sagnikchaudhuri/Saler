# Saler — Interview Guide

## 90-second explanation

> Saler is an AI sales-roleplay coach. You practise a live B2B sales call
> against a sceptical AI customer, get coaching while you speak, and a written
> review at the end.
>
> The interesting engineering is that it's built as a set of independent
> providers, each with a deterministic fallback. The AI customer, the live
> evaluator, and the final reviewer can each drop back to a hand-written
> deterministic version — separately — so the app never breaks because a model
> is unavailable. With no keys at all it runs fully in Demo Mode.
>
> The scoring is deliberately *not* done by the model. The evaluator only
> returns behavioural signals — booleans like "asked an open question" — and
> pure TypeScript converts those into scores. That keeps scoring explainable,
> repeatable, and unit-testable, and it means an LLM can never silently move a
> number.
>
> Everything sensitive stays server-side. The browser only calls same-origin
> API routes and never holds a key. And it's careful about the details:
> exactly one request per capability per turn, honest labelling of AI versus
> fallback, and the microphone and customer voice can never be active at once.

## Architecture request flow

```
seller submits a turn
  → Evaluating       POST /api/evaluate-turn  → behavioural signals (validated)
  → scoring engine   pure TS: signals → metric deltas → smoothed visible score
  → GeneratingReply  POST /api/conversation   → customer reply (validated)
  → WaitingForSeller
End Call
  → POST /api/evaluate-final → coaching report (validated against transcript)
  → session saved to localStorage
```

The client calls only same-origin `/api/*`. Each route is a thin Vercel adapter
over a framework-agnostic handler in `src/server/`, which is the same code the
Vite dev middleware uses — so local and production behave identically.

## Why the customer and evaluator are separate

If one model both role-played *and* scored, coaching would leak into the
dialogue ("Good question! Now try…") and the score would be biased by the
model's own performance. Splitting them keeps the customer believable and the
evaluation independent. The customer persona is never given the evaluator's
output.

## Why the evaluator returns signals, not scores

Two reasons. First, **explainability** — a score of 62 means nothing on its
own, but "open question +5, identified pain +8, pitched too early −5" is
auditable. Second, **control** — if the model emitted scores directly, it could
drift, reweight, or hallucinate numbers. Signals are a narrow, validated
contract; the deterministic engine owns the arithmetic.

## Why deterministic code owns scoring

- Repeatable: same signals always produce the same score.
- Testable: the scoring engine has no I/O, so it's covered by fast unit tests.
- Fair: rules like clamping, per-turn movement caps, diminishing rewards, and
  conditional objection weighting are enforced in one place.
- Safe: even a compromised or confused model cannot corrupt the score.

This holds for **both** live and final scoring. The turn evaluator's LLM returns
signals only; the **final** evaluator's LLM returns **narrative only** (strengths,
summary, coaching prose, verbatim quotes) and *no numbers*. The client recomputes
overall_score, all category scores, the evidence guard, and objection-handled
status locally. A model reply that includes `overall_score: 100` is rejected, and
interpretive text is screened for invented facts (team sizes, percentages, prices,
dates). So the honest answer to "can the AI inflate a score?" is *no — it never
touches a number*.

## Why the AI routes need a capability token

Rate limiting alone doesn't stop a scripted client from burning the owner's
model credit. So the AI routes also require a short-lived, server-signed
capability token (fetched same-origin, sent as a header). The signing secret is
server-only — never a `VITE_` value — so nothing in the browser bundle can forge
one. It's dev-safe: with no secret configured, Demo Mode and local dev need zero
setup. The rate limiter is honestly in-memory/per-instance (a runaway-loop
guard, not a distributed quota), written to swap for a shared store.

## Why providers fall back independently

A single "AI Mode on/off" switch would be brittle — one failing capability
would take down the others, or worse, the app would pretend everything worked.
Instead each capability tracks its own source ("ai" / "demo") and reports it.
A call can be AI customer + deterministic scoring + AI final review, and the
saved session records exactly that as `providerModes`, shown as "mixed".

## How secrets are protected

- Keys are read only in `api/` via `process.env`, never in client code.
- No `VITE_` secret exists; the client has zero `import.meta.env` access.
- The browser talks only to same-origin `/api/*` and never to a provider.
- Upstream bodies are never forwarded; errors are generic; a missing key and a
  missing voice ID return the same error so neither is disclosed.
- Verified by scanning both the tracked source and the built `dist/` bundle for
  key patterns, provider URLs, and prompt text.

## How duplicate calls and audio feedback loops are prevented

- **Duplicate calls:** each provider is invoked once per turn; the final
  reviewer runs once per End Call, guarded by a saved-session-id ref so
  re-renders and repeated clicks cannot re-fire it. The visual redesign added
  no side effects — verified that one turn produces exactly one
  `/api/conversation` and one `/api/evaluate-turn`.
- **Audio feedback loops:** `MediaCoordinator` enforces mutual exclusion — the
  mic cannot open while audio is preparing/playing, and starting playback stops
  recognition through the speech controller. Playback is deduplicated by
  transcript turn id, so nothing replays on re-render, navigation, or refresh.

## Honest limitations

- Live OpenAI generation is **unverified** (project has no credit —
  `insufficient_quota`). Only the fallback path and mocked success are proven.
- ElevenLabs audio is **unverified** (HTTP 402); the voice ID is unvalidated.
- Real microphone capture was tested via mocks and a real permission-denied
  path, not live dictation.
- Demo-mode signal detection is keyword/structure based and can miss unusual
  phrasing.

---

## 10 likely technical questions

**1. Why sequential evaluation before generation, not parallel?**
The evaluator scores the seller's turn against the pre-reply state, so it
doesn't need the customer reply. Sequential ordering removes any race on shared
state and is trivial to reason about; both steps are local. It could be
parallelised with a remote model, but consistency was worth more than the
latency.

**2. How do you stop the model from inventing a report quote?**
The final report is validated against the transcript: `strongest_statement` and
`weakest_statement` must be verbatim seller messages (or empty), and every
`objection_results` entry must be an objection that was actually raised.
Failure → deterministic reviewer. The session still saves.

**3. What happens on malformed JSON from the model?**
`response_format: json_object` is requested, then the response is strictly
parsed (fences stripped, must start with `{`), then schema-validated. Any
failure throws a typed `LlmError` and the capability falls back — the roleplay
never breaks.

**4. How is the visible score smoothed?**
The raw weighted score is computed, then the visible score moves toward it but
at most 8 points per turn, clamped 0–100. This avoids jarring jumps while
keeping direction honest.

**5. Why is Objection Handling excluded early?**
It isn't a real skill to assess until Rohan raises an objection. Before that
it's excluded from the overall and its weight is redistributed, so a clean
discovery call isn't penalised for a dimension that never became relevant.

**6. How does persistence survive corruption?**
The repository is versioned. On read it JSON-parses defensively: unparseable
storage resets to `[]` with a one-shot warning; individually malformed or
unknown-version records are dropped while good ones survive. There's a real
v1→v2 migration for the provider-mode field.

**7. How do you prevent duplicate session saves?**
`endCall()` is idempotent (a second call is a no-op), and the hook that
persists guards on a set of saved session ids, so repeated clicks and
re-renders can't write twice.

**8. Why no state-management library?**
The conversation engine is a plain framework-agnostic class with a subscribe
API, consumed via `useSyncExternalStore`. It's fully testable without React and
needs no external store.

**9. How is the dev/prod boundary kept honest?**
The Vite dev middleware and the Vercel functions call the *same* handlers in
`src/server/`. The only prod-only additions are a body-size cap and rate
limiting. There's no dev-only behaviour the client depends on.

**10. What's actually tested?**
409 tests: pure scoring (clamping, weighting, momentum, diminishing rewards),
signal detection, both validators, persistence + migration + recovery, speech
and voice providers, media coordination, all server routes against mocked
upstreams (including secret-non-leakage assertions), and the UI including the
intro choreography under fake timers.

---

## 5 likely product questions

**1. Who is this for?**
Sales reps and enablement teams who want low-stakes, repeatable practice
against a realistic, sceptical buyer — before a real call.

**2. Why a fixed persona instead of many scenarios?**
Depth over breadth for a focused product: one well-modelled buyer who remembers
context and reveals objections naturally is more convincing than many shallow
ones. The persona is data-driven, so more scenarios are additive.

**3. What makes the coaching trustworthy?**
It's grounded in observable behaviour, not vibes — every score change ties to a
specific signal, and the report quotes your actual words. It also states its
own confidence (e.g. "limited evidence" on very short calls).

**4. Does it need the internet or a subscription?**
No. It runs fully in Demo Mode with no keys and no network. AI and premium
voice are optional enhancements that degrade gracefully.

**5. Is my practice data private?**
Yes — sessions are stored only in your browser's localStorage. No audio is
recorded, nothing is uploaded to our own backend, and only your typed/spoken
text (not audio) is kept.
