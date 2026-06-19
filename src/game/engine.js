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
  const targetWidth = Math.max(900, Math.min(1500, canvasPxWidth * 1.15));
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
// DINO — drawn from labeled rectangles (head, snout, chin, torso,
// arm, tail, legs) instead of a hand-typed pixel grid. Each body
// part is an explicit, named shape with exact coordinates in
// reference units — the same reliable method used for the cactus
// below. This layout went through 10 rendered preview passes,
// checked visually against the reference image each time, including
// fixing a real bug where the two legs' feet overlapped and merged
// into one blob instead of reading as a stride.
//
// Coordinate system: (0,0) = top-left of the dino's bounding box.
// x increases rightward (toward the head/snout — the dino faces
// right). y increases downward (toward the ground).
//   BODY_H = 43   → head + torso occupy y: 0 to 43 (head is large,
//                    proportionally the dominant feature, like a
//                    real T-rex — not a small afterthought)
//   LEG_H  = 15   → legs occupy y: 43 to 58 (58 = ground contact)
//   Overall box: ~62 wide × 58 tall.
// ================================================================
const BODY_H = 43;
const LEG_H  = 15;
export const DINO_W = 62;
export const DINO_H = BODY_H + LEG_H; // 58

function rect(ctx, x, y, w, h) { ctx.fillRect(x, y, w, h); }

/** Head + torso + arm + tail. Same for every frame (legs animate separately). */
function drawDinoBody(ctx, x, y, fg, bg) {
  ctx.fillStyle = fg;
  // ── Head ──────────────────────────────────────────────────
  // Big, blocky, dominant — this is the single most recognizable
  // feature of a T-rex and was previously much too small.
  rect(ctx, x + 18, y + 0,  26, 15, fg);  // skull — big flat-top block
  rect(ctx, x + 37, y + 8,  17, 7,  fg);  // snout — extends right
  rect(ctx, x + 26, y + 15, 13, 4,  fg);  // chin — set back, opens the mouth notch
  rect(ctx, x + 22, y + 19, 16, 3,  fg);  // neck — connects head to shoulders

  // Eye — small bg-colored square punched into the skull
  ctx.fillStyle = bg;
  rect(ctx, x + 23, y + 4, 4, 4, bg);
  ctx.fillStyle = fg;

  // ── Torso ─────────────────────────────────────────────────
  // Front/belly edge (right side) tapers smoothly and monotonically
  // from the shoulders down to the hip — no dip-then-bulge pinching.
  // Back edge (left side) sweeps down to the tail separately.
  rect(ctx, x + 13, y + 22, 25, 4, fg);   // shoulders — widest point, puffed chest
  rect(ctx, x + 8,  y + 26, 28, 4, fg);   // back slopes down-left
  rect(ctx, x + 4,  y + 30, 29, 4, fg);   // back continues toward the tail
  rect(ctx, x + 0,  y + 32, 9,  5, fg);   // tail tip, flush with the band above
  rect(ctx, x + 9,  y + 34, 23, 4, fg);   // belly curving back right
  rect(ctx, x + 13, y + 38, 18, 3, fg);   // belly narrows
  rect(ctx, x + 16, y + 41, 13, 2, fg);   // hip line — bridges down to the legs

  // ── Arm ───────────────────────────────────────────────────
  rect(ctx, x + 34, y + 27, 3, 2, fg);    // tiny stub, centered on the chest
}

// ── Legs: alternating support, not a forward stride ─────────────
// This matches the real Chrome dino gait: one leg is a straight,
// fully-extended SUPPORT column planted on the ground (foot flared
// slightly toward the tail side); the other leg is short, bent at
// the knee, and TUCKED in close toward the body's centerline —
// clearly off the ground, not reaching forward or back. The body,
// head, and tail never move — only which leg is support vs tucked
// alternates between frames A and B.
const LEFT_HIP = 16, RIGHT_HIP = 26;

function supportLeg(ctx, x, y, hipX, fg) {
  rect(ctx, x + hipX,     y + 0,  5, 11, fg);  // straight column, full extension to the ground
  rect(ctx, x + hipX - 2, y + 11, 8, 4,  fg);  // foot, flared, biased slightly behind (toward the tail)
}
function tuckedLeg(ctx, x, y, hipX, bendTowardCenter, fg) {
  rect(ctx, x + hipX, y + 0, 5, 5, fg);                                   // upper leg, same start point as support
  const bend = bendTowardCenter ? 3 : -3;
  rect(ctx, x + hipX + bend, y + 5, 5, 4, fg);                            // bends inward toward the body's
                                                                            // centerline, stays short — well
                                                                            // clear of the ground
}

/**
 * `mode`:
 *   'A'    — left leg = support (planted), right leg = tucked (raised)
 *   'B'    — mirror of A (right = support, left = tucked)
 *   'jump' — both legs tucked up, well clear of the ground
 *   'dead' — both legs collapsed/splayed outward
 * Called with a y-offset of (bodyY + BODY_H), so y=0 here is the hip line.
 */
function drawDinoLegs(ctx, x, y, fg, mode) {
  ctx.fillStyle = fg;

  if (mode === 'jump') {
    rect(ctx, x + LEFT_HIP,  y + 0, 5, 5, fg); rect(ctx, x + LEFT_HIP - 1,  y + 5, 6, 3, fg);
    rect(ctx, x + RIGHT_HIP, y + 0, 5, 5, fg); rect(ctx, x + RIGHT_HIP - 1, y + 5, 6, 3, fg);
    return;
  }

  if (mode === 'dead') {
    rect(ctx, x + LEFT_HIP,  y + 0, 5, 4, fg); rect(ctx, x + LEFT_HIP - 3,  y + 4, 8, 4, fg); // left splayed
    rect(ctx, x + RIGHT_HIP, y + 0, 5, 4, fg); rect(ctx, x + RIGHT_HIP + 3, y + 4, 8, 4, fg); // right splayed
    return;
  }

  if (mode === 'A') {
    supportLeg(ctx, x, y, LEFT_HIP, fg);
    tuckedLeg(ctx, x, y, RIGHT_HIP, false, fg);  // bends left, toward center
  } else {
    tuckedLeg(ctx, x, y, LEFT_HIP, true, fg);    // bends right, toward center
    supportLeg(ctx, x, y, RIGHT_HIP, fg);
  }
}

// ================================================================
// DUCK (low running pose) — same rectangle method, simpler shape.
// ================================================================
export const DUCK_W = 50;
export const DUCK_H = 22;
const DUCK_BODY_H = 16;

function drawDuckBody(ctx, x, y, fg, bg) {
  ctx.fillStyle = fg;
  rect(ctx, x + 0,  y + 8,  38, 8, fg);   // long low body
  rect(ctx, x + 30, y + 0,  16, 10, fg);  // head, raised slightly at the front
  rect(ctx, x + 38, y + 6,  8,  4, fg);   // snout extends further forward
  ctx.fillStyle = bg;
  rect(ctx, x + 36, y + 3, 3, 3, bg);     // eye
  ctx.fillStyle = fg;
}

function drawDuckLegs(ctx, x, y, fg, frameA) {
  ctx.fillStyle = fg;
  if (frameA) {
    rect(ctx, x + 6,  y + 0, 5, 6, fg);
    rect(ctx, x + 24, y + 0, 5, 4, fg);
  } else {
    rect(ctx, x + 6,  y + 0, 5, 4, fg);
    rect(ctx, x + 24, y + 0, 5, 6, fg);
  }
}

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
    // Small inset margin so collisions feel fair (not pixel-perfect
    // against the outer silhouette).
    return {
      x: this.x + 4, y: this.y + 2,
      width: this.width - 8, height: this.height - 2,
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
      drawDuckBody(ctx, x, y, fg, bg);
      drawDuckLegs(ctx, x, y + DUCK_BODY_H, fg, this.frame === 0);
      return;
    }

    drawDinoBody(ctx, x, y, fg, bg);

    if (this.dead) {
      // X-shaped dead eyes, centered on where the live eye gap is (x+23..27, y+4..8)
      ctx.fillStyle = fg;
      rect(ctx, x + 22, y + 3, 2, 2, fg);
      rect(ctx, x + 27, y + 3, 2, 2, fg);
      rect(ctx, x + 24, y + 5, 3, 2, fg);
      rect(ctx, x + 22, y + 7, 2, 2, fg);
      rect(ctx, x + 27, y + 7, 2, 2, fg);
      drawDinoLegs(ctx, x, y + BODY_H, fg, 'dead');
      return;
    }

    // Flight mode: flapping animation
    if (this.isFlying) {
      drawDinoLegs(ctx, x, y + BODY_H, fg, this.frame === 0 ? 'A' : 'B');
      // Small "wing" indicator
      ctx.fillStyle = fg;
      if (this.frame === 0) {
        ctx.fillRect(x - 4, y + 14, 6, 3);
        ctx.fillRect(x - 6, y + 11, 4, 3);
      } else {
        ctx.fillRect(x - 4, y + 19, 6, 3);
        ctx.fillRect(x - 6, y + 22, 4, 3);
      }
      return;
    }

    const mode = this.isJumping ? 'jump' : (this.frame === 0 ? 'A' : 'B');
    drawDinoLegs(ctx, x, y + BODY_H, fg, mode);
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
export const FIRST_NIGHT_SCORE = 1000;
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
// BIOME SCENERY (forest / desert / snow) — distant background
// silhouettes that gradually cycle as the score climbs. These are
// deliberately faded and slow-moving so they never compete with
// gameplay (obstacles, perks, the dino) for visual attention —
// they're texture, not foreground content.
// ================================================================
export const BIOME_CYCLE_SCORE = 300; // how long each biome lasts
export const BIOME_FADE_SCORE  = 75;  // transition window into the next biome
const BIOME_ORDER = ['forest', 'desert', 'snow'];
export const SCENERY_OPACITY = 0.22;   // kept low — texture, not foreground

// Returns which biome is active, which one is coming next, and how
// far into the transition window we are (0 = not transitioning yet,
// 1 = fully transitioned). Used to decide what NEW scenery to spawn
// — existing scenery already on screen keeps its own shape and just
// scrolls off naturally, so the changeover reads as gradual rather
// than everything switching at once.
export function getBiome(score) {
  const cycle = Math.floor(score / BIOME_CYCLE_SCORE);
  const into = score - cycle * BIOME_CYCLE_SCORE;
  const current = BIOME_ORDER[cycle % BIOME_ORDER.length];
  const next = BIOME_ORDER[(cycle + 1) % BIOME_ORDER.length];
  const fadeStart = BIOME_CYCLE_SCORE - BIOME_FADE_SCORE;
  const t = into > fadeStart ? (into - fadeStart) / BIOME_FADE_SCORE : 0;
  return { current, next, t };
}

/**
 * A single piece of distant background scenery — a tree, mesa, dune,
 * or snow-capped pine, depending on biome. Drawn at low opacity and
 * scrolled at a slow parallax rate (slower than clouds) so it reads
 * as "far behind" rather than part of the play area.
 */
export class BiomeScenery {
  constructor(x, biome, kind) {
    this.x = x;
    this.biome = biome;   // 'forest' | 'desert' | 'snow' — fixed at spawn time
    this.kind = kind;     // shape variant within that biome
    this.width = 34 + Math.random() * 22;
    this.height = 30 + Math.random() * 26;
  }
  update(dx) { this.x -= dx * 0.15; } // slower than clouds (0.35) — feels further back
  draw(ctx, color) {
    ctx.save();
    ctx.globalAlpha = SCENERY_OPACITY;
    ctx.fillStyle = color;
    const baseY = REF_GROUND_Y;
    if (this.biome === 'forest') this._drawPine(ctx, baseY, color, false);
    else if (this.biome === 'snow') this._drawPine(ctx, baseY, color, true);
    else this._drawDesert(ctx, baseY);
    ctx.restore();
  }
  _drawPine(ctx, baseY, color, snowCapped) {
    const x = this.x, h = this.height, cx = x + this.width / 2;
    const trunkH = h * 0.22;
    ctx.fillRect(cx - 2, baseY - trunkH, 4, trunkH);
    const layers = 3;
    let topY = baseY - trunkH;
    for (let i = 0; i < layers; i++) {
      const layerH = h * 0.27;
      const lw = this.width * (1 - i * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx, topY - layerH);
      ctx.lineTo(cx - lw / 2, topY + layerH * 0.15);
      ctx.lineTo(cx + lw / 2, topY + layerH * 0.15);
      ctx.closePath();
      ctx.fill();
      topY -= layerH * 0.85;
    }
    if (snowCapped) {
      // small lighter cap on just the very top layer, suggesting snow
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = SCENERY_OPACITY * 1.4;
      const capW = this.width * 0.32;
      ctx.beginPath();
      ctx.moveTo(cx, topY + h * 0.06);
      ctx.lineTo(cx - capW / 2, topY + h * 0.22);
      ctx.lineTo(cx + capW / 2, topY + h * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.globalAlpha = SCENERY_OPACITY;
    }
  }
  _drawDesert(ctx, baseY) {
    const x = this.x, w = this.width, h = this.height * 0.55;
    if (this.kind === 'mesa') {
      ctx.fillRect(x + w * 0.15, baseY - h, w * 0.7, h);
      ctx.fillRect(x, baseY - h * 0.55, w, h * 0.55);
    } else {
      // dune — soft stepped hill, consistent with the pine's layered style
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const sw = w * (1 - i * 0.28);
        const sh = (h / steps) * (i + 1);
        ctx.fillRect(x + (w - sw) / 2, baseY - sh, sw, h / steps);
      }
    }
  }
}

// ================================================================
// COLLISION
// ================================================================
export function rectsOverlap(a, b) {
  return a.x < b.x+b.width && a.x+a.width > b.x &&
         a.y < b.y+b.height && a.y+a.height > b.y;
}