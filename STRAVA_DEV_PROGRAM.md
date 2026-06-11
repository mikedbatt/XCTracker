# Strava Developer Application — XCTracker submission pack

Working doc to drive the Strava API/Developer-Program work before launch.
Generated 2026-06-10. Delete or move once submitted.

App: **XCTracker** · Client ID **211521** · Tier **Standard**
Dashboard: https://www.strava.com/settings/api
Developer Program form (athlete-capacity increase, >10 athletes):
  https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8
  (durable path if that link changes: https://developers.strava.com/docs/rate-limits/
  → "Athlete Capacity" section → the form link)

---

## 0. TL;DR — what blocks launch

The launch school has **~118 athletes**. Strava caps an app at **1 connected
athlete** by default (self-serve to 10, no review). **>10 requires Strava to
approve a Developer Program request** — review takes ~1–3 weeks and isn't
guaranteed. **This is the long-pole launch blocker — submit ASAP.**

Two other Strava items, independent of the athlete cap, also must clear:
- **Subscription** active by **2026-06-30** (free code `b1a1a740cb`).
- **Callback domain** updated to **xctracker.com** (changed by the domain migration).

---

## 1. API settings to set/verify NOW (self-serve, no review)

In https://www.strava.com/settings/api for app 211521:

- [ ] **Authorization Callback Domain → `xctracker.com`**
      (domain only — no scheme, no path, no trailing slash).
      WHY CHANGED: the client builds `redirect_uri` as
      `${window.location.origin}/strava-callback`, and users now land on
      xctracker.com (canonical). Old value was `xctracker-a2532.web.app`.
      If wrong, OAuth returns `{"field":"redirect_uri","code":"invalid"}`.
      ⚠️ Strava allows ONE callback domain per app — setting xctracker.com keeps
      native OAuth paused (expected for the PWA beta).
- [ ] **Website** → https://xctracker.com
- [ ] **Application description** → see §3 narrative (short version).
- [ ] **App icon** → XCTracker mark (assets/).
- [ ] **Subscription active?** If not, redeem free code `b1a1a740cb` (due 2026-06-30).
- [ ] **Bump connected-athlete limit to 10** (self-serve) so testers can connect
      while the >10 review is pending.

## 2. Developer Program request (the >10-athlete review)

Strava reviews these manually. They favor apps that: use the official
**Connect with Strava** button, show clear attribution, **use webhooks** (not
just polling), don't store raw streams, and handle disconnect cleanly.
**XCTracker already does all of these** — lead with that.

### Compliance talking points (all already true — verify before submitting)
- ✅ **Official "Connect with Strava" button** — the unmodified asset from
      Strava's brand pack (`assets/images/strava-connect-orange.png`, orange @2x),
      rendered at native aspect ratio (237×48) in `screens/StravaConnect.js`.
      (Fixed 2026-06-10: previously a non-compliant FontAwesome recreation; now
      the real asset, no recolor/stretch.)
- ✅ **Webhooks** for event-driven sync (`stravaWebhook` + `processStravaEvent`
      in `functions/index.js`), not just polling. Polling is a fallback only.
- ✅ **Raw streams NOT stored** — only the derived per-zone seconds
      (`paceZoneSeconds`) is persisted (privacy + storage decision, commit 87ec0d5).
- ✅ **Clean disconnect/deauth** — tokens deleted on deauthorization
      (`processStravaEvent`); user can disconnect anytime from Profile.
- ✅ **No resale, no advertising, no AI/ML training** on Strava data — stated in
      the live privacy policy.
- ✅ **Privacy policy + ToS** with Strava-specific disclosures, live:
      https://xctracker.com/privacy.html · https://xctracker.com/terms.html
- ✅ **Per-run extra call is bounded** — one pace-stream fetch per new run;
      webhooks keep volume low. Rate limits at the 10-athlete tier
      (200 read/15min, 2,000/day) are comfortable; full-school scale relies on
      webhooks + the server-side backfill rather than per-client polling.

### Screenshots to attach (every place Strava data appears + the button)
Capture these from the live web app (sign in as a test athlete with a connected
Strava account):
1. **Connect screen** — `StravaConnect` showing the official "Connect with
   Strava" button (Profile → Connections).
2. **Strava OAuth consent screen** — the Strava-hosted authorize page (shows the
   scopes XCTracker requests).
3. **Athlete dashboard** — synced runs in the list + pace-zone display.
4. **Run detail** — `RunDetailModal` for a Strava-synced run (distance, duration,
   pace, pace-zone breakdown).
5. **Analytics** — `AthleteAnalytics` pace-zone / mileage charts derived from runs.
6. **Disconnect** — Profile → Connections → Manage, showing the disconnect option.
(If the form asks, note that runs are also visible to the athlete's coach for
team training — same data, role-gated per the privacy policy.)

## 3. Application narrative (draft — paste into the form)

**Short (for the API settings "description" field):**
> XCTracker is a training platform for high-school cross country and track
> teams. Athletes optionally connect Strava to import their runs; we use the
> distance, duration, and pace data to populate their training log and compute
> personalized pace-based training zones. Coaches use the aggregated team
> training to plan workouts and monitor injury risk. We don't sell, share, or
> advertise against Strava data, and we don't use it to train AI models.

**Long (for the Developer Program "describe your app / use case" field):**
> XCTracker (https://xctracker.com) is a team training platform for high-school
> cross country and track programs, with three roles: athletes, coaches, and
> parents. Athletes may optionally connect their Strava account via the official
> "Connect with Strava" OAuth flow. On connect we import the athlete's
> activities (summary distance, moving time, activity type, start date) and the
> activity's pace stream, which we use solely to (a) populate the athlete's
> XCTracker training log and (b) compute their personalized pace-based training
> zones (VDOT methodology). Their coach can view the team's training to plan
> workouts and monitor overtraining/injury risk.
>
> Data handling: we do NOT persist raw Strava streams — only a derived per-zone
> time summary per run is stored. We never sell, rent, license, share, or
> advertise against Strava data, and we never use it to train machine-learning
> or AI models. Athletes can disconnect at any time, which deletes their stored
> Strava tokens. New activities sync via Strava webhooks (event-driven), with a
> server-side backfill for history and client polling only as a fallback; this
> keeps our API call volume low. Token exchange/refresh runs server-side in
> Firebase Cloud Functions.
>
> We are launching with one high-school program of ~118 athletes and plan to
> expand to additional schools, so we are requesting increased connected-athlete
> access. Our privacy policy (https://xctracker.com/privacy.html) and terms
> (https://xctracker.com/terms.html) document our Strava data use.

**Requested athlete capacity:** start with the launch school (~118), scaling to
several hundred across multiple schools over the next year.

## 4. After approval — verify it actually works

- [ ] Connect a 2nd/3rd real Strava account (not the owner's) → no
      `403 Limit of connected athletes exceeded`.
- [ ] New run on Strava appears in XCTracker within a few minutes (webhook path).
- [ ] "Import last 60 days" backfill works for a freshly connected athlete.
- [ ] Disconnect → tokens cleared; re-connect → re-imports.

## 5. Related memory
- `reference_strava_api_changes` — Standard-Tier deadlines + athlete-cap detail.
- `reference_strava_test_config` — callback-domain + shared-athlete-ID test gotcha.
- `project_custom_domain_xctracker_com` — the domain migration that moved the
  callback domain to xctracker.com.
- `project_prelaunch_checklist` — the master launch list.
