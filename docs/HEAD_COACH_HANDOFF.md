# Changing a school's head coach

There are two ways to make someone else the head coach of a school.

| Situation | What to use |
|---|---|
| The head coach is **leaving on good terms** and can still sign in | **In-app handoff**: they do it themselves (2 minutes) |
| The head coach **quit, was fired, or can't be reached** | **Manual steps** below, done by you in the Firebase console |

Either way, the new head coach must already have an XCTracker account.

---

## Option A: in-app handoff (preferred)

1. The new head coach signs up as an **Assistant Coach** and requests to join
   with the team's join code.
2. The current head coach approves them: **Profile → Pending coach requests →
   Approve**.
3. The current head coach opens **Profile → Hand off head coach → Choose new
   head coach**, picks the person, and chooses whether they themselves:
   - **stay on the team as an assistant coach**, or
   - **leave the team**.
4. They tap **Hand off** and confirm.

The swap happens on the server (`transferHeadCoach` Cloud Function) in one
step. The new head coach gets a push notification, and both apps switch to
their new roles right away. Only the new head coach can undo it, by handing
the team back.

---

## Option B: manual handoff in the Firebase console

Use this only when the current head coach can't do Option A. You'll edit three
documents by hand. Go slowly and double-check IDs, because there's no undo.

**Before you start:** confirm the change with the school (athletic director or
principal). The new head coach can read every athlete's private weekly
check-ins, including past ones.

### 1. Get the new head coach onto the team

Have them sign up as an **Assistant Coach** and request to join with the team
code.

- If an approved assistant coach can still sign in, they don't need approval
  to be made head coach. You'll set it below.
- If nobody can approve them, that's fine too. Step 3 approves them directly.

### 2. Find the documents

Open the [Firebase console](https://console.firebase.google.com/project/xctracker-a2532/firestore)
→ **Firestore Database → Data**.

- **The school:** `schools` collection. Find the school by its `name`. Note its
  document ID (looks like `school_AbC123…`). That's the **school ID**.
- **The old head coach:** `users` collection. Filter `email == <their email>`.
  Note the document ID (the **old coach ID**).
- **The new head coach:** `users` collection. Filter `email == <their email>`.
  Note the document ID (the **new coach ID**).

### 3. Edit the new head coach's user document

| Field | Set to |
|---|---|
| `role` | `admin_coach` |
| `coachRole` | `admin` |
| `status` | `approved` |
| `schoolId` | the school ID |
| `trainingAccess` | delete the field (head coaches don't need it) |

### 4. Edit the school document

| Field | Set to |
|---|---|
| `adminCoachId` | the new coach ID |
| `coachIds` | make sure the new coach ID is in the array; **remove** the old coach ID |
| `pendingCoachIds` | remove the new coach ID if it's there |

### 5. Remove the old head coach from the team

On the **old head coach's** user document:

| Field | Set to |
|---|---|
| `role` | `assistant_coach` |
| `schoolId` | `null` |
| `status` | `null` |
| `coachRole` | delete the field |

They keep their login, but they're no longer on the team. If they sign in,
they land on the "join a team" screen.

**If they were fired or there's any safety concern**, also go to
**Authentication → Users**, find their email, and choose **Disable account**.
That signs them out everywhere and blocks sign-in. Disabling (not deleting)
keeps their data and history intact.

### 6. Optional: change the join code

The old head coach knows the team's join code. If that's a concern, edit the
school document's `joinCode` to a new 6-character code (capital letters and
digits, e.g. `K7M2QX`) and share the new code with the team. Existing members
aren't affected. The code only matters for new people joining.

### 7. Check it worked

- The new head coach closes and reopens the app. They should land on the coach
  dashboard and see **Pending coach requests** and **Hand off head coach** in
  their profile.
- **Profile → Assistant coaches** should no longer list the old head coach.
- Manage Seasons should let the new head coach edit seasons (it checks
  `adminCoachId`).

---

## Notes

- The school document ID (`school_<old coach's original ID>`) stays the same
  forever. That's fine: it's only an identifier, and nothing reads ownership
  from it.
- Head-coach powers come from the coach's **user document** (`role`,
  `schoolId`, `status`) plus the school's `adminCoachId`. Both must point at
  the new coach, or the app and the security rules will disagree.
- Clients can never change `role` themselves. Firestore rules forbid it, which
  is why handoffs go through the Cloud Function or the console.
