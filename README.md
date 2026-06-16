# LAST BUYER WINS — Dino Runner

A Chrome-Dino-style endless runner built for a Solana memecoin project.
Home page shows the live pot, contract address, leaderboard, and previous
payouts. Players register with a username/password (Firebase Auth,
username-only — the app appends a hidden email domain) plus a Solana wallet
used for payouts.

## Setup

```bash
npm install
npm run dev
```

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
  - `highScore` (number)
  - `gamesPlayed` (number)
  - `lastScore` (number)
  - `createdAt`, `lastPlayedAt` (timestamps)

- **usernames/{username}** - reservation doc, `{ uid }`

- **config/pot** - single doc you update from your backend/cron job
  - `totalSol` (number) - the FULL pot balance (100%). The UI automatically
    shows only 80% (`SITE_CONFIG.potSharePercent` in `src/lib/config.js`).
  - `updatedAt`

- **config/siteRecord** - auto-managed by the app via transaction
  - `score`, `username`, `uid`, `wallet`, `achievedAt`
  - Tracks the all-time high score. When a player beats it, this updates -
    your backend should watch this doc to trigger the payout.

- **payouts/{id}** - write these from your backend after sending a payout
  - `username`, `wallet`, `amountSol`, `txSignature`, `score`, `createdAt`

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
      allow write: if false;
    }

    match /payouts/{id} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

For production, `config/siteRecord`, `config/pot`, and `payouts` writes
should be handled by a trusted backend that monitors the chain, updates the
pot value, and executes/records the 80/20 split transfer. Never let the
client move funds.

## On-chain config

Edit `src/lib/config.js`:
- `contractAddress` - your token's mint address
- `potWallet` - wallet holding creator rewards (the pot)
- `feeWallet` - wallet that always receives the 20% cut
- `potSharePercent` - currently 80 (shown to users); the remaining 20% is
  always routed to `feeWallet` by your backend payout script - the frontend
  never moves funds itself.

## Game mechanics

Implemented per the Chrome Dino spec: 600x150 canvas, fixed dino at x=50,
parabolic jump (Space/Up), duck (Down), 2-frame run animation at ~12fps,
small/large/grouped cacti, birds after score 450 with low/medium/high
flight paths, day/night palette swap, persistent local high score, bounding
box collisions, and a pixel "GAME OVER" + restart screen
(Space/Enter/click to restart).

Score is time-based (not obstacle count), shown top-right in
`Press Start 2P`. On game over, the score and personal-best are saved to
Firestore, and if it's a new site-wide record, `config/siteRecord` is
updated - this is your trigger to run the payout.
