# We're All Going to Hell — Project Charter

## Purpose

We're All Going to Hell (WAGTH) is a mobile-first multiplayer party game built around fast, funny, player-written responses to irreverent prompt cards. The product should feel polished, theatrical, mischievous, and effortless to play with friends in the same room.

## Version 1 Goal

Deliver a dependable browser-based game for 3–8 players with private room codes, rotating Judges, typed responses, concealed submissions, staged reveals, winner selection, SIN scoring, reconnect support, and a complete Final Judgment experience.

## Locked Product Principles

- Mobile-first and readable at arm's length.
- The database is authoritative for game state.
- Players should never need to understand the technology underneath the game.
- A current round always resolves cleanly unless the host intentionally leaves.
- Judge continuity is protected; the Judge never changes mid-round.
- Reconnects recover state from an authoritative snapshot.
- Humor and presentation matter as much as correctness.
- Version 1 uses Deck 001, containing the original 160 Black Cards.

## Version 1 Scope

Version 1 includes:

- Anonymous player authentication.
- Remembered display names.
- Four-character room codes in `LLNN` format.
- Three to eight players per room.
- Host-configurable game length: Quick, Standard, Extended, or Endless.
- Rotating Judge role.
- Hidden player responses up to 200 characters, including multiline text and emoji.
- Response reveal controlled by the Judge.
- Exactly one round winner, with optional runner-up recognition.
- SIN scoring and independent Infernal Meter values.
- Disconnect leases, pause/resume behavior, and In Hell status.
- Final Judgment, final rankings, and comedy awards.
- Community Black Card submission intake for later moderation.

Version 1 does not include:

- Public matchmaking.
- Voice or video chat.
- Multiple active decks.
- Automated community-card publishing.
- Native iOS or Android distribution.
- Purchases, subscriptions, or advertising.

## Technical Direction

- Flutter Web client.
- Supabase Auth, PostgreSQL, Realtime, and Edge Functions.
- PostgreSQL is the source of truth.
- Gameplay mutations are performed through versioned RPC functions.
- Clients synchronize through role-aware snapshots.
- Realtime Broadcast is a notification mechanism, not durable state.
- Database changes are made only through committed migration files.
- Private orchestration data remains outside the public schema.

## Responsibilities

### JT — Product Owner

- Defines the creative vision, gameplay feel, and brand direction.
- Approves rules, assets, major UX decisions, and release readiness.
- Supplies or approves production artwork and copy.

### Technical Lead

- Maintains architecture and implementation plans.
- Protects consistency with locked gameplay rules.
- Reviews schema, security, state transitions, tests, and releases.
- Coordinates implementation work and identifies genuine product decisions.

### Implementation Engineer / Codex

- Implements approved plans.
- Writes migrations, application code, and automated tests.
- Documents meaningful technical changes.
- Avoids silently changing locked rules or architecture.

## Development Rules

1. Archive before destructive changes.
2. Every database change is reproducible from migrations.
3. No direct client writes to authoritative gameplay tables.
4. Security and reconnect behavior are designed with each feature, not added later.
5. Features are implemented in small, testable milestones.
6. Production assets are approved before integration.
7. The Free plan is the default operating constraint until usage proves otherwise.

## Definition of Success

Version 1 is successful when a group of three to eight players can open the game on their phones, join a room, complete an entire game without moderator intervention, survive ordinary disconnects, understand whose turn it is, laugh at the presentation, and reach an accurate Final Judgment.

## Current Milestone

Milestone 0 establishes the clean repository, documentation, Flutter shell, and Supabase foundation. Gameplay tables and game logic begin only after this foundation is reviewed.

**Decision needed: None. Proceeding with the recommended design.**
