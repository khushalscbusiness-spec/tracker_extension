# JobPulse Extension — Complete Project Reference

> **Purpose of this document:** Hand this to any new chat/developer/AI and they should fully understand what JobPulse is, what's built, what's pending, and what's next.

---

## 1. What Is JobPulse?

JobPulse is a **Chrome extension** that **automatically tracks job applications** across job boards and ATS platforms, with **minimal manual input** from the user.

The core promise: *"Apply to jobs anywhere. We'll track them automatically."*

---

## 2. The Problem It Solves

| Problem | How JobPulse Solves It |
|---------|------------------------|
| Users apply to 50-200 jobs and lose track | Auto-detects and tracks every application |
| Manual tracking in spreadsheets is tedious | Zero manual entry required |
| Applications span multiple platforms (LinkedIn → company site → ATS) | Tracks the entire URL chain |
| Success pages vary across 150+ ATS platforms | Multi-layer detection (URL, iframe, content, keywords) |
| Duplicate applications | Job ID extraction + deduplication |

---

## 3. Target Users

- **Primary:** Active job seekers applying to 10-100+ jobs
- **Secondary:** Career coaches, bootcamp students
- **Geography:** India-first (Naukri, LinkedIn) + global (Greenhouse, Lever, Workday)

---

## 4. Core Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                            │
│                                                                 │
│  Content Script → detects job, tracks apply clicks             │
│  Background SW  → manages sessions, tracks tabs, detects success│
│  Popup          → shows state, login, manual track              │
│                                                                 │
│  Sends data to backend                                          │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Planned)                           │
│                                                                 │
│  - Receives application payloads                               │
│  - Stores in database                                          │
│  - Processes for analytics                                     │
│  - Serves dashboard                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Component Layers

| Layer | Responsibility | Location |
|-------|----------------|----------|
| **Detection** | Job detection, apply click, URL tracking | Content script + Background |
| **Orchestration** | Session lifecycle, state machine | Background (ApplicationTracker) |
| **Data Management** | Session storage, persistence | Background (SessionManager) |
| **Intelligence** | ATS detection, success detection | Strategies + Content |
| **Transport** | Send payload to backend | SubmittedState |

---

## 5. Project Structure

```
tracker_extension/
├── manifest.json                     # Extension config
├── package.json
├── build.js                          # esbuild bundler
├── build.sh
│
├── config/                           # Environment configs
│   ├── development.js
│   ├── production.js
│   └── staging.js
│
├── icons/                            # Extension icons
│
└── src/
    ├── background/                   # Service worker (MV3)
    │   ├── service-worker.js         # Main entry point
    │   │
    │   ├── core/
    │   │   ├── interfaces.js
    │   │   ├── constants.js
    │   │   └── event-bus.js
    │   │
    │   ├── managers/
    │   │   ├── ApplicationTracker.js  # Orchestrator (facade)
    │   │   └── SessionManager.js      # Session lifecycle
    │   │
    │   └── patterns/
    │       ├── base/
    │       │   ├── SessionState.js
    │       │   └── TabObserver.js
    │       │
    │       ├── factories/
    │       │   ├── SessionFactory.js
    │       │   └── StrategyFactory.js
    │       │
    │       ├── observers/
    │       │   ├── TabCreatedObserver.js
    │       │   ├── TabUpdatedObserver.js
    │       │   └── TabRemovedObserver.js
    │       │
    │       ├── states/
    │       │   ├── state-registry.js
    │       │   ├── InitiatedState.js
    │       │   ├── RedirectingState.js
    │       │   ├── InProgressState.js
    │       │   ├── SubmittedState.js
    │       │   └── AbandonedState.js
    │       │
    │       └── strategies/
    │           ├── GreenhouseStrategy.js
    │           ├── LeverStrategy.js
    │           ├── WorkdayStrategy.js
    │           ├── AshbyStrategy.js
    │           ├── DeelStrategy.js
    │           ├── SmartRecruitersStrategy.js
    │           ├── iCIMSStrategy.js
    │           ├── BambooHRStrategy.js
    │           ├── TaleoStrategy.js
    │           └── GenericStrategy.js
    │
    ├── content/                      # Content script
    │   ├── bundle.js                 # Entry + JobPulse + SuccessDetector
    │   └── detectors/
    │       ├── base-detector.js
    │       ├── detector-factory.js
    │       ├── linkedin-detector.js
    │       ├── naukri-detector.js
    │       └── generic-detector.js
    │
    ├── popup/                        # Extension popup
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.js
    │
    ├── api/
    │   └── client.js                 # Backend HTTP client
    │
    ├── state/
    │   └── state-manager.js
    │
    ├── config/
    │   └── config.js
    │
    └── utils/
        └── storage.js
```

---

## 6. Design Patterns Used

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Factory** | StrategyFactory, SessionFactory | Create strategies/sessions dynamically |
| **Strategy** | ATS strategies | Different logic per ATS |
| **State** | SessionState + 5 states | Manage application lifecycle |
| **Observer** | TabObservers | React to Chrome tab events |
| **Facade** | ApplicationTracker | Simplify complex subsystem |
| **Singleton** | SessionManager, ApplicationTracker | Single instance |
| **Adapter** | API client | Normalize backend communication |
| **Registry** | state-registry.js | Pre-load states (Chrome MV3 constraint) |

---

## 7. The Session Lifecycle

### Session States

```
initiated → redirecting → in_progress → submitted
                                    ↘ abandoned
```

| State | When | What Happens |
|-------|------|--------------|
| **initiated** | User clicks Apply | Session created with job data |
| **redirecting** | New tab opens to external site | Tracks redirect URLs |
| **in_progress** | Form page detected | User filling application |
| **submitted** | Success page detected | Payload built and sent |
| **abandoned** | Tab closed or timeout | Session marked abandoned |

### State Transitions

| From | To | Trigger |
|------|-----|---------|
| initiated | redirecting | New tab opens |
| redirecting | in_progress | Form page detected |
| redirecting | submitted | Success page detected directly |
| in_progress | submitted | Success page detected |
| any | abandoned | Tab closed or 60s inactivity |

---

## 8. What the Extension Tracks

### Per Session

| Field | Description |
|-------|-------------|
| `sessionId` | Unique ID |
| `jobId` | LinkedIn job ID |
| `jobTitle` | Job title |
| `company` | Company name |
| `location` | Location |
| `jobUrl` | Original LinkedIn URL |
| `redirectUrl` | LinkedIn safety redirect URL |
| `applyUrl` | Apply button href |
| `successUrl` | Confirmation page URL |
| `jobIds` | `{ linkedin, greenhouse, external }` |
| `externalJobId` | Job ID from external site |
| `applicationReference` | Application confirmation number |
| `ats` / `atsName` | Detected ATS |
| `visitedUrls` | All URLs with order, label, jobId, timestamp |
| `steps` | Detected form steps |
| `startedAt` / `submittedAt` | Timestamps |
| `status` | Current state |

### URL Chain

Each URL in the chain has:
```javascript
{
  order: 1,
  url: 'https://...',
  label: 'LinkedIn Job Search',
  timestamp: 1789551570368,
  tabId: 204097401,
  title: 'Senior Software Engineer',
  jobId: '4466531322'
}
```

---

## 9. Payload Sent to Backend

```javascript
{
  // Job Info
  jobId: '4466531322',
  jobTitle: 'Senior Software Engineer',
  company: 'Oportun',
  location: null,
  jobUrl: 'https://...',

  // Job ID Tracking
  linkedInJobId: '4466531322',
  externalJobId: '4699315005',
  jobIds: {
    linkedin: '4466531322',
    greenhouse: '4699315005'
  },
  applicationReference: null,
  confirmationNumber: null,

  // Application Info
  status: 'applied',
  appliedAt: 1789551656942,
  source: 'greenhouse',
  applyMethod: 'external_redirect',
  stepsCompleted: 0,
  thankYouPhrase: 'thank you for applying',

  // URL Chain (has everything)
  urlChain: [
    { order: 1, url: '...', label: 'LinkedIn Job Search', jobId: '...', timestamp, tabId, title },
    { order: 2, url: '...', label: 'Greenhouse', jobId: null, timestamp, tabId, title },
    { order: 3, url: '...', label: 'Greenhouse', jobId: '4699315005', timestamp, tabId, title },
    { order: 4, url: '...', label: 'Greenhouse Confirmation', jobId: '4699315005', timestamp, tabId, title }
  ],

  // Timing
  startedAt: 1789551570367,
  redirectedAt: 1789551570393,
  submittedAt: 1789551656942,
  totalTimeMs: 86575,
  totalTimeSeconds: 87,

  // ATS
  ats: 'greenhouse',
  atsName: 'Greenhouse',

  // System
  sessionId: 'session_1789551570367_tpdcrkqw',
  platform: 'linkedin',
  detectedAt: '2026-09-16T09:40:56.943Z',
  version: '0.1.0',

  // Steps
  steps: [],

  // User
  userId: null
}
```

---

## 10. ATS Platforms Supported (10)

| Priority | ATS | Domain/Pattern | Detection Method |
|----------|-----|----------------|------------------|
| 10 | Greenhouse | `greenhouse.io`, `gh_jid=`, `gh_src=` | Domain + query params |
| 9 | Lever | `lever.co`, `jobs.lever.co` | Domain |
| 8 | Workday | `myworkdayjobs.com`, `workday.com` | Domain |
| 7 | Ashby | `ashbyhq.com`, `ashby.com` | Domain |
| 7 | Deel | `deel.com`, `jobs.deel.com` | Domain |
| 6 | SmartRecruiters | `smartrecruiters.com` | Domain |
| 5 | iCIMS | `icims.com` | Domain |
| 4 | BambooHR | `bamboohr.com` | Domain |
| 3 | Taleo | `taleo.net` | Domain |
| 0 | Generic | Any URL | Fallback |

### Key Insight: Query Param Detection

Greenhouse supports **custom company domains** via `gh_jid`:

```
https://www.payoneer.com/careers/position/8019863?gh_jid=8019863&gh_src=11e459421
```

**This is detected as Greenhouse even though the domain is `payoneer.com`.**

---

## 11. Success Detection (Multi-Layer)

Success detection is the hardest problem because ATS platforms differ.

### 4 Detection Methods

| # | Method | How It Works | Example |
|---|--------|--------------|---------|
| 1 | **URL pattern** | Success in URL | `/confirmation`, `/thank-you`, `/success` |
| 2 | **Iframe URL** | Iframe URL has success pattern | `job-boards.greenhouse.io/embed/job_app/confirmation` |
| 3 | **Keyword detection** | Page text has keywords | "thank you" + "applying", "received" + "application" |
| 4 | **Exact phrase** | Page text has exact phrase | "we have received your application" |

### Keyword Detection Rules

```javascript
// Rule 1: Thank + Action
'thank you' + 'applying'     → success
'thanks for' + 'application' → success

// Rule 2: Received + Application
'received' + 'application'   → success

// Rule 3: Submitted + Success
'submitted' + 'successfully' → success

// Rule 4: Strong phrases
'application submitted'       → success
'we have received your application' → success
```

### Iframe Handling

The manifest uses `all_frames: true` so content script runs inside iframes. This catches:
- Greenhouse embedded forms inside company careers pages
- Any ATS that uses iframes

---

## 12. What's Working (Current State)

| Feature | Status |
|---------|--------|
| Job detection (LinkedIn, Naukri, Generic) | ✅ |
| Apply click tracking | ✅ |
| Session creation | ✅ |
| Tab tracking (Chrome tabs API) | ✅ |
| URL chain tracking | ✅ |
| Job ID extraction (LinkedIn, Greenhouse, Lever, Workday, etc.) | ✅ |
| ATS detection (10 platforms) | ✅ |
| Query param detection (`gh_jid`, `gh_src`) | ✅ |
| State machine (5 states) | ✅ |
| Success detection (URL pattern) | ✅ |
| Success detection (iframe URL) | ✅ |
| Success detection (keyword-based) | ✅ |
| Payload building | ✅ |
| Failed payload storage (for retry) | ✅ |
| Notifications | ✅ |
| Session persistence to `chrome.storage.local` | ✅ |
| Auto-session creation from URL | ✅ |
| Dynamic import fix (Chrome MV3) | ✅ |

---

## 13. Known Issues & Gaps

### Critical

| Issue | Impact | Fix |
|-------|--------|-----|
| **Backend HTTP 405** | Payloads not saved | Backend endpoint must accept POST |
| **`<all_urls>` not in manifest** | Content script doesn't run on custom domains | Add `<all_urls>` + guard |
| **Inactivity timeout too short** | Sessions abandon at 60s | Increase to 5-10 min |

### Medium

| Issue | Impact | Fix |
|-------|--------|-----|
| **Login page not handled** | ATS login breaks tracking | Add `login` step + pause state |
| **JD vs Form differentiation** | JD page detected as form | Add `jd` step pattern |
| **Session leakage** | New jobs added to old sessions | Add `isNewJobPage()` check |

### Low

| Issue | Impact | Fix |
|-------|--------|-----|
| **Missing icons** | `Unable to download images` warning | Add icon files |
| **Location not extracted** | `location: null` in payload | Improve location selectors |

---

## 14. What's Not Built Yet

### Backend

| Component | Status |
|-----------|--------|
| FastAPI endpoint for `/applications/track` | ❌ |
| PostgreSQL database (DB1: raw, DB2: analytics) | ❌ |
| Event processing pipeline | ❌ |
| ATS detection on backend | ❌ |
| Deduplication logic | ❌ |
| User authentication | ❌ |

### Dashboard

| Component | Status |
|-----------|--------|
| Login/signup | ❌ |
| Application list | ❌ |
| Daily/weekly stats | ❌ |
| URL chain visualization | ❌ |
| Analytics | ❌ |

### Extension Features

| Feature | Status |
|---------|--------|
| `<all_urls>` support | ❌ |
| Login page handling | ❌ |
| JD vs Form differentiation | ❌ |
| Session isolation | ❌ |
| Auto-fill | ❌ |
| Resume matching | ❌ |
| Resume tailoring | ❌ |

---

## 15. The Product Vision (Post-MVP)

### Short Term (v0.2)

- Fix HTTP 405
- Add `<all_urls>` + guard
- Increase inactivity timeout
- Add login page handling
- Add session isolation

### Medium Term (v0.3-v0.5)

- Dashboard (applications list + stats)
- User authentication
- Auto-fill (fill forms with saved profile)
- Resume upload and parsing

### Long Term (v0.6+)

- Resume matching (score job vs resume)
- Resume tailoring (rephrase to match JD)
- Mass apply to relevant jobs (with guardrails)
- Behavior analytics (coaching suggestions)

### Ultimate Goal

**"The anti-doom-loop job search tool"** — helping job seekers apply with **intent and precision**, not spam.

---

## 16. Key Files Explained

### `manifest.json`

- Chrome MV3
- 10 ATS domains + `<all_urls>` (pending)
- `all_frames: true` for iframe support
- Permissions: `storage`, `tabs`, `scripting`, `notifications`

### `service-worker.js`

- Main entry point
- Sets up tab listeners
- Handles messages from content + popup
- Routes to `ApplicationTracker`

### `ApplicationTracker.js`

- **Core orchestrator**
- Handles tab created/updated/removed events
- Manages session lifecycle
- Coordinates state transitions
- Has utility methods: `extractJobIdFromUrl`, `getUrlLabel`, `detectJobIdSource`, `extractApplicationIdFromUrl`
- Has `handleSuccessDetected()` for content-based success

### `SessionManager.js`

- Session CRUD
- Tab-to-session mapping
- Persistence to storage
- Session restoration on startup

### `StrategyFactory.js`

- Registers 10 strategies
- Selects strategy based on URL
- Handles null URLs (fallback to generic)

### `state-registry.js`

- Pre-loads all 5 states with **static imports**
- **Critical for Chrome MV3** (dynamic `import()` disallowed)

### `SubmittedState.js`

- Terminal state
- Builds payload with `urlChain`
- Sends to backend (HTTP POST)
- Stores failed payloads for retry
- Shows notification
- Cleanup

### `content/bundle.js`

- Content script entry
- `JobPulse` class for job detection
- `SuccessDetector` class for success detection
- Runs in all frames (via `all_frames: true`)

---

## 17. The Session Data Structure

```javascript
{
  // Identity
  sessionId: 'session_1789625269383_0c1iopjg',
  
  // Job
  jobId: '4468212982',
  jobTitle: 'Senior Software Engineer, ITC',
  company: 'Nike',
  location: null,
  jobUrl: 'https://...',
  
  // Apply
  applyUrl: 'https://...',
  redirectUrl: 'https://...',
  sourceTabId: 204097779,
  redirectTabId: 204097848,
  trackedTabs: [204097779, 204097848, 204097851],
  
  // URL Tracking
  visitedUrls: [
    { order: 1, url: '...', label: '...', jobId: '...', timestamp, tabId, title }
  ],
  
  // Job IDs
  jobIds: { linkedin: '4468212982', external: '...' },
  externalJobId: '...',
  applicationReference: null,
  
  // ATS
  ats: 'workday',
  atsName: 'Workday',
  atsStrategy: <instance>,
  
  // State
  status: 'submitted',  // initiated | redirecting | in_progress | submitted | abandoned
  currentState: <State instance>,
  stateHistory: [...],
  
  // Steps
  steps: [...],
  stepCount: 0,
  
  // Timing
  startedAt: 1789625269383,
  redirectedAt: ...,
  submittedAt: ...,
  lastActivityAt: ...,
  abandonedAt: null,
  
  // Success
  successUrl: '...',
  thankYouPhrase: '...',
  confirmationMessage: null,
  
  // Timers
  timers: { inactivityTimeout: null, sessionTimeout: null },
  
  // Version
  version: '1.0.0',
  schema: 'session_v1'
}
```

---

## 18. How to Test

### Manual Testing Flow

| Step | Action |
|------|--------|
| 1 | Load extension in Chrome (`chrome://extensions/`) |
| 2 | Navigate to LinkedIn job |
| 3 | Click Apply |
| 4 | Complete application |
| 5 | Check service worker console for `[SubmittedState]` logs |
| 6 | Verify payload in `chrome.storage.local.failedSubmissions` |

### Console Commands

**Check failed payloads:**
```javascript
chrome.storage.local.get('failedSubmissions', (result) => {
  const failed = result.failedSubmissions || [];
  console.log('Total failed:', failed.length);
  failed.forEach((f, i) => {
    console.log(`#${i+1}: ${f.payload.jobTitle} at ${f.payload.company} (${f.payload.ats})`);
  });
});
```

**Check sessions:**
```javascript
chrome.storage.local.get('sessionManagerData', (result) => {
  const data = result.sessionManagerData;
  if (data && data.sessions) {
    console.log('Total sessions:', data.sessions.length);
  }
});
```

**Full payload:**
```javascript
chrome.storage.local.get('failedSubmissions', (result) => {
  const failed = result.failedSubmissions || [];
  const last = failed[failed.length - 1];
  console.log(JSON.stringify(last.payload, null, 2));
});
```

---

## 19. Backend Contract (What Backend Should Accept)

### Endpoint

```
POST /api/v1/applications/track
```

### Request Body

The payload as shown in Section 9.

### Response (Expected)

```json
{
  "success": true,
  "id": "app_abc123",
  "duplicate": false
}
```

### Status Codes

| Code | Meaning |
|------|---------|
| 200/201 | Success |
| 400 | Bad request |
| 401 | Unauthorized |
| 405 | Method not allowed (current error) |
| 500 | Server error |

---

## 20. Success Metrics (Post-Launch)

| Metric | Target |
|--------|--------|
| Activation | 60%+ users track at least 1 job |
| Usage | 5+ jobs tracked per user per week |
| Retention | 30%+ weekly retention in beta |
| Paying users | 50 in first 3 months (freemium) |

---

## 21. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `application-tracker.js` |
| Classes | PascalCase | `ApplicationTracker` |
| Methods | camelCase | `handleApplyClick` |
| Constants | UPPER_SNAKE | `MAX_INACTIVITY_COUNT` |
| Session IDs | `session_[timestamp]_[random]` | `session_1789551570367_tpdcrkqw` |
| Event types | UPPER_SNAKE | `JOB_DETECTED`, `APPLY_CLICKED` |
| States | lowercase | `initiated`, `in_progress` |

---

## 22. Design Principles

| Principle | What It Means |
|-----------|--------------|
| **Backend as source of truth** | Client-side checks are optimization only |
| **Never pretend success** | Only show "tracked" after backend confirms |
| **Separation of concerns** | Browser detects, extension coordinates, backend persists |
| **Extensible architecture** | Adding ATS = add strategy file, no core changes |
| **Chrome MV3 safe** | No dynamic imports, no eval, no remote code |
| **Progressive enhancement** | Works on known ATS, degrades gracefully on unknown |
| **Data first** | Store everything, process later |

---

## 23. Current Status Summary

| Area | Status |
|------|--------|
| **Extension core** | ✅ 90% complete |
| **ATS coverage** | ✅ 10 platforms + custom domains |
| **Success detection** | ✅ 4 methods |
| **Payload structure** | ✅ Complete |
| **Backend integration** | ⚠️ HTTP 405 blocking |
| **Dashboard** | ❌ Not started |
| **Authentication** | ⚠️ Partial |
| **Launch readiness** | 🟡 1-2 weeks to MVP launch |

---

## 24. Immediate Next Steps (Priority Order)

| # | Task | Time | Impact |
|---|------|------|--------|
| 1 | Fix backend HTTP 405 | 1-2 hours | 🔴 Unblocks everything |
| 2 | Add `<all_urls>` + `isJobPage()` guard | 1-2 hours | 🔴 10x coverage |
| 3 | Increase inactivity timeout to 10 min | 5 min | 🔴 Fewer false abandons |
| 4 | Test on Roku, Payoneer, Nike flows | 1 hour | 🔴 Verify fixes |
| 5 | Add login page handling | 2 hours | 🟡 Better UX |
| 6 | Session isolation (`isNewJobPage`) | 1 hour | 🟡 Clean data |
| 7 | Build simple dashboard | 1-2 days | 🟡 User visibility |
| 8 | Get 10 beta users | 1 week | 🟡 Real feedback |

---

## 25. Glossary

| Term | Meaning |
|------|---------|
| **ATS** | Applicant Tracking System (Greenhouse, Lever, Workday, etc.) |
| **Job Board** | LinkedIn, Naukri, Indeed — where jobs are found |
| **Company Career Page** | Custom domain where companies post jobs |
| **Iframe** | Embedded page inside another page (Greenhouse embeds) |
| **Session** | One job application from Apply click to submitted/abandoned |
| **State** | Current phase of session (initiated, redirecting, etc.) |
| **Strategy** | Logic for detecting/analyzing a specific ATS |
| **Payload** | Data sent to backend when application is submitted |
| **URL Chain** | All URLs the user visited during application |
| **Job ID** | Unique identifier for a job on a specific platform |
| **Success Detection** | Confirming user submitted the application |

---

## 26. Environment Setup

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 16+ |
| npm | 8+ |
| Chrome | Latest |

### Build

```bash
npm install
npm run build
```

### Load in Chrome

| Step | Action |
|------|--------|
| 1 | `chrome://extensions/` |
| 2 | Enable Developer Mode |
| 3 | Click "Load unpacked" |
| 4 | Select `dist/` folder |

### Watch Mode

```bash
npm run watch
```

---

## 27. Backend Stack (Recommended)

| Component | Technology |
|-----------|------------|
| Framework | FastAPI (Python) |
| Database 1 (raw) | PostgreSQL with JSONB |
| Database 2 (analytics) | PostgreSQL (normalized) |
| Hosting | Render / Railway / AWS |
| Auth | JWT |

### Backend Structure (Planned)

```
jobpulse_backend/
├── app/
│   ├── main.py
│   ├── api/v1/endpoints/
│   │   ├── sync.py
│   │   ├── jobs.py
│   │   ├── applications.py
│   │   └── users.py
│   ├── ats/                ← Pluggable ATS modules
│   ├── services/
│   └── db/
├── requirements.txt
└── README.md
```

---

## 28. Contact / Project Owner

This is a solo-developer project. For questions about implementation:

- **Focus:** Automatic job application tracking
- **Stack:** Chrome extension + FastAPI backend
- **Market:** India-first, global second
- **Business model:** Freemium (planned)

---

## 29. What a New Chat Should Know

**If you're picking this up in a new chat, here's what matters:**

1. **The extension is 90% complete** and working on 10 ATS platforms
2. **The main blocker is the backend HTTP 405 error**
3. **The next big lift is `<all_urls>` support** with an `isJobPage()` guard
4. **Success detection has 4 methods** (URL, iframe, keywords, phrases)
5. **The payload structure is finalized** — see Section 9
6. **The 5-state machine** drives all transitions
7. **Chrome MV3 constraints:** No dynamic imports, use `state-registry.js`
8. **The session data structure** is in Section 17
9. **Don't remove features** — always preserve existing functionality
10. **Follow the design patterns** listed in Section 6

---

## 30. Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-09 | Initial extension with 10 ATS, URL chain, job IDs |
| 0.2.0 (planned) | 2026-10 | `<all_urls>`, login handling, backend fix |
| 0.3.0 (planned) | 2026-11 | Dashboard, authentication |
| 0.4.0 (planned) | 2026-12 | Auto-fill |
| 0.5.0 (planned) | 2027-01 | Resume matching |
| 1.0.0 (planned) | 2027-Q1 | Public launch |

---