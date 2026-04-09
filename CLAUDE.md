# TeamBase — Claude Code Guide

## Project Overview
TeamBase is a team training platform built with React Native + Expo. It supports multiple sports (cross country, indoor track, outdoor track, and more). It has three main user roles — **athletes**, **coaches**, and **parents**. Athletes log runs, sync from Strava, and view pace-based training zones. Coaches manage their team, plan workouts, track compliance, and monitor athlete wellness. Parents can view their athlete's progress and access team communication.

## Tech Stack
- **Framework:** React Native with Expo (SDK 54) + Expo Router v6
- **Backend:** Firebase (Firestore database, Firebase Auth)
- **External API:** Strava API v3 (OAuth 2.0)
- **Language:** JavaScript/JSX (no TypeScript in source files despite tsconfig.json)
- **Build:** EAS Build (Expo Application Services)

## Project Structure
```
screens/          # All application screens (main source code lives here)
components/       # Reusable UI components
constants/        # Theme colors and app-wide constants
hooks/            # React hooks (theming)
assets/           # Images and icons
firebaseConfig.js # Firebase initialization (reads from .env)
stravaConfig.js   # Strava OAuth + activity sync (reads from .env)
zoneConfig.js     # Heart rate zone calculations and utilities
app.json          # Expo config
eas.json          # EAS Build config
```

## Key Source Files
- `screens/AthleteDashboard.js` — Athlete's main screen, run logging, Strava sync, leaderboard
- `screens/CoachDashboard.js` — Coach's team view, athlete cards, overtraining detection
- `screens/RunDetailModal.js` — Run view/edit with pace calculation and zone breakdown
- `screens/StravaConnect.js` — OAuth flow and activity import
- `screens/LoginScreen.js` — Auth with role-based signup and age verification
- `zoneConfig.js` — Zone math, boundary validation, birthdate parsing utilities

## Environment Variables
All credentials are in `.env` (gitignored — never commit this file). See `.env.example` for the required keys. Uses Expo's `EXPO_PUBLIC_` prefix so variables are available via `process.env.EXPO_PUBLIC_*`.

**TODO before App Store submission:** Move Strava token exchange (`exchangeStravaCode`, `refreshStravaToken` in `stravaConfig.js`) to a Firebase Cloud Function so the client secret is never in the app bundle.

## Heart Rate Zone System
5-zone model based on % of max HR (220 - age). Zones: Recovery (Z1) < 60%, Aerobic Base (Z2) 60-70%, Aerobic Power (Z3) 70-80%, Threshold (Z4) 80-90%, Anaerobic (Z5) > 90%. Coaches can customize boundaries per team. Zone calculations use a 3-tier priority: raw HR stream → stored zone seconds → average HR estimate. The 80/20 principle (80% Z1+Z2, 20% Z3-5) is the core training philosophy.

## Duration Format
Runs use `MM:SS` or `HH:MM:SS` string format throughout. Always handle both cases when parsing duration strings. Use the pace calculation pattern in `RunDetailModal.js` as the reference implementation.

## Coding Conventions
- Functional React components with hooks
- Firestore reads use `getDoc` / `getDocs` from `firebase/firestore`
- Dates from Firestore are Timestamps — always use `.toDate()` or `parseBirthdate()` from `zoneConfig.js`
- Error handling: use `console.warn` in catch blocks for expected-to-fail Firestore reads (zone settings, etc.), `console.log` or `console.error` for unexpected errors — never leave empty `catch {}` blocks
- No TypeScript — plain JavaScript only

## Running Locally
```bash
npx expo start --dev-client   # after installing dev client build on device
npx expo start                # with Expo Go (limited)
eas build --profile development --platform ios   # build dev client
eas build --profile preview --platform ios       # build for TestFlight
```
