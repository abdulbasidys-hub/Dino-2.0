# DINO

A Chrome-Dino-style endless runner built for a Solana memecoin project.
Home page shows the live pot, contract address, round timer, leaderboard,
and previous payouts. Players register with a username/password (Firebase
Auth, username-only — the app appends a hidden email domain) plus a Solana
wallet used for payouts, and must currently hold the token to register or
to compete.

## Setup

```bash
npm install
npm run dev          # frontend
npm run server        # backend (needs server/.env vars — see below)
```

## Token-holding gate

A wallet must hold at least `SITE_CONFIG.minHoldingSol` (default 0.2) SOL
worth of the token to register, and that holding is re-verified LIVE
every single time a game ends (`src/lib/solanaCheck.js`) before the score
is allowed to count toward any round ranking. Selling after registering
means future scores stop counting — holding has to be ongoing, not just
a one-time check.

This is enforced again, independently, server-side
(`server/server.js`'s `checkHolding`) immediately before any SOL is
actually paid out. **The frontend check is for UX only and can be
bypassed** by a sufficiently determined user editing client-side code —
the backend check is the real security boundary, since that's the one
protecting actual fund movement.

If a ranked candidate fails the holding check at payout time, they're
skipped entirely (as if their score was never posted) and the next
qualifying candidate is promoted to fill that rank.

**Price dependency**: the holding value is computed via a live
DexScreener price lookup. If your token is brand new or too
illiquid/unindexed to have a SOL-quoted pair yet, this will fail closed
(block everyone) until DexScreener picks it up. Worth knowing before
launch day.

## Round / payout rules

- The game runs in **15-minute rounds**. The leaderboard resets every
  round — everyone's competitive score starts at 0 each time. (Each
  player's all-time personal best is still tracked and shown to them
  individually, but it has zero effect on ranking.)
- When a round ends:
  1. The backend reads the pot wallet's real balance (**P**).
  2. The team takes **20% of P**, always, before anything else — this
     is never part of any other calculation.
  3. The remaining **80% of P (D)** is the budget for this round's
     winners.
  4. If **D ≥ 1.8 SOL** (the sum of the fixed amounts below): pay
     **1st = 1 SOL, 2nd = 0.5 SOL, 3rd = 0.3 SOL** to whichever ranks
     have a qualifying (holding-verified) winner. Unfilled ranks just
     aren't paid — that money stays in the wallet and rolls into next
     round automatically.
  5. If **D < 1.8 SOL**: fall back to splitting D itself as
     **50% / 30% / 20%** among qualifying winners, same rollover rule.
  6. Whatever's left after that may fund a Hall of Fame payout (below)
     if there's enough and it's unlocked. Anything still unspent simply
     remains in the pot wallet — there's no artificial reset, the real
     on-chain balance is always the source of truth.
- All amounts above are configurable via `server/.env` —
  `FIXED_FIRST_SOL`, `FIXED_SECOND_SOL`, `FIXED_THIRD_SOL`.

## Hall of Fame / Winners Board

- Only the outright **#1 winner** of a regular round gets inducted —
  2nd and 3rd place still get paid, but stay in the general pool,
  free to compete (and possibly win #1) in future rounds.
- Once inducted, a player's scores stop counting on the general
  leaderboard. They compete in a separate pool instead
  (`winnersBoardScores`), on the same 15-minute timer.
- The board is payout-locked until `WINNERS_BOARD_UNLOCK_COUNT`
  (default 5) players have ever been inducted — since induction is
  exactly one person per round, this also means at least that many
  rounds must complete first. Hall of Fame members can still play and
  rack up scores before unlock, they just won't be paid yet.
- Once unlocked, each round pays **exactly one** Hall of Fame member —
  whoever scored highest in that pool this round —
  `WINNERS_BOARD_REWARD_SOL` (default 0.5), drawn from whatever's left
  of D after the regular round payout. If there isn't enough left,
  that round's Hall of Fame payout is simply skipped (no debt carried).

## Firebase setup required

### 1. Enable Email/Password Auth
Firebase Console -> Authentication -> Sign-in method -> Email/Password -> Enable.

### 2. Create Firestore Database
Firebase Console -> Firestore Database -> Create database.

### 3. Required composite indexes

Firestore will throw an error with a "create index" link the first
time these run if they don't exist yet — create them proactively to
avoid a broken leaderboard on first load:

- `roundScores`: composite index on `roundId` (ascending) +
  `score` (descending)
- `winnersBoardScores`: same — `roundId` (ascending) +
  `score` (descending)

### 4. Collections / documents this app expects

- **users/{uid}**
  - `username`, `wallet`, `highScore` (personal stat only, doesn't
    affect ranking), `gamesPlayed`, `lastScore`, `createdAt`,
    `lastPlayedAt`
  - `isWinner` (bool) — set to `true` by the backend when this player
    wins round #1 for the first time. From then on their scores route
    to `winnersBoardScores` instead of `roundScores`.

- **usernames/{username}** — reservation doc, `{ uid }`

- **roundScores/{roundId}_{uid}** — general pool, written by the
  frontend after a holding-verified, non-Hall-of-Fame player's
  game-over. Reset implicitly every round since it's keyed by roundId.
  - `roundId`, `uid`, `username`, `wallet`, `score`, `achievedAt`

- **winnersBoardScores/{roundId}_{uid}** — same shape, but only for
  players with `isWinner == true`.

- **winnersBoard/{uid}** — Hall of Fame roster, one doc per inductee,
  created by the backend the moment someone wins round #1.
  - `uid`, `username`, `wallet`, `inductedAt`, `inductedScore`,
    `inductedRoundId`

- **config/pot** — written by the backend every poll
  - `totalSol` (the FULL real balance), `updatedAt`

- **config/round** — the active round, managed by the backend
  - `roundId`, `startedAt`, `endsAt`

- **payouts/{id}** — written by the backend after each payout
  - `username`, `wallet`, `score`, `rank`, `amountSol`, `txSignature`,
    `roundId`, `category` (`"regular"` or `"winnersBoard"`),
    `createdAt`

- **internal_fee_transfers/{id}** — backend-only log of the team's
  20% cut. Never read by the frontend.

### 5. Suggested Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.wallet == resource.data.wallet
        && request.resource.data.isWinner == resource.data.isWinner; // clients can't self-promote
    }

    match /usernames/{username} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }

    match /roundScores/{id} {
      allow read: if true;
      allow create, update: if request.auth != null
        && request.resource.data.uid == request.auth.uid;
      allow delete: if false;
    }

    match /winnersBoardScores/{id} {
      allow read: if true;
      allow create, update: if request.auth != null
        && request.resource.data.uid == request.auth.uid;
      allow delete: if false;
    }

    match /winnersBoard/{uid} {
      allow read: if true;
      allow write: if false; // backend (Admin SDK) only
    }

    match /config/{doc} {
      allow read: if true;
      allow write: if false;
    }

    match /payouts/{id} {
      allow read: if true;
      allow write: if false;
    }

    match /internal_fee_transfers/{id} {
      allow read, write: if false;
    }
  }
}
```

Note: Firestore rules can't verify on-chain token holding (no external
calls from rules), so a modified client could still WRITE a fake score
to `roundScores` without actually holding the token. This won't affect
real money — the backend re-verifies holding before paying — but it
means the live leaderboard display itself isn't 100% tamper-proof. If
that becomes a problem, the fix is routing score writes through an
authenticated backend endpoint instead of direct client writes, which
is a bigger architecture change beyond what's built here.

## Backend (`server/`)

Deploy as a Node service (NOT a static site — make sure your
`package.json`'s detected scripts don't mislead Railway's auto-detect
into treating this as a Vite build; set the Start Command explicitly
to `npm run server` if needed). It:

1. Polls the pot wallet's real SOL balance, writes it to
   `config/pot.totalSol`.
2. Checks whether the current round has expired.
3. On expiry: takes the team's 20% cut, ranks and holding-verifies
   `roundScores`, pays the regular round winners (fixed or fallback),
   inducts the #1 winner into the Hall of Fame, checks if the Hall of
   Fame is unlocked and pays its single winner if funds remain, then
   starts a new round.

See `server/.env.example` for all required environment variables.

## On-chain config

Edit `src/lib/config.js`:
- `contractAddress` — your token's mint address
- `minHoldingSol`, `fixedFirstSol`/`fixedSecondSol`/`fixedThirdSol`,
  `winnersBoardRewardSol`, `winnersBoardUnlockCount` — these are
  display-copy mirrors of the backend's `.env` values; keep them in
  sync manually, the backend is the actual source of truth for money
- `publicRpcUrl` — a public-safe Solana RPC for the frontend's
  read-only holding check. The public default is rate-limited.

## Game mechanics

Full-viewport immersive canvas on play, fixed dino at a constant x,
instant-launch jump with hold-to-extend height (gravity weakens while
held, full gravity on release), duck, small/large/grouped cacti spaced
in clusters with breathing gaps between them, birds, green/red score
perks, gravity-inversion/flight/slow-time portals, whole-page day/night
fade, persistent local high score, looping synthesized background music
with a mute toggle, jump/collision/perk sound effects (all Web Audio,
no files), and a mobile landscape-rotation prompt.
