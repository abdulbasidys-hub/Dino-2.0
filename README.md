# DINO

A Chrome-Dino-style endless runner built for a Solana memecoin project.
Home page shows the live pot, contract address, round timer, leaderboard,
and previous payouts. Players register with a username/password (Firebase
Auth, username-only — the app appends a hidden email domain) plus a Solana
wallet used for payouts.

## Setup

```bash
npm install
npm run dev
```

## Round / payout rules

- The game runs in **15-minute rounds**.
- During a round, a player's score only counts toward that round's
  ranking if it **beats their own all-time personal best** at the moment
  they set it. Replaying without beating your prior best does nothing for
  the round.
- When the round timer hits zero, the **top 3 qualifying scores** split
  the visible pot: **1st = 50%, 2nd = 30%, 3rd = 20%**.
- If fewer than 3 players qualified, only those ranks are paid — e.g. 2
  qualifiers get 50% + 30%, and the unclaimed 20% simply stays in the pot
  and rolls into the next round. Previous winners are never re-paid.
- If **zero** players qualified during a round, nothing is paid and the
  entire pot rolls over to the next round.
- The pot shown on the site is always 80% of the real balance
  (`SITE_CONFIG.potSharePercent`). The remaining ~20% is skimmed to a
  second wallet silently by the backend, proportional to whatever was
  actually paid out that round — it is never shown anywhere on the
  frontend and is not skimmed on rollover rounds (since nothing was paid).

## Firebase setup required

This project uses the Firebase project already configured in
`src/lib/firebase.js`. You need to:

### 1. Enable Email/Password Auth
Firebase Console -> Authentication -> Sign-in method -> Email/Password -> Enable.

### 2. Create Firestore Database
Firebase Console -> Firestore Database -> Create database.

### 3. Collections / documents this app expects

- **users/{uid}** - created on registration
  - `username` (string)
  - `wallet` (string, Solana address)
  - `highScore` (number) — all-time personal best
  - `gamesPlayed` (number)
  - `lastScore` (number)
  - `createdAt`, `lastPlayedAt` (timestamps)

- **usernames/{username}** - reservation doc, `{ uid }`

- **config/pot** - written by the backend every poll
  - `totalSol` (number) - the FULL pot balance (100%). The UI shows only
    80% of this (`SITE_CONFIG.potSharePercent` in `src/lib/config.js`).
  - `updatedAt`

- **config/round** - the active round, managed entirely by the backend
  - `roundId` (string)
  - `startedAt`, `endsAt` (timestamps) — frontend reads `endsAt` to
    render the countdown

- **roundScores/{roundId}_{uid}** - written by the frontend whenever a
  player beats their own all-time personal best during the active round
  - `roundId`, `uid`, `username`, `wallet`, `score`, `priorBest`,
    `achievedAt`
  - The backend ranks these by `score` desc when the round ends

- **payouts/{id}** - written by the backend after each round-end payout
  - `username`, `wallet`, `score`, `rank` (1/2/3), `amountSol`,
    `txSignature`, `roundId`, `createdAt`

- **internal_fee_transfers/{id}** - backend-only log of the silent 20%
  skim. Never read by the frontend.

### 4. Suggested Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.wallet == resource.data.wallet;
    }

    match /usernames/{username} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }

    match /config/{doc} {
      allow read: if true;
      allow write: if false; // backend uses the Admin SDK, bypasses rules
    }

    match /roundScores/{id} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid;
      allow update: if request.auth != null
        && request.auth.uid == resource.data.uid
        && request.resource.data.score > resource.data.score;
      allow delete: if false;
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

## Backend (`server/`)

Deploy `server/` to Railway as its own service (separate from the
frontend). It:

1. Polls the pot wallet's real SOL balance and writes it to
   `config/pot.totalSol`.
2. Checks whether the current round (`config/round.endsAt`) has expired.
3. On expiry, ranks `roundScores` for that round, pays out top 3 per the
   50/30/20 split (only to ranks with a qualifying player), skims ~20%
   of whatever was actually paid to the fee wallet, records `payouts`,
   and immediately starts a new 15-minute round.

See `server/.env.example` for all required environment variables
(`POT_WALLET_PRIVATE_KEY`, `POT_WALLET_ADDRESS`, `FEE_WALLET_ADDRESS`,
`ROUND_DURATION_MS`, etc).

## On-chain config

Edit `src/lib/config.js`:
- `contractAddress` - your token's mint address
- `potSharePercent` - currently 80 (shown to users); the remaining 20%
  is always routed to the fee wallet by the backend - the frontend never
  moves funds itself.

## Game mechanics

600px-tall canvas (full page width), fixed dino at a constant x, parabolic
jump (Space/Up), duck (Down), pixel-art sprite matching the original
Chrome dino, small/large/grouped cacti, birds after score 450, whole-page
day/night fade starting at score 1500 and repeating every 500 points
after that, persistent local high score, bounding-box collisions, jump
and game-over sound effects (Web Audio, no files), and a pixel "GAME
OVER" + restart screen (Space/Enter/click to restart).
