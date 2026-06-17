// ============================================================
// DINO ADVANCED — FULL GAME ENGINE
// ============================================================
// Reference coordinate system: all game logic uses REF_HEIGHT.
// The canvas scales to fill the viewport during immersive play.
// ============================================================

export const REF_HEIGHT   = 300;
export const REF_GROUND_Y = 250;
export const DINO_X       = 80;

// Dynamic game width (in reference coords), set each frame
let _gameW = 900;
export const setGameWidth = (w) => { _gameW = w; };
export const getGameWidth = () => _gameW;

// Camera: picks a scale based on the canvas's PIXEL WIDTH so the
// visible field of view stays wide (roughly constant ref-units of
// width visible regardless of device), instead of being driven by
// canvas height — which is what caused the old "zoomed in" feel on
// tall screens. Returns both the scale and how many ref-units of
// width are now visible (always equal to the clamped target).
export function computeCamera(canvasPxWidth) {
  const targetWidth = Math.max(950, Math.min(2000, canvasPxWidth * 1.4));
  const scale = canvasPxWidth / targetWidth;
  return { scale, gameW: targetWidth };
}

// ================================================================
// PHYSICS
// ================================================================
const GRAVITY           = 0.0034;   // normal gravity — applies once not held, or after release
const HOLD_GRAVITY       = GRAVITY * 0.32; // weakened gravity while actively held & ascending
const LAUNCH_VEL         = -0.48;   // always-instant launch velocity, every press
export const JUMP_HOLD_WINDOW = 1000; // ms cap on how long the hold-assist can extend a jump
const FLIGHT_GRAVITY    = 0.0012;
const FLIGHT_FLAP_VEL   = -0.42;

// ================================================================
// SPRITE RENDERER
// ================================================================
const S = 2; // scale factor per sprite pixel

function drawSprite(ctx, sprite, ox, oy, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c]) ctx.fillRect(ox + c * S, oy + r * S, S, S);
    }
  }
}

// ================================================================
// DINO SPRITES  (20 cols × 22 rows, S=2 → 40×44px)
// ================================================================
const DINO_BODY = [
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,1,1,1,0,1,1,1,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,1,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
];
const LEGS_A = [
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const LEGS_B = [
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
];
const LEGS_JUMP = [
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const LEGS_DEAD = [
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const DUCK_BODY = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
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

const BODY_ROWS = DINO_BODY.length;
const LEG_ROWS  = LEGS_A.length;
const DINO_COLS = DINO_BODY[0].length;
const DUCK_COLS = DUCK_BODY[0].length;
export const DINO_W = DINO_COLS * S;
export const DINO_H = (BODY_ROWS + LEG_ROWS) * S;
const DUCK_W = DUCK_COLS * S;
const DUCK_H = (DUCK_BODY.length + DUCK_LEGS_A.length) * S;

// ================================================================
// DINO CLASS
// ================================================================
export class Dino {
  constructor() {
    this.x = DINO_X;
    this.isJumping = false;
    this.isDucking = false;
    this.vy = 0;
    this.frame = 0;
    this.frameTimer = 0;
    this.dead = false;
    // Jump: always launches instantly on press. Holding afterward
    // keeps gravity weakened so the dino hangs/rises longer.
    this.holding = false;
    this.holdTime = 0;
    // Flight mode
    this.isFlying = false;
    // Gravity inversion
    this.inverted = false;
    this._stand();
  }

  _stand() {
    this.width = DINO_W;
    this.height = DINO_H;
    this.y = REF_GROUND_Y - this.height;
  }
  _duck() {
    this.width = DUCK_W;
    this.height = DUCK_H;
    this.y = REF_GROUND_Y - this.height;
  }

  get hitbox() {
    return {
      x: this.x + S * 2, y: this.y + S,
      width: this.width - S * 4, height: this.height - S,
    };
  }

  // Called on key/touch DOWN — always launches immediately, no delay.
  beginJump() {
    if (this.dead) return null;
    if (this.isFlying) {
      this.vy = FLIGHT_FLAP_VEL;
      return 'flap';
    }
    if (this.isJumping) return null; // already airborne, ignore re-press
    this.isJumping = true;
    this.isDucking = false;
    this._stand();
    this.vy = LAUNCH_VEL;
    this.holding = true;
    this.holdTime = 0;
    return 'jump';
  }

  // Called on key/touch UP — stops extending the jump; normal gravity
  // takes over from whatever height/velocity it's currently at.
  endHold() {
    this.holding = false;
  }

  setDuck(on) {
    if (this.dead || this.isFlying) return;
    if (on && !this.isJumping) { this.isDucking = true; this._duck(); }
    if (!on) { this.isDucking = false; if (!this.isJumping) this._stand(); }
  }

  // Flight mode
  enterFlight() {
    this.isFlying = true;
    this.isJumping = false;
    this.isDucking = false;
    this._stand();
    this.y = REF_GROUND_Y - 120; // start in mid-air
    this.vy = 0;
  }
  exitFlight() {
    this.isFlying = false;
    this.vy = 0;
    this._stand();
    this.y = REF_GROUND_Y - this.height;
  }

  update(dt) {
    if (this.dead) return null;

    // Flight mode physics
    if (this.isFlying) {
      this.vy += FLIGHT_GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y < 10) { this.y = 10; this.vy = 0; }
      if (this.y > REF_GROUND_Y - this.height) {
        this.y = REF_GROUND_Y - this.height; this.vy = 0;
      }
      this.frameTimer += dt;
      if (this.frameTimer >= 80) { this.frameTimer = 0; this.frame ^= 1; }
      return null;
    }

    // Normal/inverted jump physics. Launch already happened instantly in
    // beginJump(). While still held (and within the hold-assist window),
    // gravity is weakened so the dino keeps rising/hangs longer — release
    // (or hitting the window cap) restores full gravity immediately.
    if (this.isJumping) {
      if (this.holding) this.holdTime += dt;
      const assisted = this.holding && this.holdTime < JUMP_HOLD_WINDOW;
      const g = assisted ? HOLD_GRAVITY : GRAVITY;
      this.vy += g * dt;
      this.y += this.vy * dt;
      if (this.y >= REF_GROUND_Y - this.height) {
        this.y = REF_GROUND_Y - this.height;
        this.isJumping = false;
        this.vy = 0;
        this.holding = false;
        if (this.isDucking) this._duck(); else this._stand();
      }
    } else {
      this.y = REF_GROUND_Y - this.height;
    }

    if (!this.isJumping) {
      const spd = this.isDucking ? 50 : 75;
      this.frameTimer += dt;
      if (this.frameTimer >= spd) { this.frameTimer = 0; this.frame ^= 1; }
    }

    return null;
  }

  draw(ctx, fg, bg) {
    const x = this.x, y = this.y;

    if (this.isDucking && !this.isJumping && !this.isFlying) {
      drawSprite(ctx, DUCK_BODY, x, y, fg);
      ctx.fillStyle = bg;
      ctx.fillRect(x + 9*S, y + 2*S, S, S);
      drawSprite(ctx, this.frame === 0 ? DUCK_LEGS_A : DUCK_LEGS_B,
        x, y + DUCK_BODY.length * S, fg);
      return;
    }

    drawSprite(ctx, DINO_BODY, x, y, fg);

    if (this.dead) {
      ctx.fillStyle = fg;
      ctx.fillRect(x + 10*S, y + 2*S, S, S);
      ctx.fillRect(x + 9*S,  y + 1*S, S, S);
      ctx.fillRect(x + 11*S, y + 1*S, S, S);
      ctx.fillRect(x + 10*S, y + 2*S, S, S);
      ctx.fillRect(x + 9*S,  y + 3*S, S, S);
      ctx.fillRect(x + 11*S, y + 3*S, S, S);
      drawSprite(ctx, LEGS_DEAD, x, y + BODY_ROWS * S, fg);
      return;
    }

    // Flight mode: flapping animation
    if (this.isFlying) {
      const legs = this.frame === 0 ? LEGS_A : LEGS_B;
      drawSprite(ctx, legs, x, y + BODY_ROWS * S, fg);
      // Small "wing" indicator
      ctx.fillStyle = fg;
      if (this.frame === 0) {
        ctx.fillRect(x - 4, y + 6*S, 6, 3);
        ctx.fillRect(x - 6, y + 5*S, 4, 3);
      } else {
        ctx.fillRect(x - 4, y + 8*S, 6, 3);
        ctx.fillRect(x - 6, y + 9*S, 4, 3);
      }
      return;
    }

    const legs = this.isJumping ? LEGS_JUMP : this.frame === 0 ? LEGS_A : LEGS_B;
    drawSprite(ctx, legs, x, y + BODY_ROWS * S, fg);
  }
}

// ================================================================
// CACTUS
// ================================================================
const CACTUS_W = { small: 20, large: 27 };
const CACTUS_H = { small: 38, large: 52 };

function drawCactusUnit(ctx, cx, type, color) {
  ctx.fillStyle = color;
  const h = CACTUS_H[type];
  const tw = type === 'small' ? 8 : 11;
  const armW = type === 'small' ? 6 : 8;
  const bx = cx + armW;
  // trunk
  ctx.fillRect(bx, REF_GROUND_Y - h, tw, h);
  // lower-left arm
  ctx.fillRect(cx, REF_GROUND_Y - h * 0.58, armW + 3, 4);
  ctx.fillRect(cx, REF_GROUND_Y - h * 0.80, armW, h * 0.26);
  // upper-right arm
  ctx.fillRect(bx + tw - 3, REF_GROUND_Y - h * 0.42, armW + 3, 4);
  ctx.fillRect(bx + tw + armW - 3, REF_GROUND_Y - h * 0.62, armW, h * 0.26);
}

export class Cactus {
  constructor(x, type, count = 1) {
    this.type = type;
    this.count = count;
    this.kind = 'cactus';
    this.width = CACTUS_W[type] * count + (count - 1) * 4;
    this.height = CACTUS_H[type];
    this.x = x;
    this.y = REF_GROUND_Y - this.height;
  }
  get hitbox() {
    return { x: this.x+4, y: this.y+4, width: this.width-8, height: this.height-4 };
  }
  update(dx) { this.x -= dx; }
  draw(ctx, color) {
    for (let i = 0; i < this.count; i++)
      drawCactusUnit(ctx, this.x + i * (CACTUS_W[this.type] + 4), this.type, color);
  }
}

// ================================================================
// BIRD
// ================================================================
const BIRD_W = 84, BIRD_H = 26;
export const BIRD_HEIGHTS = {
  low:    REF_GROUND_Y - 28,
  medium: REF_GROUND_Y - 80,
  high:   REF_GROUND_Y - 140,
};

export class Bird {
  constructor(x, levelKey) {
    this.x = x;
    this.kind = 'bird';
    this.levelKey = levelKey;
    this.y = BIRD_HEIGHTS[levelKey] - BIRD_H;
    this.width = BIRD_W;
    this.height = BIRD_H + 8;
    this.frame = 0;
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
    ctx.fillRect(x+24, y+10, 32, 10);
    ctx.fillRect(x+50, y+4, 14, 10);
    ctx.fillRect(x+64, y+6, 12, 5);
    ctx.fillRect(x+12, y+12, 14, 6);
    ctx.fillRect(x+4, y+14, 10, 4);
    if (this.frame === 0) {
      ctx.fillRect(x+18, y, 44, 8);
      ctx.fillRect(x+26, y-5, 28, 5);
      ctx.fillRect(x+22, y+20, 8, 4);
    } else {
      ctx.fillRect(x+18, y+18, 44, 8);
      ctx.fillRect(x+26, y+24, 28, 5);
      ctx.fillRect(x+22, y+2, 8, 4);
    }
  }
}

// ================================================================
// GAP (hole in ground — must jump over or die)
// ================================================================
export class Gap {
  constructor(x, width) {
    this.x = x;
    this.kind = 'gap';
    this.width = width || 80 + Math.random() * 50;
    this.height = 60;
    this.y = REF_GROUND_Y;
  }
  get hitbox() {
    // Active zone: if dino is on the ground within this x range
    return { x: this.x + 8, y: REF_GROUND_Y - 5, width: this.width - 16, height: 40 };
  }
  update(dx) { this.x -= dx; }
  draw(ctx, fg) {
    // Draw as a dark pit in the ground
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(this.x, REF_GROUND_Y + 4, this.width, 30);
    // Jagged edges
    ctx.fillStyle = fg;
    ctx.fillRect(this.x - 2, REF_GROUND_Y + 2, 4, 10);
    ctx.fillRect(this.x + this.width - 2, REF_GROUND_Y + 2, 4, 10);
  }
  // Gap kills dino only if dino is NOT jumping (on the ground)
  checkDinoFall(dino) {
    if (dino.isJumping || dino.isFlying || dino.dead) return false;
    const dx = dino.x + dino.width / 2; // dino center x
    return dx > this.x + 8 && dx < this.x + this.width - 8;
  }
}

// ================================================================
// PERK (green = helpful, red = risky)
// ================================================================
export class Perk {
  constructor(x, perkType) {
    this.x = x;
    this.kind = 'perk';
    this.perkType = perkType; // 'green' | 'red'
    this.width = 20;
    this.height = 20;
    this.y = REF_GROUND_Y - 60 - Math.random() * 40;
    this.collected = false;
    this.bobTimer = 0;
  }
  get hitbox() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  update(dx, dt) {
    this.x -= dx;
    this.bobTimer += dt;
  }
  draw(ctx) {
    if (this.collected) return;
    const bob = Math.sin(this.bobTimer * 0.005) * 4;
    const cx = this.x + 10, cy = this.y + 10 + bob;
    const color = this.perkType === 'green' ? '#22c55e' : '#ef4444';
    ctx.fillStyle = color;
    // Diamond shape
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 10, cy);
    ctx.closePath();
    ctx.fill();
    // Inner highlight
    ctx.fillStyle = this.perkType === 'green' ? '#4ade80' : '#f87171';
    ctx.fillRect(cx - 3, cy - 3, 6, 6);
  }
}

// Perk effect definitions
export const PERK_EFFECTS = {
  green: { multiplier: 1.5, speedMod: 0.85, duration: 8000, label: 'BOOST' },
  red:   { multiplier: 2.5, speedMod: 1.35, duration: 6000, label: 'CHAOS' },
};

// ================================================================
// PORTAL (gravity / flight / slow-time)
// ================================================================
export class Portal {
  constructor(x, portalType) {
    this.x = x;
    this.kind = 'portal';
    this.portalType = portalType; // 'gravity' | 'flight' | 'slowtime'
    this.width = 40;
    this.height = 60;
    this.y = REF_GROUND_Y - this.height - 10;
    this.activated = false;
    this.animTimer = 0;
  }
  get hitbox() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  update(dx, dt) {
    this.x -= dx;
    this.animTimer += dt;
  }
  draw(ctx) {
    if (this.activated) return;
    const cx = this.x + 20, cy = this.y + 30;
    const pulse = 0.8 + Math.sin(this.animTimer * 0.006) * 0.2;
    const r = 18 * pulse;
    const colors = {
      gravity: '#a855f7',  // purple
      flight:  '#3b82f6',  // blue
      slowtime:'#06b6d4',  // cyan
    };
    const color = colors[this.portalType] || '#fff';
    // Outer ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Inner swirl
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, this.animTimer * 0.003, this.animTimer * 0.003 + Math.PI * 1.5);
    ctx.stroke();
    // Label
    ctx.fillStyle = color;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    const labels = { gravity: '↕', flight: '✈', slowtime: '◷' };
    ctx.fillText(labels[this.portalType] || '?', cx, cy + 4);
  }
}

// Portal durations
export const PORTAL_DURATIONS = {
  gravity:  8000,
  flight:   6000,
  slowtime: 5000,
};

// ================================================================
// CLOUD
// ================================================================
export class Cloud {
  constructor(x, y) { this.x = x; this.y = y; this.width = 74; this.height = 18; }
  update(dx) { this.x -= dx * 0.35; }
  draw(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(this.x+12, this.y, 50, 8);
    ctx.fillRect(this.x+4, this.y+6, 66, 8);
    ctx.fillRect(this.x, this.y+10, 74, 6);
    ctx.fillRect(this.x+20, this.y-6, 28, 6);
  }
}

// ================================================================
// GROUND DECO
// ================================================================
export class GroundDeco {
  constructor(x, kind) { this.x = x; this.kind = kind; }
  update(dx) { this.x -= dx; }
  draw(ctx, color) {
    ctx.fillStyle = color;
    if (this.kind === 'dot') ctx.fillRect(this.x, REF_GROUND_Y+5, 3, 2);
    else if (this.kind === 'dash') ctx.fillRect(this.x, REF_GROUND_Y+6, 8, 2);
    else { ctx.fillRect(this.x, REF_GROUND_Y+4, 5, 3); ctx.fillRect(this.x+7, REF_GROUND_Y+5, 3, 2); }
  }
}

// ================================================================
// SPAWN / PATTERN SYSTEM
// ================================================================
// Instead of pure random, obstacles come in CLUSTERS then BREATHERS.
// A cluster is 2-5 obstacles with tight internal spacing.
// A breather is a longer gap where nothing spawns.

export const SPAWN_STATE = { CLUSTER: 0, BREATHE: 1 };

export function buildCluster(score, canvasWidth) {
  // Decide cluster size based on score — kept modest so obstacles
  // don't feel like a constant wall.
  const base = score < 300 ? 2 : score < 800 ? 2 : score < 1500 ? 3 : 3;
  const size = base + Math.floor(Math.random() * 2);
  const items = [];
  const birdsOk = score >= 200;
  const gapsOk = score >= 400;

  for (let i = 0; i < size; i++) {
    const r = Math.random();
    if (gapsOk && r < 0.12) {
      items.push({ type: 'gap' });
    } else if (birdsOk && r < 0.35) {
      items.push({ type: 'bird', level: randomBirdLevel() });
    } else {
      const g = randomCactusGroup();
      items.push({ type: 'cactus', cactusType: g.type, count: g.count });
    }
  }
  return items;
}

export function clusterInternalGap(speed) {
  return Math.max(220, speed * 36);
}

export function breatherGap(speed) {
  return Math.max(420, speed * 65 + Math.random() * 140);
}

// When to spawn special elements (deterministic score thresholds)
export const PERK_INTERVAL     = 350;   // every N points, consider a perk
export const SLOWTIME_INTERVAL = 800;
export const GRAVITY_INTERVAL  = 1200;
export const FLIGHT_INTERVAL   = 1600;

export function shouldSpawnPerk(score, lastPerkScore) {
  return score >= 400 && score - lastPerkScore >= PERK_INTERVAL;
}
export function shouldSpawnSlowtime(score, lastSlowScore) {
  return score >= 800 && score - lastSlowScore >= SLOWTIME_INTERVAL;
}
export function shouldSpawnGravity(score, lastGravScore) {
  return score >= 1200 && score - lastGravScore >= GRAVITY_INTERVAL;
}
export function shouldSpawnFlight(score, lastFlightScore) {
  return score >= 1600 && score - lastFlightScore >= FLIGHT_INTERVAL;
}

export function randomCactusGroup() {
  const r = Math.random();
  if (r < 0.25) return { type:'small', count:1 };
  if (r < 0.45) return { type:'large', count:1 };
  if (r < 0.68) return { type:'small', count:2 };
  if (r < 0.86) return { type:'large', count:2 };
  return { type:'small', count:3 };
}

export function randomBirdLevel() {
  const r = Math.random();
  if (r < 0.45) return 'low';
  if (r < 0.80) return 'medium';
  return 'high';
}

// ================================================================
// THEME (day/night with smooth crossfade, whole page)
// ================================================================
export const FIRST_NIGHT_SCORE = 1500;
export const CYCLE_SCORE       = 500;
export const FADE_SCORE        = 80;

function lerpCh(a, b, t) { return Math.round(a + (b - a) * t); }
function lerpColor(ca, cb, t) {
  return `rgb(${lerpCh(ca[0],cb[0],t)},${lerpCh(ca[1],cb[1],t)},${lerpCh(ca[2],cb[2],t)})`;
}
const DAY_BG=[255,255,255], DAY_FG=[83,83,83];
const NIGHT_BG=[26,26,26], NIGHT_FG=[235,235,235];

export function getTheme(score) {
  if (score < FIRST_NIGHT_SCORE) return { isNight:false, bg:`rgb(${DAY_BG})`, fg:`rgb(${DAY_FG})` };
  const elapsed = score - FIRST_NIGHT_SCORE;
  const cycle = Math.floor(elapsed / CYCLE_SCORE);
  const isNight = cycle % 2 === 0;
  const t = Math.min(1, (elapsed - cycle * CYCLE_SCORE) / FADE_SCORE);
  if (isNight) return { isNight:true, bg:lerpColor(DAY_BG,NIGHT_BG,t), fg:lerpColor(DAY_FG,NIGHT_FG,t) };
  return { isNight:false, bg:lerpColor(NIGHT_BG,DAY_BG,t), fg:lerpColor(NIGHT_FG,DAY_FG,t) };
}

// ================================================================
// COLLISION
// ================================================================
export function rectsOverlap(a, b) {
  return a.x < b.x+b.width && a.x+a.width > b.x &&
         a.y < b.y+b.height && a.y+a.height > b.y;
}
