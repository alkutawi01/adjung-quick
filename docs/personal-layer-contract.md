# Personal Layer Contract (document only — Fasa 1A implements this)

Status: documented so the shape isn't lost or reinvented differently later;
NOT implemented as a real schema/backend yet. Per ChatGPT (director), building
Supabase Auth, save persistence, login UI, history UI, RLS, or an
authentication flow now would be "mengubah vertical slice menjadi
mini-production backend" — that's Fasa 1A's job, not this slice's.

## Shape

```
User
└── identity            (opaque — actual auth mechanism decided in Fasa 1A)

SavedStory
├── user_id
├── story_id
├── saved_at
└── expires_at          (Save is not permanent archive — L-044)

HistoryEntry
├── user_id
├── story_id
├── released_at
└── expires_at           (retention window — exact duration still OPEN)
```

## Locked principles this shape must satisfy (from tonight's session)

- **L-043 Reader Login** — Quick is fully usable anonymously. Login exists
  ONLY to unlock Save / History / cross-device personal state — never a
  gate to reading.
- **L-044 Saved Story** — a reference (user_id + story_id), not a copy of
  the story content. Has expiry; "saved" does not mean "kept forever".
- **L-045 Release History** — when a reader releases a story from the
  Active Set, it is not deleted — it becomes a HistoryEntry, retrievable
  within a retention window. This is DISTINCT from Search and Filter
  (different features, never conflated per Izzat's correction).
- **Three time layers** (Izzat's framing, kept verbatim because it's a
  strong articulation of Quick's identity):
  ```
  NOW           -> Active Set
  WHAT I READ / REMOVED -> History
  WHAT I WANT TO KEEP    -> Saved
  ```
  All three have retention/expiry. Quick is a working-memory news
  interface, not an attempt to become an internet archive.
- **Engine/personal-layer separation** — "Engine menghasilkan berita. User
  layer menentukan apa yang pengguna simpan/lihat semula. Jangan campurkan
  kedua-duanya." (ChatGPT). The engine (`lab/`, `state/reducer.js`) must
  stay fully functional and testable with zero knowledge of whether a
  reader is logged in.

## What must NOT happen even after login exists (explicit non-goals)

Login unlocking Save/History does not mean Quick grows a social layer.
Explicitly out of scope: profile pages, dashboard, notifications, social
features, comments, following.

## Connection to state/reducer.js today

`reducer.js`'s `RELEASE_STORY` handler now appends a lightweight in-memory
`history` entry (see `state/model.js` — `history: []`) as a forward-compatible
placeholder: same field shape as `HistoryEntry` above minus persistence.
This is NOT the Fasa 1A implementation — it exists so the vertical slice
can demonstrate and test "released stories are recorded, not silently
discarded" without building a database.
