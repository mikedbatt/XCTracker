# TeamBase — Testing Notes & Gotchas

Quick reference for things that trip up testing but are **not** product bugs.
Keep this short; move anything that becomes a real code concern into the issue
tracker or CLAUDE.md.

## Strava

### 1. Don't connect the same Strava account to multiple test users
The Strava webhook routes each incoming run to a user by matching
`stravaAthleteId`, and it takes the **first match only** (`.limit(1)` in
`processStravaEvent`). If several test accounts are connected to the **same**
Strava account, every run lands on just **one** of them — the others get nothing
via the webhook, no matter which you sign into.

- **Why it's not a prod bug:** real athletes each have their own Strava account
  (unique `stravaAthleteId`), so routing is a clean 1:1.
- **To populate a specific test user anyway:** Profile → Connections → **Manage →
  Import last 60 days** (backfill uses *that* user's token; dedupe-safe).
- **For realistic ongoing webhook testing:** give test users **separate** Strava
  accounts (a free second Strava login works).

### 2. Web Strava OAuth requires the callback domain set to the web host
Strava allows **one** "Authorization Callback Domain" per app
(https://www.strava.com/settings/api). For the web/PWA it must be exactly:

```
xctracker-a2532.web.app
```

(domain only — no `https://`, no path, no trailing slash). If it's wrong, the
OAuth page errors with:
`{"message":"Bad Request","errors":[{"field":"redirect_uri","code":"invalid"}]}`

- The client builds `redirect_uri` as `${window.location.origin}/strava-callback`,
  so testers must open the app from `xctracker-a2532.web.app` — **not** the
  alternate `xctracker-a2532.firebaseapp.com` host Firebase also serves.
- Note: switching this domain to the web host **pauses native Strava OAuth**
  (native used a different redirect). That's expected for the PWA beta.

### 3. On web, signing in does NOT trigger a Strava sync
Unlike native (which polls on app open), web sync is entirely server-side:
new runs via the **webhook**, history via the **one-time import on connect**
(or the manual "Import last 60 days"). So "I signed in but nothing synced" is
expected on web — it's not a sync trigger.
