# Layer 1 — Extension (JobPulse)

> **Purpose:** Reference for the Chrome MV3 extension. Defines the layer's contract, its flow from start to end, its file map, and its remaining work.
>
> **How to use this document:** If you are picking this up in a new chat or as a new developer, read §1–§3 first. Those are the only parts you must know before touching code.

---

## Table of Contents

1. The Rule
2. Network Surface
3. Architectural Diagram
4. Start-to-End Flow
5. Identity & JWT Model
6. The Wire Payload & ReceiverAdapter
7. Project Structure (Annotated)
8. Session Lifecycle
9. Message Types Reference
10. ATS Platforms Supported
11. Chrome MV3 Constraints
12. Build System
13. Environment Config
14. Popup (Target State)
15. Debugging Console Helpers
16. Session Object Notes
17. What's Broken / Needs Deletion
18. What's Left To Do
19. What the Extension Does Not Do
20. Design Principles
21. How to Continue in a New Chat

---

## 1. The Rule

**The extension writes to Layer 2. The extension reads from Layer 3 for auth only.**

- **Writes** (events) → Layer 2A receiver at `:8001`
- **Reads** (login, verify token) → Layer 3 at `:8000`
- **Never** writes applications to Layer 3
- **Never** reads application data from Layer 3

The extension is a **pure producer**. It observes the browser, packages events, and ships them to Layer 2. Everything else — applications, analytics, companies — lives in Layer 3, and is read by the Layer 3 frontend, not the extension.

---

## 2. Network Surface (Complete)

| Call | Destination | Purpose | Auth |
|---|---|---|---|
| `POST /api/v1/auth/login` | Layer 3 | Get JWT | — |
| `GET /api/v1/auth/me` | Layer 3 | Verify JWT still valid | Bearer |
| `POST /receive/v1/events` | Layer 2A | Ship application event | Bearer |
| `GET /health` | Layer 2A | Check receiver reachable | — |

Four calls. Two layers. No crossover.

**Two clients, one per layer:**

| File | Layer | Direction |
|---|---|---|
| `src/api/client.js` | Layer 3 (`:8000`) | read (auth) |
| `src/background/api/receiver-api.js` | Layer 2A (`:8001`) | write (events) |

---

## 3. Architectural Diagram

### Component Diagram (static)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LAYER 1 — EXTENSION                              │
│                                                                             │
│  ┌─────────────────────────┐          ┌─────────────────────────────────┐   │
│  │   POPUP                 │          │   SERVICE WORKER (MV3)          │   │
│  │                         │          │                                 │   │
│  │  popup.html             │          │  service-worker.js              │   │
│  │  popup.js               │◄────────►│   • message router              │   │
│  │   • login form          │  port    │   • tab change handler          │   │
│  │   • session display     │          │   • auth handler                │   │
│  │   • read-only           │          │   • popup port handler          │   │
│  └─────────────────────────┘          │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │ ApplicationTracker        │  │   │
│                                       │  │  (orchestrator / facade)  │  │   │
│                                       │  │   • session lifecycle     │  │   │
│                                       │  │   • tab event routing     │  │   │
│                                       │  │   • state transitions     │  │   │
│                                       │  └────────────┬──────────────┘  │   │
│                                       │               │                 │   │
│                                       │  │ SessionManager            │  │   │
│                                       │  │  (singleton)              │  │   │
│                                       │  │   • sessions map          │  │   │
│                                       │  │   • tab→session map       │  │   │
│                                       │  │   • chrome.storage.local  │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │ Tab Observers             │  │   │
│                                       │  │  Created / Updated /      │  │   │
│                                       │  │  Removed                  │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │ StrategyFactory           │  │   │
│                                       │  │  10 ATS strategies +      │  │   │
│                                       │  │  Generic fallback         │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │ ReceiverAdapter           │  │   │
│                                       │  │  session → wire payload   │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │ receiver-api.js           │  │   │
│                                       │  │  HTTP → Layer 2A          │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │ client.js                 │  │   │
│                                       │  │  HTTP → Layer 3 (auth)    │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       └─────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │   CONTENT SCRIPT  (runs in page context, all_frames: true)          │   │
│  │                                                                     │   │
│  │  bundle.js                                                          │   │
│  │   • isJobPage() guard                                               │   │
│  │   • JobPulse class  →  detect job, attach apply click listener      │   │
│  │   • SuccessDetector class  →  watch for success phrases/URLs        │   │
│  │                                                                     │   │
│  │  detectors/                                                         │   │
│  │   • LinkedInDetector    (detail + search pages)                     │   │
│  │   • NaukriDetector                                                  │   │
│  │   • GenericDetector     (JSON-LD, selectors, location heuristics)   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow Diagram (one full application, start to end)

```
USER ACTION                       EXTENSION INTERNAL                        NETWORK
────────────                       ──────────────────                        ───────
                                   ┌──────────────────┐
                                   │ Popup opens      │
                                   └────────┬─────────┘
                                            │ checkAuth()
                                            ▼
                                   ┌──────────────────┐
                                   │ getCurrentUser() │ ──────────► GET /api/v1/auth/me
                                   └────────┬─────────┘                      (Layer 3)
                                            │
User enters credentials                     │ 401 → show login form
  └─────────────────────────────►  ┌──────────────────┐
                                   │ login()          │ ──────────► POST /api/v1/auth/login
                                   └────────┬─────────┘                      (Layer 3)
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ store JWT        │
                                   │ in chrome.storage│
                                   └──────────────────┘

User opens LinkedIn job page       ┌──────────────────┐
  └─────────────────────────────►  │ Content script   │
                                   │ isJobPage() ✓    │
                                   └────────┬─────────┘
                                            │ detect()
                                            ▼
                                   ┌──────────────────┐
                                   │ JobPulse.detect()│
                                   │ LinkedInDetector │
                                   └────────┬─────────┘
                                            │ chrome.runtime.sendMessage
                                            ▼
                                   ┌──────────────────┐
                                   │ stateManager     │
                                   │ .setJob(job)     │
                                   └──────────────────┘

User clicks Apply                  ┌──────────────────┐
  └─────────────────────────────►  │ APPLY_CLICKED    │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ ApplicationTracker│
                                   │ .handleApplyClick │
                                   └────────┬─────────┘
                                            │ creates session
                                            ▼
                                   ┌──────────────────┐
                                   │ SessionManager    │
                                   │ .createSession()  │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ InitiatedState   │
                                   │ (5 min timeout)  │
                                   └────────┬─────────┘
                                            │ state = 'initiated'

Chrome opens redirect tab          ┌──────────────────┐
  └─────────────────────────────►  │ TabCreatedObserver│
                                   └────────┬─────────┘
                                            │ TAB_CREATED
                                            ▼
                                   ┌──────────────────┐
                                   │ ApplicationTracker│
                                   │ .handleTabCreated│
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ RedirectingState │
                                   │ (30 s timeout)   │
                                   └────────┬─────────┘
                                            │ state = 'redirecting'

Chrome navigates to ATS page       ┌──────────────────┐
  └─────────────────────────────►  │ TabUpdatedObserver│
                                   └────────┬─────────┘
                                            │ URL_CHANGED
                                            ▼
                                   ┌──────────────────┐
                                   │ ApplicationTracker│
                                   │ .processSession  │
                                   │  Update()        │
                                   │  • push to       │
                                   │    visitedUrls   │
                                   │  • extract jobId │
                                   │  • re-eval       │
                                   │    strategy      │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ InProgressState  │
                                   │ (30 min timeout) │
                                   └────────┬─────────┘
                                            │ state = 'in_progress'

User fills and submits form        ┌──────────────────┐
  └─────────────────────────────►  │ SuccessDetector  │
                                   │ (content script) │
                                   │ or               │
                                   │ TabUpdated URL   │
                                   │ pattern match    │
                                   └────────┬─────────┘
                                            │ SUCCESS_DETECTED
                                            ▼
                                   ┌──────────────────┐
                                   │ SubmittedState   │
                                   │ .onEnter()       │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ ReceiverAdapter  │
                                   │ .applicationSub  │
                                   │  mitted()        │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ receiver-api.js  │ ──────────► POST /receive/v1/events
                                   │ .submitEvent()   │                      (Layer 2A)
                                   └────────┬─────────┘
                                            │
                        ┌───────────────────┼────────────────────┐
                        │                   │                    │
                        ▼                   ▼                    ▼
                  ┌──────────┐        ┌──────────┐        ┌──────────────┐
                  │ 200 OK   │        │ network  │        │ 4xx / 5xx    │
                  │ success  │        │ error    │        │ server error │
                  └────┬─────┘        └────┬─────┘        └──────┬───────┘
                       │                   │                     │
                       ▼                   ▼                     ▼
                  ┌──────────────────────────────────────────────────┐
                  │ if failure: store in chrome.storage.local        │
                  │ .failedSubmissions  (retry queue)                │
                  └──────────────────────────────────────────────────┘
```

### State Machine (compact)

```
                    ┌─────────────┐
                    │  initiated  │  ← Session created on Apply click
                    │  5 min TO   │
                    └──────┬──────┘
                           │ new tab opens
                           ▼
                    ┌─────────────┐
                    │ redirecting │  ← LinkedIn safety redirect → ATS
                    │  30 s TO    │
                    └──────┬──────┘
                           │ form detected
                           ▼
                    ┌─────────────┐
                    │ in_progress │  ← User filling the ATS form
                    │  30 min TO  │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │ success detected        │ tab closed / timeout / inactivity
              ▼                         ▼
       ┌─────────────┐           ┌─────────────┐
       │  submitted  │           │  abandoned  │
       │  (terminal) │           │  (terminal) │
       └──────┬──────┘           └─────────────┘
              │
              ▼
       POST /receive/v1/events
       (Layer 2A)
```

### Layer Map

```
                          ┌─────────────────────────┐
                          │      LAYER 1            │
                          │      EXTENSION          │
                          │                         │
                          │  writes events ─────────┼───► Layer 2A :8001
                          │  reads auth ────────────┼───► Layer 3 :8000
                          └─────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
        ┌───────────────────────┐         ┌───────────────────────┐
        │  LAYER 2A             │         │  LAYER 3              │
        │  Receiver :8001       │         │  Job Tracker :8000    │
        │                       │         │                       │
        │  • POST /receive/     │         │  • POST /auth/login   │
        │    v1/events          │         │  • GET  /auth/me      │
        │  • GET  /health       │         │  • /applications/*    │
        │  • GET  /info         │         │  • /companies/*       │
        │                       │         │  • /internal/*        │
        │  writes raw_events    │         │  (frontend reads)     │
        └───────────┬───────────┘         └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  LAYER 2B             │
        │  Promoter (worker)    │
        │                       │
        │  polls raw_events     │
        │  transforms           │
        │  POSTs to Layer 3     │
        │   /internal/          │
        │   applications        │
        └───────────────────────┘
```

---

## 4. Start-to-End Flow (Text)

### Phase A — User logs in

```
Popup opens
  └─► popup.js → checkAuth() via service worker
        └─► service-worker.js → API_CLIENT.getCurrentUser()
              └─► GET /api/v1/auth/me (Layer 3)
                    ├─ 200 → popup shows session status
                    └─ 401 → popup shows login form

User submits login form
  └─► popup.js → port.postMessage({ type: 'LOGIN' })
        └─► service-worker.js → API_CLIENT.login(email, password)
              └─► POST /api/v1/auth/login (Layer 3)
                    └─► returns { access_token }
                          └─► stored in chrome.storage.local.access_token
```

### Phase B — User opens a job page

```
Content script loads (all_urls, all_frames)
  └─► bundle.js → isJobPage() guard
        ├─ true  → JobPulse.detect()
        │           └─► detector-factory → LinkedIn/Naukri/Generic detector
        │                 └─► extracts job (title, company, jobId, applyType)
        │                       └─► chrome.runtime.sendMessage({ type: 'JOB_DETECTED', payload })
        │                             └─► service-worker.handleMessage
        │                                   └─► stateManager.setJob(job)
        │                                         └─► broadcastStateUpdate → popup re-renders
        └─ false → content script exits silently

Content script also attaches click listener to Apply button
  └─► on click → sendMessage({ type: 'APPLY_BUTTON_CLICKED', payload })
```

### Phase C — User clicks Apply

```
service-worker.handleApplyClick(payload, sender)
  ├─► dedup check (jobId + tabId)
  ├─► resolve redirect URL (unwrap linkedin.com/safety/go?url=...)
  └─► applicationTracker.handleApplyClick({ jobData, applyData })
        ├─► sessionManager.createSession()
        │     └─► SessionFactory.createSession → session object
        │           └─► InitiatedState.onEnter()
        ├─► strategyFactory.getStrategy(redirectUrl)
        │     └─► selects ATS strategy (Greenhouse / Lever / Workday / ...)
        ├─► pushes LinkedIn source URL to session.visitedUrls
        └─► pushes redirect URL to session.visitedUrls

stateManager.setJob({ ...job, lastApplyClick: {...} })
broadcastStateUpdate → popup shows "redirecting"
```

### Phase D — Browser navigates to the ATS

```
Chrome opens a new tab (LinkedIn safety redirect → ATS)
  └─► TabCreatedObserver.handleTabCreated
        └─► dispatches TAB_CREATED
              └─► ApplicationTracker.handleTabCreated
                    ├─► maps new tab to session (via openerTabId)
                    ├─► session.status → 'redirecting'
                    └─► RedirectingState.onEnter()

Chrome navigates the tab (URL changes, page loads)
  └─► TabUpdatedObserver.handleTabUpdated
        └─► dispatches URL_CHANGED + TAB_LOADED
              └─► ApplicationTracker.processSessionUpdate
                    ├─► pushes new URL to session.visitedUrls
                    ├─► extracts jobId from URL
                    ├─► re-evaluates strategy if needed (generic → specific ATS)
                    ├─► if strategy.isSuccessPage(url) → jump to Phase F
                    └─► otherwise → session.status → 'in_progress'
                          └─► InProgressState.onEnter()
                                └─► starts inactivity timer
```

### Phase E — User fills and submits the form

```
Every URL change while in_progress
  └─► ApplicationTracker.processSessionUpdate
        ├─► pushes URL to session.visitedUrls
        ├─► strategy.detectStep(url, title)
        │     └─► records step (form / review / submit / success)
        └─► if success step detected → Phase F

Content script SuccessDetector (runs in every ATS iframe)
  ├─► watches DOM mutations and periodic checks
  ├─► checks: iframe URL pattern, keyword combinations, exact phrases
  └─► on match → sendMessage({ type: 'SUCCESS_DETECTED', payload })
        └─► service-worker.handleSuccessDetected
              └─► ApplicationTracker.handleSuccessDetected
                    └─► session.status → 'submitted'
                          └─► SubmittedState.onEnter() → Phase F
```

### Phase F — Submission

```
SubmittedState.onEnter()
  ├─► session.status = 'submitted'
  ├─► extractThankYouMessage()
  ├─► buildAndSendPayload()
  │     ├─► receiverAdapter.applicationSubmitted(session)
  │     │     └─► builds wire payload { event_type, source, session_id, payload: {...} }
  │     └─► receiver-api.submitEvent(payload)
  │           ├─► reads JWT from chrome.storage.local
  │           └─► POST /receive/v1/events (Layer 2A)
  │                 ├─► 200 → success, session marked complete
  │                 └─► error → payload stored in chrome.storage.local.failedSubmissions
  ├─► showNotification()  "✅ Applied to X at Y"
  └─► cleanup()  → clear timers, remove session callbacks

service-worker session event listener
  └─► on 'application_submitted' → broadcastStateUpdate
        └─► popup shows "submitted"
```

### Phase G — Abandonment (alternate exit)

```
Any of:
  ├─► User closes the redirect tab before submitting
  │     └─► TabRemovedObserver → TAB_REMOVED
  │           └─► ApplicationTracker.handleTabRemoved
  │                 └─► AbandonedState.onEnter()
  ├─► User inactive for 30 min
  │     └─► InProgressState inactivity timer fires
  │           └─► AbandonedState.onEnter()
  └─► Session timeout (5 min in initiated, 30 min in in_progress)
        └─► AbandonedState.onEnter()

AbandonedState.onEnter()
  ├─► session.status = 'abandoned'
  ├─► records reason (tab_closed / inactivity / timeout)
  ├─► stores abandonment data in chrome.storage.local.abandonedSessions
  └─► cleanup()

No payload is sent to Layer 2 on abandonment.
```

---

## 5. Identity & JWT Model

The extension authenticates once against **Layer 3** and then carries that identity on every event sent to Layer 2A. Layer 3 is the source of truth for user identity. Layer 2A trusts the JWT Layer 3 signed.

### The flow

1. **Login** — popup sends email + password to Layer 3 via `API_CLIENT.login()`.
2. **Layer 3 issues a JWT** — signed with `SECRET_KEY` / `HS256`, `sub = user.id`, `exp = now + 10080 min (7 days)`.
3. **Extension stores it** — `chrome.storage.local.access_token`.
4. **Every event carries it** — `receiver-api.js` reads the token and sends `Authorization: Bearer <jwt>` on every `POST /receive/v1/events`.
5. **Layer 2A validates it** — decodes with the **same** `SECRET_KEY` and `ALGORITHM`. On success, extracts `user_id` from `sub` and stores it on the raw event.
6. **No re-verification with Layer 3** — Layer 2A does not call Layer 3 during event ingestion. It trusts the signature.

### What this means

- **Layer 3's `SECRET_KEY` and `ALGORITHM` must be set identically on Layer 2A's `.env`.** Mismatch = every event 401s.
- **The extension never reads application data from Layer 3.** Only `auth/login` and `auth/me`.
- **The extension never writes applications to Layer 3.** Events go to Layer 2A; Layer 2B promotes them to Layer 3.
- **Token lifetime is 7 days.** After that, the extension must re-login (popup shows the login form on 401).
- **If a user is deactivated in Layer 3**, their existing JWT still validates until it expires. Layer 2A has no way to know sooner — that's acceptable for now.

### Why the extension has an `API_CLIENT` at all

Because the extension needs a JWT, and only Layer 3 issues them. The `client.js` file exists to call Layer 3's auth endpoints and nothing else. Any other method in it — `trackJob`, `checkJobStatus`, etc. — is a design violation and must be deleted.

---

## 6. The Wire Payload & ReceiverAdapter

### The adapter's role

`src/background/adapters/receiver-adapter.js` is a **pure transformation** — session object → wire payload. No I/O, no HTTP, no side effects.

It is the **only place in the extension that knows the wire shape**. If Layer 2A's contract changes, only this file changes.

### The envelope

Everything the extension sends is wrapped in a fixed envelope:

```js
{
  event_type: 'application_submitted',   // what happened
  source: 'chrome_extension',            // where from
  session_id: 'session_1789551570367_...',   // which session
  application_attempt_id: null,          // future: cross-session attempt ID
  job_key: null,                         // future: canonical job identity
  payload: { ... }                       // event-specific body
}
```

`application_attempt_id` and `job_key` are **placeholders**, always `null` today. They exist so the receiver's schema can evolve without breaking the extension.

### The payload (application_submitted)

Sent to `POST /receive/v1/events`. Built by `ReceiverAdapter.applicationSubmitted(session)`.

```json
{
  "event_type": "application_submitted",
  "source": "chrome_extension",
  "session_id": "session_1789551570367_tpdcrkqw",
  "application_attempt_id": null,
  "job_key": null,
  "payload": {
    "jobId": "4466531322",
    "jobTitle": "Senior Software Engineer",
    "company": "Oportun",
    "location": null,
    "jobUrl": "https://www.linkedin.com/jobs/view/4466531322/",

    "linkedInJobId": "4466531322",
    "externalJobId": "4699315005",
    "jobIds": {
      "linkedin": "4466531322",
      "greenhouse": "4699315005"
    },
    "applicationReference": null,
    "confirmationNumber": null,

    "status": "applied",
    "appliedAt": 1789551656942,
    "source": "greenhouse",
    "applyType": "external",
    "applyMethod": "external_redirect",
    "stepsCompleted": 4,
    "thankYouPhrase": "thank you for applying",
    "confirmationMessage": null,

    "urlChain": [
      {
        "order": 1,
        "url": "https://www.linkedin.com/jobs/view/4466531322/",
        "label": "LinkedIn Job Detail",
        "timestamp": 1789551570367,
        "tabId": 204097401,
        "title": "Senior Software Engineer - Oportun | LinkedIn",
        "jobId": "4466531322"
      },
      {
        "order": 2,
        "url": "https://www.linkedin.com/safety/go?url=https%3A%2F%2Fboards.greenhouse.io%2Foportun%2Fjobs%2F4699315005",
        "label": "LinkedIn Safety Redirect",
        "timestamp": 1789551570393,
        "tabId": 204097848,
        "title": null,
        "jobId": null
      },
      {
        "order": 3,
        "url": "https://boards.greenhouse.io/oportun/jobs/4699315005",
        "label": "Greenhouse",
        "timestamp": 1789551570450,
        "tabId": 204097848,
        "title": "Senior Software Engineer at Oportun",
        "jobId": "4699315005"
      },
      {
        "order": 4,
        "url": "https://boards.greenhouse.io/oportun/jobs/4699315005#app",
        "label": "Greenhouse Application",
        "timestamp": 1789551573120,
        "tabId": 204097848,
        "title": "Apply - Oportun",
        "jobId": "4699315005"
      },
      {
        "order": 5,
        "url": "https://boards.greenhouse.io/oportun/jobs/4699315005/confirmation",
        "label": "Greenhouse Confirmation",
        "timestamp": 1789551656942,
        "tabId": 204097848,
        "title": "Thank you for applying",
        "jobId": "4699315005"
      }
    ],

    "startedAt": 1789551570367,
    "redirectedAt": 1789551570393,
    "submittedAt": 1789551656942,
    "totalTimeMs": 86575,
    "totalTimeSeconds": 87,

    "ats": "greenhouse",
    "atsName": "Greenhouse",

    "sessionId": "session_1789551570367_tpdcrkqw",
    "platform": "linkedin",
    "detectedAt": "2026-09-16T09:40:56.943Z",
    "version": "0.1.0",

    "steps": [
      { "step": "form",    "label": "Application Form",         "timestamp": 1789551573120, "matchedPattern": "/apply" },
      { "step": "review",  "label": "Review Application",       "timestamp": 1789551580100, "matchedPattern": "/review" },
      { "step": "submit",  "label": "Submitting Application",   "timestamp": 1789551655000, "matchedPattern": "/submit" },
      { "step": "success", "label": "Application Submitted",    "timestamp": 1789551656942, "matchedPattern": "success_page" }
    ],

    "userId": null
  }
}
```

**Invariant:** for `applyType: "external"`, `urlChain` must have **at least 3 entries** — LinkedIn source, LinkedIn safety redirect, ATS page. A single-entry chain paired with `applyType: "external"` is impossible. If a real session produces one, that's a bug (likely in `handleTabCreated` — see §16).

### Response expected

```json
{
  "success": true,
  "event_id": 12345,
  "received_at": "2026-09-16T09:40:57.123Z"
}
```

---

## 7. Project Structure (Annotated)

```
tracker_extension/
├── manifest.json                        # Chrome MV3 config: permissions, content scripts, service worker, host_permissions
├── package.json                         # npm scripts + esbuild dependency
├── build.js                             # esbuild bundler; env alias plugin; prod sanity check
├── create_icons.py                      # One-off icon generator (PIL)
│
├── src/
│   │
│   ├── api/
│   │   └── client.js                    # Layer 3 HTTP client — AUTH ONLY (login / me / logout)
│   │
│   ├── background/                       # MV3 service worker code
│   │   ├── service-worker.js            # Entry point: listeners, message routing, tab handling, auth
│   │   │
│   │   ├── adapters/
│   │   │   └── receiver-adapter.js      # Pure transform: session object → wire payload for Layer 2A
│   │   │
│   │   ├── api/
│   │   │   └── receiver-api.js          # Layer 2A HTTP client — events only (submitEvent, pingReceiver)
│   │   │
│   │   ├── managers/
│   │   │   ├── ApplicationTracker.js    # Orchestrator: tab events → session lifecycle; facade over everything
│   │   │   └── SessionManager.js        # Session storage, tab→session map, persistence to chrome.storage
│   │   │
│   │   └── patterns/
│   │       ├── base/
│   │       │   ├── SessionState.js              # Abstract state base class
│   │       │   ├── TabObserver.js               # Abstract observer base class
│   │       │   └── SubmissionDetectionStrategy.js  # Abstract ATS strategy base class
│   │       │
│   │       ├── factories/
│   │       │   ├── SessionFactory.js            # Creates/restores session objects; validation; URL chain helpers
│   │       │   └── StrategyFactory.js           # Picks the right ATS strategy for a URL by priority
│   │       │
│   │       ├── observers/
│   │       │   ├── TabCreatedObserver.js        # Wraps chrome.tabs.onCreated; dispatches TAB_CREATED
│   │       │   ├── TabUpdatedObserver.js        # Wraps chrome.tabs.onUpdated; dispatches URL_CHANGED / TAB_LOADED
│   │       │   └── TabRemovedObserver.js        # Wraps chrome.tabs.onRemoved; dispatches TAB_REMOVED
│   │       │
│   │       ├── states/
│   │       │   ├── state-registry.js            # Static imports of all states (MV3-safe); exposes STATES map
│   │       │   ├── InitiatedState.js            # Just created; waiting for redirect; 5 min timeout
│   │       │   ├── RedirectingState.js          # New tab opened; waiting for page load; 30 s timeout
│   │       │   ├── InProgressState.js           # User filling form; step detection; inactivity tracking
│   │       │   ├── SubmittedState.js            # Terminal: builds payload, sends to Layer 2A, notification
│   │       │   └── AbandonedState.js            # Terminal: records reason, cleans up, no payload
│   │       │
│   │       └── strategies/
│   │           ├── GenericStrategy.js           # Fallback: catches all URLs, common success patterns
│   │           ├── GreenhouseStrategy.js        # Greenhouse detection + gh_jid/gh_src query params
│   │           ├── LeverStrategy.js             # Lever detection
│   │           ├── WorkdayStrategy.js           # Workday detection (content-based step detection)
│   │           ├── AshbyStrategy.js             # Ashby detection
│   │           ├── DeelStrategy.js              # Deel detection
│   │           ├── SmartRecruitersStrategy.js   # SmartRecruiters detection
│   │           ├── RippleHireStrategy.js        # RippleHire detection (India-first ATS)
│   │           ├── iCIMSStrategy.js             # iCIMS detection
│   │           ├── BambooHRStrategy.js          # BambooHR detection
│   │           └── TaleoStrategy.js             # Taleo detection
│   │
│   ├── config/
│   │   ├── config.js                    # Runtime config loader; merges env config + user overrides from storage
│   │   └── env/
│   │       ├── active.js                # Fallback used by source; build-time plugin rewrites this import
│   │       ├── development.js           # API_URL=http://localhost:8000/api/v1, RECEIVER_URL=http://localhost:8001
│   │       ├── staging.js               # Staging URLs
│   │       └── production.js            # Production URLs
│   │
│   ├── content/                          # Content script (runs in page context)
│   │   ├── bundle.js                    # Entry: isJobPage() guard, JobPulse class, SuccessDetector class
│   │   └── detectors/
│   │       ├── base-detector.js         # Abstract detector: extractTitle/Company/Location/JobId
│   │       ├── detector-factory.js      # Selects detector by URL pattern
│   │       ├── linkedin-detector.js     # LinkedIn job pages; apply-type detection (Easy Apply vs external)
│   │       ├── naukri-detector.js       # Naukri job pages
│   │       └── generic-detector.js      # Any career page; JSON-LD parsing; location heuristics
│   │
│   ├── popup/                            # Extension popup UI
│   │   ├── popup.html                   # Login form + session display (Track Job button to be removed)
│   │   ├── popup.css                    # Styling
│   │   └── popup.js                     # Popup logic: login, state display, port to service worker
│   │
│   ├── state/
│   │   └── state-manager.js             # In-memory + persistent state: current job, status, auth
│   │
│   └── utils/
│       ├── normalization.js             # Job title/company/location normalisation; fingerprint hashing
│       ├── platform.js                  # Platform detection (LinkedIn/Naukri/Greenhouse/Lever/Workday)
│       └── storage.js                   # chrome.storage.local wrapper: get/set/remove + auth helpers
│
└── tests/                                # (all empty — safe to delete)
    ├── content/
    └── utils/
```

**Files to delete (stale, pre-pipeline):**

- `config/` (root) — old CommonJS config, superseded by `src/config/`
- `build.sh` — old build path, superseded by `build.js`
- `load-env.sh` — references old build flow
- `update-config.sh` — references deleted `config/`
- `structure.txt` — stale file tree
- `tests/**/*.test.js` — empty files

---

## 8. Session Lifecycle

```
initiated ──► redirecting ──► in_progress ──► submitted
                                       ↘
                                         abandoned
```

| State | Trigger to enter | Trigger to leave | Timeout |
|---|---|---|---|
| `initiated` | User clicks Apply | New tab opens | 5 min → abandoned |
| `redirecting` | New tab created | Form page detected | 30 s → abandoned |
| `in_progress` | Form detected | Success page OR tab close OR inactivity | 30 min → abandoned |
| `submitted` | Success detected | Terminal | — |
| `abandoned` | Tab closed / timeout / inactivity | Terminal | — |

**Success detection order (first match wins):**

1. URL pattern — `/confirmation`, `/thank-you`, `/submitted`, `/success`
2. Iframe URL pattern — checks inside embedded ATS frames
3. Keyword combinations — `thank you` + `applying`, `received` + `application`, `submitted` + `successfully`
4. Exact phrases — `application submitted`, `we have received your application`

**Abandonment reasons:** `tab_closed`, `tab_closed_before_load`, `tab_closed_during_application`, `inactivity`, `timeout`, `timeout_during_redirect`, `tab_not_found`, `navigation`, `unknown`

---

## 9. Message Types Reference

Extension messages use `chrome.runtime.sendMessage` (broadcast) or a `port` (popup ↔ service worker).

| Message | From → To | Payload | Purpose |
|---|---|---|---|
| `JOB_DETECTED` | content → SW | `{ job }` | Content script found a job |
| `APPLY_CLICKED` | content → SW | `{ job, applyUrl, redirectUrl, ... }` | User clicked the apply button (LinkedIn external) |
| `APPLY_BUTTON_CLICKED` | content → SW | `{ applyType, job, applyUrl }` | Generic apply button click |
| `SUCCESS_DETECTED` | content → SW | `{ phrase, url, isIframe, detectionMethod }` | Content script saw success markers |
| `GET_STATE` | popup → SW | `{}` | Popup asks for current state |
| `CHECK_AUTH` | popup → SW | `{}` | Popup checks if logged in |
| `TRACK_JOB` | popup → SW | `{}` | **Deprecated** — being removed (§17) |
| `STATE_UPDATED` | SW → popup | `{ state }` | Broadcast after any state change |
| `STATE_UPDATE` | SW → popup (port) | `{ state }` | Port-based state push |
| `TRACK_RESULT` | SW → popup (port) | `{ success, ... }` | **Deprecated** — being removed (§17) |
| `APPLICATION_SUBMITTED` | SW → popup | `{ payload }` | Notify popup of completed session |
| `LOGIN` | popup → SW (port) | `{ email, password }` | Popup login form |
| `LOGIN_SUCCESS` | SW → popup (port) | `{}` | Login succeeded |
| `LOGIN_ERROR` | SW → popup (port) | `{ error }` | Login failed |
| `LOGOUT` | popup → SW (port) | `{}` | User clicked logout |
| `LOGOUT_SUCCESS` | SW → popup (port) | `{}` | Logout done |

**Note:** after cleanup, `TRACK_JOB` and `TRACK_RESULT` disappear.

---

## 10. ATS Platforms Supported

| Priority | ATS | Domain / Detection |
|---|---|---|
| 10 | Greenhouse | `greenhouse.io`, `grnh.se`, or query param `gh_jid=` / `gh_src=` |
| 9 | Lever | `lever.co`, `jobs.lever.co` |
| 8 | Workday | `myworkdayjobs.com`, `workday.com` |
| 7 | Ashby | `ashbyhq.com`, `ashby.com` |
| 7 | Deel | `deel.com`, `jobs.deel.com` |
| 6 | SmartRecruiters | `smartrecruiters.com` |
| 6 | RippleHire | `ripplehire.com` |
| 5 | iCIMS | `icims.com` |
| 4 | BambooHR | `bamboohr.com` |
| 3 | Taleo | `taleo.net` |
| 0 | Generic | any URL (fallback) |

**Greenhouse custom domains:** Greenhouse can be embedded on a company's own domain via `?gh_jid=` — e.g. `payoneer.com/careers/position/8019863?gh_jid=8019863`. The strategy detects this even though the domain isn't `greenhouse.io`.

---

## 11. Chrome MV3 Constraints

These are non-negotiable. Breaking any of them causes silent failures or build rejections.

| Constraint | What it means |
|---|---|
| **No dynamic imports in the service worker** | `import()` is blocked in MV3 SWs. All states are pre-loaded via `state-registry.js` with static imports. |
| **Service worker is ESM** | `manifest.json` declares `"type": "module"`. Bundled as ESM by `build.js`. |
| **Content script is IIFE** | No module syntax at runtime. Bundled as IIFE by `build.js`. |
| **`all_frames: true`** | Content script runs inside iframes (needed for embedded ATS forms like Greenhouse). |
| **`host_permissions: ["<all_urls>"]`** | Broad permission, guarded at runtime by `isJobPage()`. |
| **No `eval`, no remote code** | Chrome Web Store rejects anything that loads remote JS. |
| **`chrome.storage.local` only** | `sync` has quota limits and isn't needed for session data. |

---

## 12. Build System

`build.js` runs **two** esbuild builds:

| Target | Entry | Output | Format |
|---|---|---|---|
| Content script | `src/content/bundle.js` | `dist/src/content/bundle.js` | IIFE |
| Service worker | `src/background/service-worker.js` | `dist/src/background/service-worker.js` | ESM |

### The env-alias plugin

Source never names a specific env file. It always imports `./env/active.js`. The build-time plugin rewrites that import to `./env/<BUILD_ENV>.js` — `development.js`, `staging.js`, or `production.js`.

```js
// build.js (excerpt)
const envAliasPlugin = {
  name: 'env-alias',
  setup(build) {
    build.onResolve({ filter: /\/env\/active\.js$/ }, (args) => {
      const replaced = args.path.replace(/\/env\/active\.js$/, `/env/${activeEnvFile}`);
      return { path: path.resolve(args.resolveDir, replaced), external: false };
    });
  }
};
```

This means `src/config/env/active.js` is **never bundled**. It's a fallback for source-only runs.

### Production sanity check

`NODE_ENV=production npm run build` runs `verifyNoDevUrlsInProd()`, which fails the build if any of these strings appear in the bundle:

- `localhost:8000`
- `localhost:3000`
- `staging-api.jobpulse.io`
- `staging.jobpulse.io`

If it fails, the env-alias plugin didn't wire up correctly.

### Commands

```bash
npm install
npm run build          # development build
npm run watch          # watch mode
NODE_ENV=production npm run build   # production build
```

### Load in Chrome

```
chrome://extensions/ → Developer mode ON → Load unpacked → select dist/
```

---

## 13. Environment Config

**`src/config/env/development.js`:**

```js
export default {
  API_URL: 'http://localhost:8000/api/v1',       // Layer 3
  RECEIVER_URL: 'http://localhost:8001',         // Layer 2A
  WEBSITE_URL: 'http://localhost:3000',
  DASHBOARD_URL: 'http://localhost:3000/dashboard',
  DEBUG: true,
  LOG_LEVEL: 'debug',
  BACKEND_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};
```

**Runtime override:** `chrome.storage.local.user_config.API_URL` / `.RECEIVER_URL` takes precedence over build-time config. Read via `getConfig()` / `getApiUrl()` / `getReceiverUrl()`.

---

## 14. Popup (Target State)

**Read-only.** Displays detected job + current session state. No HTTP calls, no mutation.

### Detected job + active session

```
┌─────────────────────────────────┐
│  💼 JobPulse              [Logout]│
├─────────────────────────────────┤
│  📌 Senior Backend Engineer     │
│     Acme Technologies           │
│     Bengaluru, India            │
│     via LinkedIn                │
│                                 │
│  🔄 Session: in_progress        │
│     Step: Application Form      │
│     URLs tracked: 3             │
│     Elapsed: 1m 24s             │
│                                 │
├─────────────────────────────────┤
│  📊 Dashboard        v0.1.0     │
└─────────────────────────────────┘
```

### No job detected

```
┌─────────────────────────────────┐
│  💼 JobPulse              [Logout]│
├─────────────────────────────────┤
│         🔍                      │
│                                 │
│    No job detected              │
│    Navigate to a job page       │
│    to start tracking            │
│                                 │
├─────────────────────────────────┤
│  📊 Dashboard        v0.1.0     │
└─────────────────────────────────┘
```

### Not authenticated

```
┌─────────────────────────────────┐
│  💼 JobPulse                    │
├─────────────────────────────────┤
│  🔐 Sign in to track jobs       │
│                                 │
│  [Email]                        │
│  [Password]                     │
│  [Sign In]                      │
│                                 │
│  Don't have an account? Sign up │
└─────────────────────────────────┘
```

**What was removed:** the "Track Job" button. It called `/jobs/track` on Layer 3, which doesn't exist. The extension never writes applications to Layer 3 — that's the whole point of the pipeline. See §17.

---

## 15. Debugging Console Helpers

Run these in the appropriate console (service worker console for SW-scoped, page console for content-script-scoped).

### Service worker console (`chrome://extensions/` → "service worker")

```js
// All sessions currently in storage
chrome.storage.local.get('sessionManagerData', (r) => {
  const d = r.sessionManagerData;
  if (d?.sessions) {
    console.log('Total sessions:', d.sessions.length);
    d.sessions.forEach(([id, s]) => console.log(id, s.status, s.jobTitle));
  }
});

// Failed event submissions (retry queue)
chrome.storage.local.get('failedSubmissions', (r) => {
  const failed = r.failedSubmissions || [];
  console.log('Failed:', failed.length);
  failed.forEach((f, i) => {
    console.log(`#${i+1}:`, f.payload.payload.jobTitle, 'at', f.payload.payload.company);
  });
});

// Full payload of the last failed submission
chrome.storage.local.get('failedSubmissions', (r) => {
  const failed = r.failedSubmissions || [];
  const last = failed[failed.length - 1];
  if (last) console.log(JSON.stringify(last.payload, null, 2));
});

// Current auth token presence
chrome.storage.local.get('access_token', (r) => {
  console.log('Token present:', !!r.access_token);
});

// Abandoned sessions log
chrome.storage.local.get('abandonedSessions', (r) => {
  console.log('Abandoned:', (r.abandonedSessions || []).length);
});
```

### Page console (on a job page)

```js
// Job detected by JobPulse
JSON.parse(document.body.dataset.jobpulseJob || 'null')

// Apply-click payload captured
JSON.parse(document.body.dataset.jobpulseApply || 'null')

// Force a re-detect
window.dispatchEvent(new CustomEvent('jobpulse-refresh'))

// Confirm the content script injected
document.querySelector('meta[name="jobpulse-injected"]')?.content
```

---

## 16. Session Object Notes

The full session shape is documented in `SessionFactory.createSession()`. Key points for anyone reading persisted sessions:

- **`session.currentState`** is a live state **instance**, not serializable. On persist it becomes `null`; on restore it's re-created from `status`.
- **`session.atsStrategy`** is also a live instance. On persist it becomes `null`; on restore it's re-created via `StrategyFactory.getStrategy(jobUrl)`.
- **`session.visitedUrls`** is the URL chain — **ordered**. Each entry: `{ order, url, label, timestamp, tabId, title, jobId }`.
- **`session.trackedTabs`** is the list of Chrome tab IDs belonging to this session. Includes the source tab (LinkedIn), the redirect tab (ATS), and any subsequent tabs opened from them.
- **`session.jobIds`** is a map: `{ linkedin: '...', greenhouse: '...', external: '...' }`.
- **`session.externalJobId`** is the first non-LinkedIn job ID seen.

### Known issue — URL chain can be short

For an external-redirect flow, `visitedUrls` **should** have at least 3 entries (LinkedIn, safety redirect, ATS page). If a real session produces a chain of only 1, the likely cause is:

`ApplicationTracker.handleTabCreated` transitions the session to `redirecting` and maps the new tab, but does **not** push the new tab's URL into `visitedUrls`. The push only happens later when `TabUpdatedObserver` fires `URL_CHANGED`. If that event doesn't fire for the initial navigation of a new tab (which Chrome sometimes skips), the URL is lost.

**Fix candidate:** in `handleTabCreated`, when mapping a tab to a session, fetch the tab's current URL via `chrome.tabs.get(tabId)` and push it into `visitedUrls` if not already present.

---

## 17. What's Broken / Needs Deletion

### 🔴 Popup "Track Job" button hits dead routes

The popup calls `POST /api/v1/jobs/track` and `POST /api/v1/jobs/status`. **Layer 3 has no `/jobs` router** — verified from source (`app/api/v1/router.py` doesn't register one). Every click 404s.

**This is pre-pipeline code.** The extension should never write applications to Layer 3. Fix by deletion, not by adding routes.

| File | Remove |
|---|---|
| `src/api/client.js` | `trackJob()`, `checkJobStatus()`, `getTrackedJobs()` |
| `src/background/service-worker.js` | `checkJobStatus()` method, `handleTrackJob()` method, `case 'TRACK_JOB'` in both message handlers, calls to `this.checkJobStatus(...)` |
| `src/popup/popup.html` | `<button id="trackBtn">`, `<div id="trackedStatus">` |
| `src/popup/popup.js` | `trackBtn` / `trackedStatus` refs, click listener, `handleTrackJob()`, `handleTrackResult()`, `case 'TRACK_RESULT'`, tracked-status block in `showJobDetected()` |

**Replacement:** read-only session display (§14). No buttons, no HTTP to Layer 3, no mutation.

### 🟢 Non-blocking quirks

| Issue | Where | Notes |
|---|---|---|
| Strategy re-evaluation is one-way | `ApplicationTracker.processSessionUpdate` | Once upgraded from `generic`, never re-checked |
| `SubmittedState.buildAndSendPayload()` not awaited | `SubmittedState.js` | Fire-and-forget; failures go to `failedSubmissions` |
| `AbandonedState` has duplicated reason maps | `AbandonedState.js` | Cosmetic |
| `SubmittedState.cleanup()` runs before async send completes | `SubmittedState.js` | Fine today; fragile if send ever needs to be awaited |
| Redundant `import { getConfig }` | `service-worker.js` | Dead import |

---

## 18. What's Left To Do

| # | Task | Blocking |
|---|---|---|
| 1 | Delete `trackJob`, `checkJobStatus`, `getTrackedJobs` from `client.js` | 🔴 |
| 2 | Delete `handleTrackJob`, `checkJobStatus`, `TRACK_JOB` cases from service-worker | 🔴 |
| 3 | Remove Track button + `TRACK_JOB` flow from popup | 🔴 |
| 4 | Add read-only session display to popup (§14) | 🔴 |
| 5 | Delete stale root files (§7) | 🟡 |
| 6 | Rebuild `npm run build` | 🔴 |
| 7 | Grep bundle to confirm no `/jobs/*` or `/applications/*` strings | 🔴 |
| 8 | Load unpacked in Chrome, verify no console errors | 🔴 |
| 9 | End-to-end test against live Layer 2A | 🔴 |
| 10 | Verify URL chain has 3+ entries for external redirects (§16) | 🟡 |

---

## 19. What the Extension Does Not Do

Explicit scope boundaries — prevents creep.

- ❌ Does not write to Layer 3
- ❌ Does not read application data from Layer 3 (auth only)
- ❌ Does not store applications locally (events go to Layer 2A)
- ❌ Does not track general browsing (only job application flows)
- ❌ Does not auto-fill forms (future feature)
- ❌ Does not scrape job descriptions (future)
- ❌ Does not match or tailor resumes (future)
- ❌ Does not display application history (that's the Layer 3 frontend)

---

## 20. Design Principles

| Principle | Meaning |
|---|---|
| **Write to Layer 2 only** | Events go to the receiver. Never to Layer 3. |
| **Read from Layer 3 for auth only** | Login + `me`. Never application data. |
| **Backend is source of truth** | Client-side checks are optimization only |
| **Never pretend success** | Only mark "tracked" after Layer 2A confirms |
| **Chrome MV3 safe** | No dynamic imports, no `eval`, no remote code |
| **Extensible** | Adding an ATS = adding one strategy file |
| **Data first** | Ship everything to Layer 2; process later |
| **Adapter is the seam** | Wire shape lives in one file (`receiver-adapter.js`) |

---

## 21. How to Continue in a New Chat

1. Share this README with the new chat.
2. Share any file you plan to modify.
3. **Do not add new HTTP calls to Layer 3.** The extension's Layer 3 surface is auth only. If you think you need one, re-read §1.
4. Local project: `/Volumes/work/codebase/tracker_extension/`
5. Two HTTP clients, two layers — never merge them:
   - `src/api/client.js` → Layer 3 (auth)
   - `src/background/api/receiver-api.js` → Layer 2A (events)
6. Key files:
   - `src/api/client.js` — Layer 3 client (auth only)
   - `src/background/api/receiver-api.js` — Layer 2A client
   - `src/background/adapters/receiver-adapter.js` — payload shape
   - `src/background/managers/ApplicationTracker.js` — core session logic
   - `src/background/managers/SessionManager.js` — session storage
   - `src/background/service-worker.js` — orchestration
   - `src/popup/popup.js` + `popup.html` — popup UI
   - `manifest.json` — MV3 config
   - `build.js` — bundler + env alias
7. **If a new chat proposes writing to Layer 3 from the extension — stop it.** That's the exact violation this README exists to prevent.

---

**End of Layer 1 README.**