# TeamBase — Claude Code Guide

## Project Overview
TeamBase is a team training platform built with React Native + Expo. It supports
multiple sports (cross country, indoor track, outdoor track, and more). Three
main user roles:

- **Athletes** — log runs, sync from Strava, view HR and pace training zones,
  take daily wellness check-ins, view team feed and race results.
- **Coaches** — manage roster (approve/remove athletes), plan workouts and
  seasons, monitor compliance and wellness, run team analytics, manage races
  and results, post to team feed, set custom HR/pace zone boundaries.
- **Parents** — linked to one or more athletes (potentially at different
  schools), view their athletes' progress, read the team feed, get push
  notifications. Cannot post.

Note: repo folder is still named `XCTracker/` from pre-rebrand; product name
is TeamBase everywhere in UI/assets.

## Tech Stack
- **Framework:** React Native with Expo (SDK 54) + Expo Router v6
- **Backend:** Firebase (Firestore, Firebase Auth, Firebase Cloud Functions,
  Firebase Cloud Messaging for push)
- **External API:** Strava API v3 (OAuth 2.0, token exchange server-side via
  Cloud Function)
- **Language:** JavaScript/JSX for screens/components; `app/index.tsx` is the
  only TypeScript file (Expo Router entry). No TS in feature code.
- **Build:** EAS Build (Expo Application Services)

## Project Structure
```
app/              # Expo Router entry (index.tsx only)
screens/          # All application screens — main source code
components/       # Reusable UI components (Card, Button)
constants/        # Theme colors and app-wide constants
hooks/            # React hooks (theming)
utils/            # Pure-logic helpers (pace zones, race utils, compliance)
functions/        # Firebase Cloud Functions (push notifications, Strava OAuth)
assets/           # Images and icons
firebaseConfig.js # Firebase client initialization (reads from .env)
stravaConfig.js   # Strava OAuth + activity sync (client side)
zoneConfig.js     # HR zone math, boundary validation, birthdate parsing
```

## Key Source Files

### Athlete-facing
- `screens/AthleteDashboard.js` — main screen, run logging, Strava sync,
  leaderboard, wellness prompt
- `screens/AthleteProfile.js` / `AthleteAnalytics.js` — profile, zone
  breakdowns, progress charts
- `screens/RunDetailModal.js` — run view/edit, pace calculation, HR + pace
  zone breakdown. **Reference implementation for pace calculation logic.**
- `screens/WellnessCheckIn.js` — daily wellness form
- `screens/StravaConnect.js` — OAuth flow (kicks off); token exchange happens
  server-side in `functions/index.js`
- `screens/SeasonReview.js` — post-season visual recap

### Coach-facing
- `screens/CoachDashboard.js` — team view, athlete cards, overtraining flags,
  injury-risk (ACWR) card
- `screens/CoachAnalytics.js` — team-wide compliance and zone distribution
- `screens/ManageRoster.js` / `ManageGroups.js` / `ManageSeasons.js` — roster
  and structural management
- `screens/WorkoutLibrary.js` / `WorkoutDetailModal.js` / `WeeklyPlanner.js`
  / `SeasonPlanner.js` — workout prescription
- `screens/ZoneSettings.js` — custom HR/pace zone boundaries per team
- `screens/AttendanceScreen.js` — take roll for a given date, sort by first
  or last name, writes to `attendance` collection (docId:
  `{schoolId}_{athleteId}_{YYYY-MM-DD}`)
- `screens/RaceManager.js` / `RaceResults.js` / `RaceResultsEntry.js`
  / `MeetDetail.js` — race and meet management

### Parent-facing
- `screens/ParentDashboard.js` — multi-athlete, multi-school parent view
- `screens/ParentLinkScreen.js` — link parent account to an athlete

### Team communication
- `screens/TeamFeed.js` / `ChannelList.js` — team feed with image attachments

### Auth and onboarding
- `screens/LoginScreen.js` — auth with role-based signup, age verification
- `screens/AthleteJoinScreen.js` / `AssistantJoinScreen.js` — self-add to a
  team's pending list, coach approval required before roster access
- `screens/CoachSetupScreen.js` — coach first-run setup

### Shared logic
- `zoneConfig.js` — HR zone math, boundary validation, birthdate parsing
- `utils/vdotUtils.js` — **pace zone math** (VDOT methodology). Anything
  pace-zone-related should use this.
- `utils/raceUtils.js` — race sorting, filtering, CSV import helpers
- `utils/complianceUtils.js` — training compliance scoring
- `utils/acwrUtils.js` — Acute:Chronic Workload Ratio. Injury-risk metric
  comparing last-7-day miles to 28-day average. Sweet spot 0.8–1.3; >1.5 is
  a spike. Used on CoachDashboard's Injury Risk card and in the overtraining
  alert system.

### Server-side
- `functions/index.js` — Cloud Functions: push notification scheduling
  (wellness check-ins at 5 PM local), Strava OAuth token exchange via
  HTTP endpoints (onRequest)

## Environment Variables
All credentials are in `.env` (gitignored — never commit). See `.env.example`
for required keys. Uses Expo's `EXPO_PUBLIC_` prefix for client-side
variables (`process.env.EXPO_PUBLIC_*`). Cloud Functions use Firebase env
config (not the same file).

## Training Zone System

### Heart Rate Zones
5-zone model based on % of max HR (220 − age):
- Z1 Recovery < 60%
- Z2 Aerobic Base 60–70%
- Z3 Aerobic Power 70–80%
- Z4 Threshold 80–90%
- Z5 Anaerobic > 90%

Coaches can customize boundaries per team in `ZoneSettings.js`. HR zone
calculation uses 3-tier priority: raw HR stream → stored zone seconds →
average HR estimate. Math lives in `zoneConfig.js`.

### Pace Zones
Pace-based zones derived from VDOT (Jack Daniels' running fitness metric)
live in `utils/vdotUtils.js`. Pace zones run parallel to HR zones throughout
the app — any view that shows HR zone breakdown also shows pace zone
breakdown when pace data is available. Used in `CoachDashboard`,
`AthleteDashboard`, `RunDetailModal`, `AthleteAnalytics`, `SeasonReview`, etc.

### Training Philosophy
The 80/20 principle (80% Z1+Z2, 20% Z3–5) is the core training philosophy
and drives the compliance flags shown on the coach dashboard.

## Duration Format
Runs use `MM:SS` or `HH:MM:SS` string format throughout. Always handle both
cases when parsing duration strings. Use the pace calculation pattern in
`RunDetailModal.js` as the reference implementation.

## Privacy / Storage
Raw HR and pace streams from Strava are **not** persisted — only
derived zone-seconds are stored per run. This is both a storage optimization
and a privacy decision. See commit `87ec0d5`.

## Coding Conventions
- Functional React components with hooks
- Firestore reads use `getDoc` / `getDocs` from `firebase/firestore`
- Dates from Firestore are Timestamps — always use `.toDate()` or
  `parseBirthdate()` from `zoneConfig.js`
- **Error handling:** `console.warn` in catch blocks for expected-to-fail
  Firestore reads (zone settings, optional docs); `console.error` for
  unexpected errors (network failures, bugs). Never leave empty `catch {}`.
- No TypeScript in feature code — plain JavaScript only

## Data Loading Patterns
Three rules that keep dashboards fast:

1. **Parallelize independent queries** with `Promise.all`. Never chain
   `await getDocs(...)` calls unless the later query genuinely depends on the
   earlier one. See `CoachDashboard.loadDashboard` for a phased
   Promise.all-first pattern.

2. **Batch per-entity queries** with `utils/batchDocsByIds.js` instead of
   per-entity loops. One batched query (`where field in [ids]`) replaces
   N sequential round-trips. Firestore's `in` operator is capped at 30 values
   per query — the helper chunks in parallel. Applies to any "for each
   athlete, fetch their X" pattern.

3. **Wrap loads in `hooks/useStaleRefresh.js`** for screens the user
   returns to. First load shows the spinner; subsequent loads (e.g.
   tab returns) keep the cached data visible and refresh silently in the
   background. Do NOT include UI-state variables (tab toggles, modal flags)
   in the deps array — only include data-relevant state (schoolId,
   selectedTimeframe).

## Running Locally
```bash
npx expo start --dev-client   # after installing dev client build on device
npx expo start                # with Expo Go (limited)

eas build --profile development --platform ios   # build dev client
eas build --profile preview --platform ios       # build for TestFlight
```

## Cloud Functions
```bash
cd functions
npm run deploy   # deploy to Firebase (Node.js 22 runtime)
```
