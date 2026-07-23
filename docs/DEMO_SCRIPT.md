# Saler — 4-Minute Demo Script

A reliable walkthrough that works **entirely in Demo Mode** — no keys, no
network, no microphone required. Nothing here depends on live AI or premium
voice, so it cannot fail on stage.

> **Before you start:** open a fresh browser tab (or clear `saler.intro.seen`
> in sessionStorage) so the intro plays. Have the app open at the root URL.

---

## 0:00 — Intro (15s)

- Load the page. The **SALER** wordmark assembles letter by letter, the tagline
  *"Practice the conversation before it matters"* resolves, and the letters
  disperse into the interface.
- Say: *"The intro is pure presentation — the app is already mounted and
  interactive underneath, and it never replays on navigation."*
- (Optional) hard-refresh once and click **Skip intro** to show the control.

## 0:15 — Briefing (30s)

- *"This is the meeting prep. It leads with the person — Rohan Mehta, a
  sceptical Sales Enablement Manager — not a dashboard."*
- Point out the **readiness row**: whether the customer is Live AI or scripted,
  whether voice input is available, and the voice-output provider.
- *"Notice it's honest about what's active. Right now it's running
  deterministically."*
- Click **Start roleplay**.

## 0:45 — First seller turn, typed (40s)

- Type: **"How are you currently onboarding and training your new sales reps?"**
  and press Enter.
- Rohan replies in character (manager-led mock calls, recorded reviews…).
- Say: *"Under the hood, that one turn made exactly one evaluation request and
  one customer request — no duplicates. The evaluator returned behavioural
  signals, and deterministic TypeScript turned those into the score."*

## 1:25 — Live score (25s)

- Point to **Conversation health** in the side rail — one number, momentum, and
  the current stage, instead of six competing bars.
- *"Discovery went up because I asked an open question about their current
  process. Every point is traceable to a signal."*
- Expand **Score detail** briefly to show the six dimensions, then collapse it.
  *"Detail is available but never competes with the conversation."*

## 1:50 — Trigger an objection (45s)

- Type a deliberately weak line: **"Our platform is the best on the market —
  you should just sign up."**
- Rohan pushes back ("how is this different from a generic AI chatbot?") and the
  side rail shows an **Open** objection; the coaching flags the unsupported
  claim.
- Then handle it: **"Fair question. Unlike a generic chatbot, it's trained on
  your own scenarios and scores each rep privately."**
- The objection flips to **Addressed**.
- *"The customer raised that naturally and never coached me — the evaluator and
  the persona are completely separate."*

## 2:35 — End Call and report (50s)

- Click **End Call**.
- *"The report leads with the story, not the numbers."* Read the opening
  coaching sentence.
- Scroll to the **strongest** and **biggest missed opportunity** — *"both are
  quoted verbatim from what I actually said; the reviewer can't invent quotes."*
- Point to **Final vs Live** and the difference. *"Live rates each turn as it
  happens; final judges the whole conversation, so they differ, and it explains
  why."*
- Expand one folded section (e.g. Objection analysis) to show progressive
  disclosure.

## 3:25 — History and persistence (20s)

- Go to **History**. The session is there with date, duration, score, mode, and
  stage reached.
- **Refresh the page**, return to History — *"still there; it's persisted to
  localStorage, with the full transcript and report."*
- Click **View Report** — *"opens the saved report without starting a new
  call, and with no audio replay."*

## 3:45 — Architecture + fallback (15s)

- Say: *"Everything you saw ran deterministically. If I add an OpenAI key, the
  customer and evaluators become live AI — but each falls back independently if
  a request fails, and the app always labels which one actually ran. Same for
  voice: ElevenLabs, then the browser voice, then Silent Mode. It never claims
  AI it didn't use."*

---

## If asked to show fallback honesty live

- On the briefing readiness row or the report's **Session details**, point out
  the mode labels (Deterministic / Live AI / Mixed).
- If a key is configured but out of credit, the roleplay shows a quiet notice
  ("the scripted customer replied instead") — *"a real failure, handled
  honestly, without breaking the call."*

## Safety notes for the demo

- Do **not** rely on live OpenAI or ElevenLabs output — both configured accounts
  are out of credit, and the point of the demo is that it doesn't matter.
- Do not describe AI generation as "verified working" — it is not.
- Everything in this script is deterministic and repeatable.
