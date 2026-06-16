// ============================================================
// DINO GAME ENGINE  — faithful Chrome Dino pixel-art runner
// ============================================================

export const CANVAS_HEIGHT = 300;
export const GROUND_Y      = 250;
export const DINO_X        = 80;

const GRAVITY       = 0.0028;
const JUMP_VELOCITY = -0.95;

// ──────────────────────────────────────────────────────────────
// Sprite renderer
// Each sprite is rows of 0/1. S = px per cell.
// ──────────────────────────────────────────────────────────────
const S = 2; // 2 real-px per sprite pixel → ~40px wide dino

function drawSprite(ctx, sprite, ox, oy, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c]) ctx.fillRect(ox + c * S, oy + r * S, S, S);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// DINO SPRITES  (20 cols × 22 rows each, S=2 → 40×44 px)
// Based on the actual Chrome dino sprite sheet pixel layout.
// ──────────────────────────────────────────────────────────────

// Body + head (shared across all non-duck states)
//   col:  0         1         2
//         01234567890123456789
const DINO_BODY = [
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0], // 0  head top
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0], // 1
  [0,0,0,0,0,0,0,1,1,1,0,1,1,1,1,1,1,1,0,0], // 2  eye row (0 = eye hole)
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0], // 3
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0], // 4  head wide
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0], // 5
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0], // 6  head narrows (mouth)
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0], // 7
  [0,0,1,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0], // 8  arm stub + body
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0], // 9  torso wide
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0], // 10
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0], // 11
  [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0], // 12
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0], // 13 body narrows to hips
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0], // 14
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0], // 15
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0], // 16
];

// Run frame A — left leg forward, right back
const LEGS_A = [
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0], // 17
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0], // 18
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 19
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 20
  [0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 21 left foot
];

// Run frame B — right leg forward, left back
const LEGS_B = [
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0], // right foot
  [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
];

// Jump — same as body but legs static (mid-stride look)
const LEGS_JUMP = [
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// Dead — body same, X eye drawn in code
const LEGS_DEAD = [
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// ── Duck sprites (26 cols × 12 rows, S=2 → 52×24 px) ──────────
const DUCK_BODY = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0], // head top
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,1,1,1,1,1,0,0,0,0,0], // eye
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0], // arm
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const DUCK_LEGS_A = [
  [0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const DUCK_LEGS_B = [
  [0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// Derived dimensions
const BODY_ROWS  = DINO_BODY.length;   // 17
const LEG_ROWS   = LEGS_A.length;      // 5
const DINO_COLS  = DINO_BODY[0].length; // 20
const DUCK_COLS  = DUCK_BODY[0].length; // 26

export const DINO_W = DINO_COLS * S;
export const DINO_H = (BODY_ROWS + LEG_ROWS) * S;
const DUCK_W = DUCK_COLS * S;
const DUCK_H = (DUCK_BODY.length + DUCK_LEGS_A.length) * S;

// ──────────────────────────────────────────────────────────────
// DINO CLASS
// ──────────────────────────────────────────────────────────────
export class Dino {
  constructor() {
    this.x         = DINO_X;
    this.isJumping = false;
    this.isDucking = false;
    this.vy        = 0;
    this.frame     = 0;
    this.frameTimer= 0;
    this.dead      = false;
    this._stand();
  }

  _stand() {
    this.width  = DINO_W;
    this.height = DINO_H;
    this.y      = GROUND_Y - this.height;
  }
  _duck() {
    this.width  = DUCK_W;
    this.height = DUCK_H;
    this.y      = GROUND_Y - this.height;
  }

  get hitbox() {
    return {
      x:      this.x + S * 3,
      y:      this.y + S,
      width:  this.width  - S * 6,
      height: this.height - S,
    };
  }

  jump() {
    if (this.isJumping || this.dead) return false;
    this.isJumping = true;
    this.isDucking = false;
    this._stand();
    this.vy = JUMP_VELOCITY;
    return true; // caller can play sound
  }

  setDuck(on) {
    if (this.dead) return;
    if (on && !this.isJumping) { this.isDucking = true;  this._duck(); }
    if (!on)                   { this.isDucking = false; if (!this.isJumping) this._stand(); }
  }

  update(dt) {
    if (this.dead) return;
    if (this.isJumping) {
      this.vy += GRAVITY * dt;
      this.y  += this.vy * dt;
      if (this.y >= GROUND_Y - this.height) {
        this.y         = GROUND_Y - this.height;
        this.isJumping = false;
        this.vy        = 0;
        if (this.isDucking) this._duck(); else this._stand();
      }
    } else {
      this.y = GROUND_Y - this.height;
    }
    if (!this.isJumping) {
      this.frameTimer += dt;
      const spd = this.isDucking ? 50 : 75;
      if (this.frameTimer >= spd) { this.frameTimer = 0; this.frame ^= 1; }
    }
  }

  draw(ctx, fg, bg) {
    const x = this.x, y = this.y;

    if (this.isDucking && !this.isJumping) {
      drawSprite(ctx, DUCK_BODY, x, y, fg);
      // eye hole
      ctx.fillStyle = bg;
      ctx.fillRect(x + 9*S, y + 2*S, S, S);
      ctx.fillStyle = fg;
      drawSprite(ctx, this.frame === 0 ? DUCK_LEGS_A : DUCK_LEGS_B,
        x, y + DUCK_BODY.length * S, fg);
      return;
    }

    drawSprite(ctx, DINO_BODY, x, y, fg);

    // Eye — the sprite has a 0 at (row2, col10) which appears as bg colour
    // Just make sure the bg colour is there (it is because we cleared with bg)

    if (this.dead) {
      // X eye: draw two S×S crosses around the eye position
      ctx.fillStyle = fg;
      // Clear the normal eye hole first (fill it in)
      ctx.fillRect(x + 10*S, y + 2*S, S, S);
      // Draw X: top-left, top-right, center, bot-left, bot-right
      ctx.fillRect(x + 9*S,  y + 1*S, S, S);
      ctx.fillRect(x + 11*S, y + 1*S, S, S);
      ctx.fillRect(x + 10*S, y + 2*S, S, S);
      ctx.fillRect(x + 9*S,  y + 3*S, S, S);
      ctx.fillRect(x + 11*S, y + 3*S, S, S);
      drawSprite(ctx, LEGS_DEAD, x, y + BODY_ROWS * S, fg);
      return;
    }

    const legs = this.isJumping ? LEGS_JUMP
               : this.frame === 0 ? LEGS_A : LEGS_B;
    drawSprite(ctx, legs, x, y + BODY_ROWS * S, fg);
  }
}

// ──────────────────────────────────────────────────────────────
// CACTUS — faithful 3-section pixel-art look
// ──────────────────────────────────────────────────────────────
function drawCactus(ctx, cx, type, color) {
  ctx.fillStyle = color;
  if (type === 'small') {
    const h=70, tw=10, bx=cx+8;
    ctx.fillRect(bx,           GROUND_Y-h,  tw, h);   // trunk
    ctx.fillRect(cx,           GROUND_Y-44, 8,  4);   // left arm horiz
    ctx.fillRect(cx,           GROUND_Y-56, 8,  12);  // left arm vert
    ctx.fillRect(bx+tw,        GROUND_Y-36, 8,  4);   // right arm horiz
    ctx.fillRect(bx+tw,        GROUND_Y-50, 8,  14);  // right arm vert
  } else {
    const h=96, tw=14, bx=cx+10;
    ctx.fillRect(bx,           GROUND_Y-h,  tw, h);
    ctx.fillRect(cx,           GROUND_Y-58, 10, 5);
    ctx.fillRect(cx,           GROUND_Y-76, 10, 18);
    ctx.fillRect(bx+tw,        GROUND_Y-46, 10, 5);
    ctx.fillRect(bx+tw,        GROUND_Y-64, 10, 18);
  }
}

const CACTUS_W = { small: 26, large: 34 };
const CACTUS_H = { small: 70, large: 96 };

export class Cactus {
  constructor(x, type, count=1) {
    this.type   = type;
    this.count  = count;
    this.width  = CACTUS_W[type] * count + (count-1) * 4;
    this.height = CACTUS_H[type];
    this.x      = x;
    this.y      = GROUND_Y - this.height;
  }
  get hitbox() {
    return { x: this.x+4, y: this.y+4, width: this.width-8, height: this.height-4 };
  }
  update(dx) { this.x -= dx; }
  draw(ctx, color) {
    for (let i = 0; i < this.count; i++) {
      drawCactus(ctx, this.x + i * (CACTUS_W[this.type] + 4), this.type, color);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// BIRD (pterodactyl)
// ──────────────────────────────────────────────────────────────
const BIRD_W = 84, BIRD_H = 26;
export const BIRD_HEIGHTS = {
  low:    GROUND_Y - 28,
  medium: GROUND_Y - 80,
  high:   GROUND_Y - 140,
};

export class Bird {
  constructor(x, levelKey) {
    this.x          = x;
    this.levelKey   = levelKey;
    this.y          = BIRD_HEIGHTS[levelKey] - BIRD_H;
    this.width      = BIRD_W;
    this.height     = BIRD_H + 8;
    this.frame      = 0;
    this.frameTimer = 0;
  }
  get hitbox() {
    return { x: this.x+10, y: this.y+6, width: this.width-20, height: 16 };
  }
  update(dx, dt) {
    this.x -= dx;
    this.frameTimer += dt;
    if (this.frameTimer >= 120) { this.frameTimer = 0; this.frame ^= 1; }
  }
  draw(ctx, color) {
    ctx.fillStyle = color;
    const x = this.x, y = this.y;
    // body
    ctx.fillRect(x+24, y+10, 32, 10);
    // head + beak
    ctx.fillRect(x+50, y+4,  14, 10);
    ctx.fillRect(x+64, y+6,  12, 5);
    // tail
    ctx.fillRect(x+12, y+12, 14,  6);
    ctx.fillRect(x+4,  y+14,  10, 4);
    if (this.frame === 0) {
      // wings up
      ctx.fillRect(x+18, y,    44, 8);
      ctx.fillRect(x+26, y-5,  28, 5);
      ctx.fillRect(x+22, y+20,  8, 4);
    } else {
      // wings down
      ctx.fillRect(x+18, y+18, 44, 8);
      ctx.fillRect(x+26, y+24, 28, 5);
      ctx.fillRect(x+22, y+2,   8, 4);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// CLOUD
// ──────────────────────────────────────────────────────────────
export class Cloud {
  constructor(x, y) { this.x = x; this.y = y; this.width = 74; this.height = 18; }
  update(dx) { this.x -= dx * 0.35; }
  draw(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(this.x+12, this.y,    50, 8);
    ctx.fillRect(this.x+4,  this.y+6,  66, 8);
    ctx.fillRect(this.x,    this.y+10, 74, 6);
    ctx.fillRect(this.x+20, this.y-6,  28, 6);
  }
}

// ──────────────────────────────────────────────────────────────
// GROUND DECO
// ──────────────────────────────────────────────────────────────
export class GroundDeco {
  constructor(x, kind) { this.x = x; this.kind = kind; }
  update(dx) { this.x -= dx; }
  draw(ctx, color) {
    ctx.fillStyle = color;
    if (this.kind === 'dot')  ctx.fillRect(this.x, GROUND_Y+5, 3, 2);
    else if (this.kind==='dash') ctx.fillRect(this.x, GROUND_Y+6, 8, 2);
    else { ctx.fillRect(this.x, GROUND_Y+4, 5, 3); ctx.fillRect(this.x+7, GROUND_Y+5, 3, 2); }
  }
}

// ──────────────────────────────────────────────────────────────
// SPAWN HELPERS
// ──────────────────────────────────────────────────────────────
export function minObstacleGap(speed, canvasWidth) {
  return Math.max(canvasWidth * 0.3, speed * 48);
}
export function randomCactusGroup() {
  const r = Math.random();
  if (r < 0.35) return { type:'small', count:1 };
  if (r < 0.58) return { type:'large', count:1 };
  if (r < 0.76) return { type:'small', count:2 };
  if (r < 0.90) return { type:'large', count:2 };
  return { type:'small', count:3 };
}
export function randomBirdLevel() {
  return ['low','medium','high'][Math.floor(Math.random()*3)];
}

// ──────────────────────────────────────────────────────────────
// THEME  — smooth fade, whole-page via CSS variable
// First switch at 1500, then every 500 after that.
// ──────────────────────────────────────────────────────────────
export const FIRST_NIGHT_SCORE = 1500;
export const CYCLE_SCORE       = 500;
export const FADE_SCORE        = 80; // score-points to complete the crossfade

function lerpChannel(a, b, t) { return Math.round(a + (b - a) * t); }
function lerpColor(ca, cb, t) {
  return `rgb(${lerpChannel(ca[0],cb[0],t)},${lerpChannel(ca[1],cb[1],t)},${lerpChannel(ca[2],cb[2],t)})`;
}

const DAY_BG  = [255,255,255];
const DAY_FG  = [83, 83, 83];
const NIGHT_BG = [26, 26, 26];
const NIGHT_FG = [235,235,235];

export function getTheme(score) {
  // Before first switch, always day
  if (score < FIRST_NIGHT_SCORE) {
    return { isNight: false, bg: `rgb(${DAY_BG})`, fg: `rgb(${DAY_FG})`, t: 0 };
  }
  const elapsed = score - FIRST_NIGHT_SCORE;
  const cycle   = Math.floor(elapsed / CYCLE_SCORE);
  const isNight = cycle % 2 === 0; // first cycle = night
  const within  = elapsed - cycle * CYCLE_SCORE;
  const t       = Math.min(1, within / FADE_SCORE);

  if (isNight) {
    return { isNight: true,  bg: lerpColor(DAY_BG,  NIGHT_BG, t), fg: lerpColor(DAY_FG,  NIGHT_FG, t), t };
  } else {
    return { isNight: false, bg: lerpColor(NIGHT_BG, DAY_BG,  t), fg: lerpColor(NIGHT_FG, DAY_FG,  t), t };
  }
}

// ──────────────────────────────────────────────────────────────
// COLLISION
// ──────────────────────────────────────────────────────────────
export function rectsOverlap(a, b) {
  return a.x < b.x+b.width && a.x+a.width > b.x &&
         a.y < b.y+b.height && a.y+a.height > b.y;
}

export const BIRD_SCORE_THRESHOLD = 450;