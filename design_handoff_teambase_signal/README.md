# Handoff: TeamBase — "Signal" Visual Redesign (Direction D)

## Overview
This package is a complete visual redesign of the **TeamBase** app (the `XCTracker` Expo / React Native codebase) in a direction we've been calling **"Signal."** It covers all 21 core screens across athlete, coach, shared, racing, planning, and onboarding flows. Every screen was rebuilt to be **structurally faithful to the existing app** — same sections, same data, same actions — but in a fresh white-first, vibrant-accent visual language.

The goal of implementation: **re-skin the existing screens in `XCTracker/screens/*.js`** to match these designs, reusing the app's existing data layer, navigation, and Firestore logic. This is a styling + layout pass, **not** a rewrite of business logic.

## About the Design Files
The files in this bundle are **design references built in HTML/React (via Babel-in-browser)** — prototypes showing the intended look, layout, and interaction. They are **not** production code to paste in. Each screen is a plain-DOM React component using inline styles; your real app is **React Native** (Expo). The task is to **translate each HTML design into the existing RN screen** using the codebase's established patterns: `StyleSheet.create`, the `constants/design.js` token module, `View`/`Text`/`TouchableOpacity`/`ScrollView`, `Ionicons`, etc.

Treat the HTML as the spec for *what it should look like*; implement it the RN way.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and component structure. Recreate pixel-faithfully using the app's existing RN primitives. Where the HTML uses web-only tricks (CSS `backdrop-filter`, `position: sticky`, emoji, SVG rings), use the RN equivalent (`expo-blur`, sticky headers via library or plain header, `Ionicons`, `react-native-svg`).

---

## Implementation Deltas

Decisions made during implementation that override the original Signal spec.
These supersede anything below; the rest of the document has been edited
in-place where possible to keep one source of truth.

### Typography
- **Section headings ("Upcoming workouts", "Team leaderboard", "My runs"):**
  use **Inter Tight SemiBold (600)** at **18pt**, **indigo color**.
  *Original spec called for Instrument Serif with italic accent on the second
  word.* Reason: italic serif headings felt too editorial / fancy for a
  high-school audience. Greeting "Hey, [Name]" still uses serif for warmth.
- **Greeting "Hey, [Name]":** **29pt** (was 32pt), **both words indigo**, no
  italic on either word, uses `SIGNAL.font.display` (Instrument Serif Regular).
  Original spec had the name italic + accented; unified treatment reads cleaner.
- **Workout card title "Monday Easy — 5 mi":** entire string uses **one
  style** (Inter Tight SemiBold, ink, 14pt). Don't nest a lighter-weight
  Text for the mileage suffix — it's hard to read against the title.

### Color
- **No two-tone display headings.** Both the first and accent word in a
  display heading are the same indigo color. Italic-accent treatment is
  retired.

### Layout
- **Hero "weekly miles" card:** the progress bar lives **inline with the
  mileage row** (right-aligned, ~3/4 width of the space after "/ N mi"),
  not as its own row below. Saves vertical space and matches the legacy
  pattern athletes already know.
- **Hero card GPS badge:** **removed.** The badge in the spec was meant
  to signal stream-derived (vs estimated) pace data, but the current
  implementation always shows it. Bring back only as a conditional
  indicator if/when the data source can be reliably detected.
- **Workout cards:** **type chip sits to the LEFT** of the title block,
  not above it. Cards are then a single row of content — much more compact.
  Visual: `[chip] [title / pace / date] [›]` with the 3px colored left border.
- **Header top padding:** **68pt iOS / 44pt Android** (the original 52/32
  felt crowded against the status bar safe area).

### Gradients
- `expo-linear-gradient` is **not installed**. Use **solid `SIGNAL.color.indigo`**
  for: the check-in card background, the hero progress fill, and the avatar
  background. The README's metric-tolerant clause applies — install
  `expo-linear-gradient` later if we want to bring gradients back.

### Bug-fix patterns to watch for in future translations
- **Avatar color**: profile avatar must read from `userData.avatarColor` (or
  the `localAvatarColor` state the dashboard already computes), NOT hardcoded
  `SIGNAL.color.indigo`. Athletes can pick their own avatar color in profile.
- **Preserve unused conditional UI**: when re-skinning, every conditional
  banner / modal / state in the original screen must remain. The reference
  components only show happy-path layouts — modals, sync banners, pending
  banners, no-school banners, season-review banner, VDOT/Strava prompts all
  exist in the real screens and must be preserved with Signal styling
  (white card, hairline border, eyebrow + body, indigo CTA).

---

## Design Direction: "Signal"

White-first surfaces. Color is **signal, not decoration** — every hue maps to a meaning (sport, workout type, effort zone, or status). Generous whitespace, hairline rules, large tabular numerals, and a serif-italic display face for warmth.

### Typography
| Role | Font | Usage | Notes |
|---|---|---|---|
| **Display (personal/warm)** | **Instrument Serif** Regular | Greeting "Hey, [Name]" | 29pt, indigo color, **no italic**. Both first word and name in same color/style — no two-tone accent. |
| **Section heading** | **Inter Tight SemiBold (600)** | "Upcoming workouts", "Team leaderboard", "My runs" | 18pt, indigo color. *Replaces the original italic-serif section-heading treatment.* |
| **Body / UI** | **Inter Tight** | All labels, buttons, body, list rows | weights 400/500/600/700, `letter-spacing: -0.01em` |
| **Numbers** | **Inter Tight, tabular-nums** | Mileage, times, stats | `font-variant-numeric: tabular-nums; letter-spacing: -0.03em; font-weight: 600` |
| **Mono / data** | **JetBrains Mono** | Paces, timestamps, codes, small data labels | tabular-nums |

> RN: load these via `expo-font` / Google Fonts. If a face is unavailable at first, fall back to system serif / `Inter` / system mono and swap in later — the layout is metric-tolerant.

Eyebrow label pattern (used everywhere): `font-size: 11px; letter-spacing: 0.13em; text-transform: uppercase; color: #6B7280; font-weight: 500`.

### Color tokens
These extend the existing `constants/design.js`. Keep the file as the single source of truth — add a `SIGNAL` block.

**Neutrals / surface**
| Token | Hex | Use |
|---|---|---|
| white | `#FFFFFF` | cards, sheets |
| paper | `#FAFBFC` | inset fields, secondary surfaces |
| paper2 | `#F4F5F7` | screen background (behind cards), device bg |
| line | `#E6E8EC` | hairline borders, dividers |
| ink | `#0B0D12` | primary text, dark buttons |
| inkSoft | `#2A2E38` | body text |
| mute | `#6B7280` | secondary text, eyebrows |
| mute2 | `#9AA0AB` | tertiary text, inactive tab labels |

**Primary + accents** (the "signal" palette)
| Token | Hex | Meaning |
|---|---|---|
| **indigo** | **`#4F46E5`** | **PRIMARY** — actions, active states, links, tab active |
| violet | `#7C3AED` | intervals; gradient partner with indigo |
| pink | `#EC4899` | PRs / celebration / race accents |
| coral | `#FB7185` | alerts / errors / "too hard" / flags |
| amber | `#F59E0B` | warnings / tempo / "caution" / build phase |
| lime | `#84CC16` | easy runs |
| emerald | `#10B981` | success / "on track" / XC sport / good readiness |
| cyan | `#06B6D4` | long runs / swim sport / info |

> Tint convention: a chip/background uses the accent at low alpha — hex suffix `1A` (~10%) for fills, `0D`/`0A` for very subtle wash, `14`–`18` for chip backgrounds. Text/icon sits at full strength. Example: easy chip = `background: #84CC1618; color: #84CC16`.

**Workout-type → color** (mirrors `constants/training.js` `TYPE_COLORS`, re-hued for Signal)
`Easy #84CC16 · Tempo #F59E0B · Long Run #06B6D4 · Intervals #7C3AED · Speed/Race #EC4899 · Recovery/Rest #9AA0AB · Hills #7C3AED · Race(event) #DC2626`

**Effort 1–10 ramp** (replaces `EFFORT_COLORS`): `1–2 #10B981 · 3–4 #84CC16 · 5–6 #F59E0B · 7–8 #FB7185 · 9 #EF4444 · 10 #DC2626`

**Sport accent** (multisport-ready, but XC-default in current app): XC `#10B981` · Track `#FB7185` · Swim `#06B6D4` · MTB `#F59E0B`. *(Sport tabs are intentionally OFF in this redesign — app is XC-focused today — but the accent mapping exists for later.)*

### Spacing, radius, shadow
- **Spacing**: 4px base. Common values 4 / 8 / 10 / 12 / 14 / 16 / 18 / 22. Screen horizontal padding is **14–18px**; cards pad **14–16px**.
- **Radius**: chips/pills `999px`; small controls `8–10px`; buttons `11–12px`; **cards `14–16px`**; sheets `18px`.
- **Borders over shadows**: cards are `1px solid #E6E8EC` on white, **no drop shadow** (flat, hairline aesthetic). Reserve soft shadows only for the bottom tab bar / floating elements.
- **Bottom tab bar**: translucent white (`rgba(255,255,255,0.92)` + blur), `1px` top border, active item = indigo label + a 4px indigo dot under it. Tabs: Athlete = Home/Log/Calendar/Stats/Feed; Coach = Team/Training/Meets/Feed/Me.

### Universal patterns
- **Status-bar safe area**: every screen header pads `~52px` top (matches the app's `paddingTop: Platform.OS === 'ios' ? 56 : 32`).
- **Headers**: back chevron `‹` + serif-italic title (often centered) + optional right action (`+ Add`, `Edit`, avatar).
- **Expandable section card**: number/icon badge (indigo tint circle) + title + eyebrow subtitle + chevron that rotates 180° when open; body reveals below. Used across Stats, Coach Dashboard, Coach Analytics, Athlete Detail.
- **Chips**: pill, accent at `18` alpha bg + full-strength text, often a 5–6px leading dot.
- **Readiness ring**: SVG circle, color by value (`<4 coral, <7 amber, else emerald`), number + "/10" centered. RN: `react-native-svg`.
- **Mileage volume bars**: target "ghost" bar (paper2 + line border) behind a colored "actual" bar (emerald on-track / amber under / coral over); current week outlined indigo with a "NOW" label.

---

## Screens / Views

All screens are 402×874 (iPhone). Each bullet notes the **real source file** to re-skin. See each component file for exact markup, copy, and measurements.

### Athlete
1. **Athlete Dashboard** — `screens/AthleteDashboard.js` → `components/athlete-dashboard.jsx`
   Prompt-driven: greeting header (avatar + unseen-parent badge) → weekly-miles hero with **expandable pace-zone breakdown** (Z1–Z5 stacked bar + minutes + 80/20 line) → daily check-in gradient card → Strava/VDOT prompt cards → Upcoming workouts (type badge, title, target pace, date) → timeframe pills → **Team leaderboard** (All / My Group, top-5, "You" highlighted) → **My runs** (miles/date/duration/effort or "Rate effort").
2. **Athlete Stats** — `screens/AthleteAnalytics.js` → `components/athlete-stats.jsx`
   Time-range pills + 5 expandable numbered sections: ① Mileage Volume (phase strip + target-ghost bars), ② Easy-Hard Balance (94% gauge + 4-week trend dots + pace-zone rows + **effort polarization** 1–10 chart), ③ Race Performance (PR banner + race rows), ④ Readiness (ring + sleep/legs/mood gauges + load/alert), ⑤ Season in Review list.
3. **Athlete Profile** — `screens/AthleteProfile.js` → `components/athlete-actions.jsx` (`AthleteProfileFaithful`)
   Avatar block + Profile / Messages / Connections tabs. Profile: personal info, **avatar-color picker** (`AVATAR_COLORS`), HR-zones toggle, **VDOT calculator** (distance pills, time input, Calculate → E/M/T/I/R pace table, Save). Messages: coach messages. Connections: Strava + linked parents + leave/sign-out.
4. **Workout Detail** — `screens/WorkoutDetailModal.js` → `components/athlete-actions.jsx` (`WorkoutDetailFaithful`)
   Category·type badge, title + date, distance (per group), highlighted **threshold-pace** block, location, workout details, posted-by, Edit/Delete.
5. **Log a Run** — log modal in `screens/AthleteDashboard.js` → `components/athlete-actions.jsx` (`LogRunFaithful`)
   Big editable distance, duration + date, **1–10 effort picker** (color-coded + label), optional HR/type/notes, Save.

### Coach
6. **Coach Dashboard** — `screens/CoachDashboard.js` → `components/coach-dashboard.jsx`
   Header (Coach name + athlete count + join code) → Today's plan (+ "Send daily message") → **four expandable triage cards**: Mileage Volume (3-week W3·W2·W1 compliance), Easy-Hard Balance, Injury/Illness alert (coral-tinted), Injury Risk **ACWR** (spike/elevated/sweet/ramping buckets) → Team roster (timeframe + Boys/Girls + group chips, sorted by miles) → Upcoming training.
7. **Coach Analytics** — `screens/CoachAnalytics.js` → `components/coach-analytics.jsx`
   **Two tabs.** Training: ① Compliance, ② Easy-Hard, ③ Load/Injury, ④ Attendance, ⑤ Pack Compression (boys/girls spread + top-10 bars), ⑥ Wellness (gauges + active injuries + per-athlete scores). Race: pack-spread trend + per-race 1–5 spread / team avg / score / #6–#7 gaps.
8. **Athlete Detail (coach)** — `screens/AthleteDetailScreen.js` → `components/coach-tools.jsx` (`AthleteDetailFaithful`)
   Athlete header + stat row (week/month/total/easy%) + Message/Adjust actions + expandable sections (Volume, Easy-Hard, Readiness, Race, Run History, Attendance grid).
9. **Wellness Check-in** — `screens/WellnessCheckIn.js` → `components/coach-tools.jsx` (`WellnessCheckInFaithful`)
   Sleep/Legs/Mood emoji option rows → "I'm good / Something's up" gateway → injury body-part chips + per-location severity (+ illness) → Submit (pinned) / Skip.
10. **Workout Library** — `screens/WorkoutLibrary.js` → `components/coach-tools.jsx` (`WorkoutLibraryFaithful`)
    Classic / Your-library tabs, phase chips, workout cards (name, type badge, duration, description, Save).

### Shared
11. **Team Calendar** — `screens/CalendarScreen.js` → `components/calendar.jsx`
    Month grid (multi-dot by workout type + gray "my run" dot), legend, tappable day → selected-day items (target paces) + logged runs, Upcoming list.
12. **Team Feed** — `screens/TeamFeed.js` → `components/team-feed.jsx`
    Chat-bubble channel: own = right/indigo, others = left/white w/ author + COACH/CAPTAIN role badge, image posts, composer pinned at bottom.

### Racing
13. **Race Manager** — `screens/RaceManager.js` → `components/racing.jsx` (`RaceManagerFaithful`) — Upcoming (days-out badge) + Past meet cards.
14. **Meet Detail** — `screens/MeetDetail.js` → `components/racing.jsx` (`MeetDetailFaithful`) — meet info bar + race cards (gender/level/distance chips, results/entries badge).
15. **Race Results** — `screens/RaceResults.js` → `components/racing.jsx` (`RaceResultsFaithful`) — pack stats (1–5 spread / team avg / score) + #6/#7 displacement + results table with scorer (indigo) and displacer (amber) row tints.

### Planning & roster
16. **Season Planner** — `screens/SeasonPlanner.js` → `components/planning.jsx` (`SeasonPlannerFaithful`) — active-phase badge + season cards + phase guide.
17. **Weekly Planner** — `screens/WeeklyPlanner.js` → `components/planning.jsx` (`WeeklyPlannerFaithful`) — week nav + easy/hard intensity bar + day cards (Varsity/JV miles) + group-total compliance chips.
18. **Manage Roster** — `screens/ManageRoster.js` → `components/planning.jsx` (`ManageRosterFaithful`) — summary count + athlete rows (pending → Approve/Deny, active → Remove).

### Onboarding & parent
19. **Login / Sign up** — `screens/LoginScreen.js` → `components/auth-parent.jsx` (`LoginFaithful`) — brand header, sign-in/up toggle, role cards (Head Coach / Assistant / Athlete / Parent), name/email/password/gender fields.
20. **Find Your School** — `screens/AthleteJoinScreen.js` → `components/auth-parent.jsx` (`AthleteJoinFaithful`) — join-code input + search + school result cards.
21. **Parent Dashboard** — `screens/ParentDashboard.js` → `components/auth-parent.jsx` (`ParentDashboardFaithful`) — athlete switcher chips, athlete summary stats, upcoming meets, coach feed, linked athletes.

---

## Interactions & Behavior
- **Expandable cards**: tap header toggles open/closed; chevron rotates 180°. Default a couple open per screen.
- **Tabs** (Profile, Coach Analytics, Workout Library): underline indicator in indigo; switch body content.
- **Filters/segmented controls** (timeframe, gender, group, board): pill selection; active = filled (ink or indigo), inactive = white + hairline border.
- **Effort picker / option rows**: tap to select; selected swatch gets accent border + tinted bg + accent text.
- **Toggles** (HR zones): 46×28 track, 22px knob, indigo when on.
- **Navigation**: row chevrons `›` indicate drill-in. Preserve the app's existing modal/stack navigation; only the presentation changes.
- No new animations required beyond the existing app's. Keep transitions subtle.

## State Management
**No new app state.** Each screen already has its data and handlers in the source `.js` file. Keep all `useState`, Firestore queries, and effect logic; replace only the returned JSX + `StyleSheet`. The HTML components use local `useState` purely to demo expand/toggle/tab interactions — map those to the existing state where equivalents exist, or add trivial local UI state for expand/collapse where the current screen doesn't have it yet.

## Design Tokens
See the **Color tokens**, **Typography**, and **Spacing/radius/shadow** sections above — those are the complete token set. Recommended: add a `SIGNAL` export block to `constants/design.js` and a `SIGNAL_TYPE_COLORS` to `constants/training.js`, then migrate screens token-by-token so light/dark and future theming stay centralized.

## Assets
- **Fonts**: Instrument Serif, Inter Tight, JetBrains Mono (Google Fonts) — add via `expo-font`.
- **Icons**: keep `@expo/vector-icons` (Ionicons) — the HTML uses Unicode glyphs (`‹ › ▾ ✓ ✕ +`) and a few emoji as stand-ins; swap to Ionicons in RN.
- **No raster assets** introduced. Avatar = initials on accent circle (unchanged from app).
- Emoji in Wellness Check-in (😴🪨⚡ etc.) are intentional and exist in the current app — keep them.

## Files
Design reference files in this bundle (open these to read exact markup, copy, colors, and measurements):
- `TeamBase Screens - Direction D.html` — the master canvas wiring all 21 screens (open in a browser to interact)
- `components/ios-frame.jsx` — device frame wrapper (reference only; not for RN)
- `components/design-canvas.jsx` — canvas harness (reference only)
- `components/athlete-dashboard.jsx`, `athlete-stats.jsx`, `athlete-actions.jsx`
- `components/coach-dashboard.jsx`, `coach-analytics.jsx`, `coach-tools.jsx`
- `components/calendar.jsx`, `team-feed.jsx`
- `components/racing.jsx`, `planning.jsx`, `auth-parent.jsx`

Suggested implementation order: **tokens first** (add `SIGNAL` to `design.js`), then Athlete Dashboard + Stats (most reused patterns), then Coach Dashboard + Analytics, then the rest. Each component file maps 1:1 to a source screen listed above.
