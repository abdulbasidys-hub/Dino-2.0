import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dino, Cactus, Bird, Gap, Perk, Portal, Cloud, GroundDeco,
  REF_HEIGHT, REF_GROUND_Y, DINO_X,
  setGameWidth, getGameWidth, computeCamera,
  JUMP_HOLD_WINDOW,
  PERK_EFFECTS, PORTAL_DURATIONS,
  SPAWN_STATE, buildCluster, clusterInternalGap, breatherGap,
  shouldSpawnPerk, shouldSpawnSlowtime, shouldSpawnGravity, shouldSpawnFlight,
  getTheme, rectsOverlap,
} from "./engine";

// ================================================================
// TUNING
// ================================================================
const START_SPEED           = 8;
const SPEED_INCREASE_AMOUNT = 0.4;
const SPEED_INCREASE_EVERY  = 4000;
const BASE_FRAME_MS         = 1000 / 60;
const HIGH_SCORE_KEY        = "dino_high_score";

// ================================================================
// WEB AUDIO SOUNDS
// ================================================================
let audioCtx = null;
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq, type, dur, vol = 0.12) {
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.start(); o.stop(a.currentTime + dur);
  } catch {}
}
function playJump()      { beep(220,'square',0.1,0.14); }
function playDie()       { beep(300,'sawtooth',0.1,0.2); setTimeout(()=>beep(150,'sawtooth',0.15,0.2),80); }
function playMilestone() { beep(880,'square',0.06,0.1); setTimeout(()=>beep(880,'square',0.06,0.1),90); }
function playPerkGreen() { beep(523,'sine',0.15,0.15); setTimeout(()=>beep(659,'sine',0.15,0.12),100); }
function playPerkRed()   { beep(200,'sawtooth',0.2,0.2); beep(150,'square',0.15,0.15); }
function playPortal()    { beep(440,'sine',0.3,0.12); setTimeout(()=>beep(660,'sine',0.25,0.1),120); }
function playGapFall()   { beep(180,'sawtooth',0.3,0.25); }
function playFlap()      { beep(350,'square',0.06,0.08); }

// ================================================================
// BACKGROUND MUSIC — simple looping chiptune-style melody + bass,
// synthesised (no audio file). Runs on its own gain node so the
// mute button only affects music, never the sound effects above.
// ================================================================
const MUSIC_MUTE_KEY = "dino_music_muted";
let musicGain = null;
let musicTimerId = null;
let musicStep = 0;
let musicMuted = localStorage.getItem(MUSIC_MUTE_KEY) === "1";

// A short 16-step bassline + melody, in Hz. 0 = rest.
const MUSIC_BASS    = [110,0,110,0,131,0,110,0, 98,0,98,0,87,0,98,0];
const MUSIC_MELODY  = [0,440,0,523,0,440,0,392, 0,392,0,349,0,392,0,330];
const MUSIC_STEP_MS = 180;

function ensureMusicGain() {
  const a = ac();
  if (!musicGain) {
    musicGain = a.createGain();
    musicGain.gain.value = musicMuted ? 0 : 0.05;
    musicGain.connect(a.destination);
  }
  return musicGain;
}

function musicNote(freq, type, dur, vol) {
  if (freq <= 0) return;
  try {
    const a = ac();
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g); g.connect(ensureMusicGain());
    o.start(); o.stop(a.currentTime + dur);
  } catch {}
}

function startMusic() {
  if (musicTimerId) return; // already running
  ensureMusicGain();
  const tick = () => {
    musicNote(MUSIC_BASS[musicStep % MUSIC_BASS.length], 'triangle', MUSIC_STEP_MS / 1000 * 0.9, 0.5);
    musicNote(MUSIC_MELODY[musicStep % MUSIC_MELODY.length], 'square', MUSIC_STEP_MS / 1000 * 0.7, 0.35);
    musicStep++;
    musicTimerId = setTimeout(tick, MUSIC_STEP_MS);
  };
  tick();
}

function stopMusic() {
  if (musicTimerId) { clearTimeout(musicTimerId); musicTimerId = null; }
}

function setMusicMuted(muted) {
  musicMuted = muted;
  localStorage.setItem(MUSIC_MUTE_KEY, muted ? "1" : "0");
  if (musicGain) musicGain.gain.value = muted ? 0 : 0.05;
}
function isMusicMuted() { return musicMuted; }

// ================================================================
// PAGE THEME
// ================================================================
function applyPageTheme(bg, fg) {
  const r = document.documentElement;
  r.style.setProperty('--page-bg', bg);
  r.style.setProperty('--page-fg', fg);
  r.style.setProperty('--color-bg', bg);
  r.style.setProperty('--color-fg', fg);
  document.body.style.background = bg;
  document.body.style.color = fg;
}

// ================================================================
// COMPONENT
// ================================================================
export default function DinoGame({ onGameOver, onScoreUpdate, onImmersiveChange }) {
  const canvasRef    = useRef(null);
  const wrapRef      = useRef(null);
  const stateRef     = useRef(null);
  const gsRef        = useRef("idle");
  const lastMile     = useRef(0);
  const immersiveRef = useRef(false);

  const [gameState, setGameState]     = useState("idle");
  const [displayScore, setDisplayScore] = useState(0);
  const [highScore, setHighScore]     = useState(
    () => parseInt(localStorage.getItem(HIGH_SCORE_KEY) || "0", 10)
  );
  const highScoreRef = useRef(highScore);
  useEffect(() => { highScoreRef.current = highScore; }, [highScore]);

  const [isMuted, setIsMuted] = useState(() => isMusicMuted());
  const toggleMusic = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setMusicMuted(next);
      return next;
    });
  }, []);

  // ── Immersive mode ────────────────────────────────────────
  const setImmersive = useCallback((on) => {
    immersiveRef.current = on;
    document.body.classList.toggle('game-immersive', on);
    if (onImmersiveChange) onImmersiveChange(on);
  }, [onImmersiveChange]);

  // ── Canvas sizing ─────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current, w = wrapRef.current;
    if (!c || !w) return;
    if (immersiveRef.current) {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    } else {
      c.width = w.clientWidth;
      c.height = REF_HEIGHT;
    }
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  // ── Init game state ───────────────────────────────────────
  const initState = useCallback(() => {
    const dino = new Dino();
    stateRef.current = {
      dino,
      obstacles: [],
      clouds: [],
      groundDecos: [],
      perks: [],
      speed: START_SPEED,
      score: 0,
      rawDistance: 0,
      // Spawn pattern state
      spawnState: SPAWN_STATE.BREATHE,
      spawnDist: 0,
      cluster: [],
      clusterIdx: 0,
      // Speed
      distSinceSpeedup: 0,
      lastTime: null,
      // Special spawn tracking
      lastPerkScore: 0,
      lastSlowScore: 0,
      lastGravScore: 0,
      lastFlightScore: 0,
      // Active effects
      effects: {
        multiplier: 1,
        speedMod: 1,
        slowTime: false,
        slowTimeLeft: 0,
        gravityInverted: false,
        gravityTimeLeft: 0,
        flight: false,
        flightTimeLeft: 0,
        screenShake: 0,
        perkLabel: '',
        perkLabelTimer: 0,
      },
      // Streak
      streak: 0,
      bestStreak: 0,
    };
    lastMile.current = 0;
    // Seed clouds + ground decos
    const W = getGameWidth();
    for (let i = 0; i < 5; i++)
      stateRef.current.clouds.push(new Cloud(Math.random()*W, 15+Math.random()*60));
    const kinds = ['dot','dash','pair'];
    for (let i = 0; i < 30; i++)
      stateRef.current.groundDecos.push(
        new GroundDeco(Math.random()*W, kinds[Math.floor(Math.random()*kinds.length)]));
  }, []);

  // ── Start / End ───────────────────────────────────────────
  const startGame = useCallback(() => {
    initState();
    setDisplayScore(0);
    if (onScoreUpdate) onScoreUpdate(0);
    applyPageTheme('rgb(255,255,255)','rgb(83,83,83)');
    setImmersive(true);
    setTimeout(resize, 50); // let immersive CSS apply first
    startMusic(); // no-ops if already playing — keeps looping through restarts
    gsRef.current = "running";
    setGameState("running");
  }, [initState, onScoreUpdate, setImmersive, resize]);

  const endGame = useCallback((finalScore) => {
    playDie();
    gsRef.current = "gameover";
    setGameState("gameover");
    const rounded = Math.floor(finalScore);
    if (onScoreUpdate) onScoreUpdate(rounded);
    const newHigh = Math.max(highScoreRef.current, rounded);
    if (newHigh > highScoreRef.current) {
      highScoreRef.current = newHigh;
      setHighScore(newHigh);
      localStorage.setItem(HIGH_SCORE_KEY, String(newHigh));
    }
    if (onGameOver) onGameOver(rounded);
    // Music keeps playing through the game-over screen intentionally
  }, [onGameOver, onScoreUpdate]);

  const exitToPage = useCallback(() => {
    setImmersive(false);
    resize();
    gsRef.current = "idle";
    setGameState("idle");
    applyPageTheme('rgb(255,255,255)','rgb(83,83,83)');
    stopMusic();
  }, [setImmersive, resize]);

  // Stop music if the component unmounts while still playing
  useEffect(() => {
    return () => stopMusic();
  }, []);

  // ── Input ─────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e) => {
      if (e.repeat) return; // ignore OS key-repeat while held
      const gs = gsRef.current;
      if (e.code === 'Escape') { if (gs === 'gameover') exitToPage(); return; }
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (gs === 'idle' || gs === 'gameover') { startGame(); return; }
        if (gs === 'running') {
          const result = stateRef.current.dino.beginJump();
          if (result === 'flap') playFlap();
          else if (result === 'jump') playJump();
        }
      }
      if (e.code === 'Enter' && gs === 'gameover') startGame();
      if (e.code === 'ArrowDown' && gs === 'running') {
        e.preventDefault();
        stateRef.current.dino.setDuck(true);
      }
    };
    const onUp = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        stateRef.current?.dino.endHold();
      }
      if (e.code === 'ArrowDown') {
        stateRef.current?.dino.setDuck(false);
      }
    };
    const onTouch = (e) => {
      const gs = gsRef.current;
      if (gs === 'idle' || gs === 'gameover') { startGame(); return; }
      if (gs === 'running') {
        const rect = canvasRef.current?.getBoundingClientRect();
        const y = e.changedTouches[0].clientY - (rect?.top||0);
        const h = rect?.height || REF_HEIGHT;
        const s = stateRef.current;
        if (y > h * 0.6) {
          s.dino.setDuck(true);
          setTimeout(()=> stateRef.current?.dino.setDuck(false), 500);
        } else {
          const result = s.dino.beginJump();
          if (result === 'flap') playFlap();
          else if (result === 'jump') playJump();
        }
      }
    };
    const onTouchEnd = () => {
      stateRef.current?.dino.endHold();
    };
    const cv = canvasRef.current;
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    cv?.addEventListener('touchstart', onTouch, { passive: true });
    cv?.addEventListener('touchend', onTouchEnd, { passive: true });
    cv?.addEventListener('click', () => {
      const gs = gsRef.current;
      if (gs === 'idle' || gs === 'gameover') startGame();
    });
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      cv?.removeEventListener('touchstart', onTouch);
      cv?.removeEventListener('touchend', onTouchEnd);
    };
  }, [startGame, exitToPage]);

  // ── Init + loop ───────────────────────────────────────────
  useEffect(() => { initState(); }, [initState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let rafId;
    const loop = (time) => {
      const s = stateRef.current;
      if (!s) { rafId = requestAnimationFrame(loop); return; }
      if (s.lastTime === null) s.lastTime = time;
      let dt = Math.min(time - s.lastTime, 50);
      s.lastTime = time;

      // Camera: scale is driven by WIDTH so the field of view stays
      // wide regardless of device height (fixes the old zoomed-in feel).
      const cw = canvas.width, ch = canvas.height;
      const { scale, gameW } = computeCamera(cw);
      setGameWidth(gameW);

      // Slow-time effect: dilate dt
      if (s.effects.slowTime) dt *= 0.4;

      if (gsRef.current === 'running') tick(s, dt, gameW);
      draw(ctx, s, gsRef.current, cw, ch, scale, gameW);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── TICK ──────────────────────────────────────────────────
  function tick(s, dt, gameW) {
    const ff = dt / BASE_FRAME_MS;
    const effectiveSpeed = s.speed * s.effects.speedMod;
    const dx = effectiveSpeed * ff;

    // Score
    s.rawDistance += dx;
    s.score += dt * 0.012 * s.effects.multiplier * (1 + (s.speed - START_SPEED) / 12);
    const fl = Math.floor(s.score);
    setDisplayScore(fl);
    if (onScoreUpdate) onScoreUpdate(fl);

    // Milestone beep
    const ms = Math.floor(fl / 100) * 100;
    if (ms > lastMile.current) { lastMile.current = ms; if (ms > 0) playMilestone(); }

    // Speed increase
    s.distSinceSpeedup += dt;
    if (s.distSinceSpeedup >= SPEED_INCREASE_EVERY) {
      s.distSinceSpeedup = 0; s.speed += SPEED_INCREASE_AMOUNT;
    }

    // Update effects timers
    const eff = s.effects;
    if (eff.slowTime) {
      eff.slowTimeLeft -= dt / 0.4; // use real dt, not dilated
      if (eff.slowTimeLeft <= 0) { eff.slowTime = false; }
    }
    if (eff.gravityInverted) {
      eff.gravityTimeLeft -= dt;
      if (eff.gravityTimeLeft <= 0) {
        eff.gravityInverted = false;
        s.dino.inverted = false;
      }
    }
    if (eff.flight) {
      eff.flightTimeLeft -= dt;
      if (eff.flightTimeLeft <= 0) {
        eff.flight = false;
        s.dino.exitFlight();
      }
    }
    if (eff.screenShake > 0) eff.screenShake -= dt;
    if (eff.perkLabelTimer > 0) eff.perkLabelTimer -= dt;

    // Multiplier timeout (from perks)
    if (eff._multTimer !== undefined && eff._multTimer > 0) {
      eff._multTimer -= dt;
      if (eff._multTimer <= 0) {
        eff.multiplier = 1; eff.speedMod = 1;
        eff._multTimer = undefined;
      }
    }

    // Dino
    s.dino.update(dt);

    // ── Obstacle spawning (cluster/breathe pattern) ─────────
    s.spawnDist += dx;
    if (s.spawnState === SPAWN_STATE.BREATHE) {
      if (s.spawnDist >= breatherGap(effectiveSpeed)) {
        s.spawnDist = 0;
        s.cluster = buildCluster(fl, gameW);
        s.clusterIdx = 0;
        s.spawnState = SPAWN_STATE.CLUSTER;
      }
    } else {
      if (s.spawnDist >= clusterInternalGap(effectiveSpeed)) {
        s.spawnDist = 0;
        if (s.clusterIdx < s.cluster.length) {
          const item = s.cluster[s.clusterIdx++];
          spawnFromItem(s, item, gameW);
        }
        if (s.clusterIdx >= s.cluster.length) {
          s.spawnState = SPAWN_STATE.BREATHE;
          s.spawnDist = 0;
        }
      }
    }

    // ── Special spawns (perks / portals) ────────────────────
    if (shouldSpawnPerk(fl, s.lastPerkScore) && s.spawnState === SPAWN_STATE.BREATHE) {
      s.lastPerkScore = fl;
      s.perks.push(new Perk(gameW + 30, Math.random() < 0.55 ? 'green' : 'red'));
    }
    if (shouldSpawnSlowtime(fl, s.lastSlowScore) && !eff.slowTime && !eff.flight && !eff.gravityInverted) {
      s.lastSlowScore = fl;
      s.obstacles.push(new Portal(gameW + 40, 'slowtime'));
    }
    if (shouldSpawnGravity(fl, s.lastGravScore) && !eff.gravityInverted && !eff.flight && !eff.slowTime) {
      s.lastGravScore = fl;
      s.obstacles.push(new Portal(gameW + 40, 'gravity'));
    }
    if (shouldSpawnFlight(fl, s.lastFlightScore) && !eff.flight && !eff.gravityInverted && !eff.slowTime) {
      s.lastFlightScore = fl;
      s.obstacles.push(new Portal(gameW + 40, 'flight'));
    }

    // ── Update all entities ─────────────────────────────────
    for (const ob of s.obstacles)
      ob.update.length === 2 ? ob.update(dx, dt) : ob.update(dx);
    s.obstacles = s.obstacles.filter(ob => ob.x + (ob.width||80) > -40);

    for (const p of s.perks) p.update(dx, dt);
    s.perks = s.perks.filter(p => p.x + p.width > -20 && !p.collected);

    for (const c of s.clouds) c.update(dx);
    s.clouds = s.clouds.filter(c => c.x + c.width > -10);
    if (Math.random() < 0.004 * ff)
      s.clouds.push(new Cloud(gameW + 20, 15 + Math.random() * 60));

    const kinds = ['dot','dash','pair'];
    for (const g of s.groundDecos) g.update(dx);
    s.groundDecos = s.groundDecos.filter(g => g.x > -20);
    if (Math.random() < 0.08 * ff)
      s.groundDecos.push(new GroundDeco(
        gameW + Math.random()*30, kinds[Math.floor(Math.random()*kinds.length)]));

    // ── Collisions ──────────────────────────────────────────
    const db = s.dino.hitbox;

    // Perk collection
    for (const p of s.perks) {
      if (!p.collected && rectsOverlap(db, p.hitbox)) {
        p.collected = true;
        const fx = PERK_EFFECTS[p.perkType];
        eff.multiplier = fx.multiplier;
        eff.speedMod = fx.speedMod;
        eff._multTimer = fx.duration;
        eff.perkLabel = fx.label;
        eff.perkLabelTimer = 2000;
        if (p.perkType === 'red') eff.screenShake = fx.duration;
        if (p.perkType === 'green') playPerkGreen(); else playPerkRed();
      }
    }

    // Obstacle collision
    for (const ob of s.obstacles) {
      if (ob.kind === 'portal' && !ob.activated && rectsOverlap(db, ob.hitbox)) {
        ob.activated = true;
        playPortal();
        if (ob.portalType === 'gravity') {
          eff.gravityInverted = true;
          eff.gravityTimeLeft = PORTAL_DURATIONS.gravity;
          s.dino.inverted = true;
        } else if (ob.portalType === 'flight') {
          eff.flight = true;
          eff.flightTimeLeft = PORTAL_DURATIONS.flight;
          s.dino.enterFlight();
        } else if (ob.portalType === 'slowtime') {
          eff.slowTime = true;
          eff.slowTimeLeft = PORTAL_DURATIONS.slowtime;
        }
        continue;
      }

      if (ob.kind === 'gap') {
        if (ob.checkDinoFall(s.dino)) {
          s.dino.dead = true; playGapFall(); endGame(s.score); break;
        }
        continue;
      }

      if (ob.kind === 'portal') continue; // portals already handled above

      // Deadly obstacles (cactus, bird)
      if (rectsOverlap(db, ob.hitbox)) {
        s.dino.dead = true; endGame(s.score); break;
      }
    }

    // Streak tracking
    s.streak += dt * 0.001;
    if (s.streak > s.bestStreak) s.bestStreak = s.streak;

    // Page theme
    const theme = getTheme(fl);
    applyPageTheme(theme.bg, theme.fg);
  }

  function spawnFromItem(s, item, gameW) {
    const x = gameW + 10;
    if (item.type === 'gap') {
      s.obstacles.push(new Gap(x));
    } else if (item.type === 'bird') {
      s.obstacles.push(new Bird(x, item.level));
    } else {
      s.obstacles.push(new Cactus(x, item.cactusType, item.count));
    }
  }

  // ── DRAW ──────────────────────────────────────────────────
  function draw(ctx, s, gs, cw, ch, scale, gameW) {
    const theme = getTheme(Math.floor(s.score));
    const { bg, fg } = theme;
    const eff = s.effects;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();

    // Screen shake
    if (eff.screenShake > 0) {
      const intensity = Math.min(eff.screenShake / 1000, 1) * 4;
      ctx.translate(
        (Math.random()-0.5) * intensity * scale,
        (Math.random()-0.5) * intensity * scale
      );
    }

    // Anchor the ground near the bottom of whatever canvas height we
    // actually have, then apply the width-driven scale. This keeps the
    // ground/dino visible and well-positioned on any aspect ratio,
    // rather than assuming the canvas is exactly REF_HEIGHT tall.
    const groundPixelY = ch * 0.83;
    ctx.translate(0, groundPixelY - REF_GROUND_Y * scale);
    ctx.scale(scale, scale);

    // Gravity inversion: flip the entire game world
    if (eff.gravityInverted) {
      ctx.translate(0, REF_HEIGHT);
      ctx.scale(1, -1);
    }

    // Clouds
    for (const c of s.clouds) c.draw(ctx, fg);

    // Ground line (hidden during flight mode)
    if (!eff.flight) {
      ctx.fillStyle = fg;
      ctx.fillRect(0, REF_GROUND_Y + 2, gameW, 2);
      // Ground decos
      for (const g of s.groundDecos) g.draw(ctx, fg);
    }

    // Draw gaps as breaks in ground
    for (const ob of s.obstacles) {
      if (ob.kind === 'gap' && !eff.flight) {
        // Clear ground over gap area
        ctx.fillStyle = bg;
        ctx.fillRect(ob.x, REF_GROUND_Y + 2, ob.width, 4);
        ob.draw(ctx, fg);
      }
    }

    // Obstacles (non-gap)
    for (const ob of s.obstacles) {
      if (ob.kind !== 'gap') ob.draw(ctx, fg);
    }

    // Perks
    for (const p of s.perks) p.draw(ctx);

    // Dino
    s.dino.draw(ctx, fg, bg);

    // Undo gravity flip for HUD
    if (eff.gravityInverted) {
      ctx.scale(1, -1);
      ctx.translate(0, -REF_HEIGHT);
    }

    // ── HUD (in game coordinates, not flipped) ──────────────
    ctx.fillStyle = fg;
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    const hi = String(highScoreRef.current).padStart(5,'0');
    const cur = String(Math.floor(s.score)).padStart(5,'0');
    ctx.fillText(`HI ${hi}  ${cur}`, gameW - 12, 28);

    // Multiplier indicator
    if (eff.multiplier > 1) {
      ctx.fillStyle = eff.speedMod > 1 ? '#ef4444' : '#22c55e';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`x${eff.multiplier.toFixed(1)}`, 12, 28);
    }

    // Perk label flash
    if (eff.perkLabelTimer > 0) {
      ctx.fillStyle = fg;
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, eff.perkLabelTimer / 500);
      ctx.fillText(eff.perkLabel, gameW / 2, 60);
      ctx.globalAlpha = 1;
    }

    // Active zone indicators
    if (eff.flight) {
      ctx.fillStyle = '#3b82f6';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FLIGHT MODE', gameW / 2, REF_HEIGHT - 10);
    }
    if (eff.gravityInverted) {
      ctx.fillStyle = '#a855f7';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GRAVITY INVERTED', gameW / 2, REF_HEIGHT - 10);
    }
    if (eff.slowTime) {
      ctx.fillStyle = '#06b6d4';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SLOW TIME', gameW / 2, REF_HEIGHT - 10);
    }

    // Hold-extension indicator — shows while airborne and still holding,
    // filling toward the point where holding stops adding extra height.
    if (s.dino.isJumping && s.dino.holding) {
      const pct = Math.min(1, s.dino.holdTime / JUMP_HOLD_WINDOW);
      ctx.fillStyle = fg;
      ctx.fillRect(DINO_X - 2, REF_GROUND_Y + 8, 50, 5);
      ctx.fillStyle = pct >= 1 ? '#3b82f6' : pct > 0.4 ? '#22c55e' : '#eab308';
      ctx.fillRect(DINO_X - 2, REF_GROUND_Y + 8, 50 * pct, 5);
    }

    ctx.restore(); // undo scale + translate

    // ── Overlays (in screen pixels, not game coords) ────────
    ctx.textAlign = 'center';

    if (gs === 'idle') {
      ctx.fillStyle = fg;
      ctx.font = `${16*scale}px "Press Start 2P", monospace`;
      ctx.fillText('PRESS SPACE TO START', cw/2, ch/2 - 20*scale);
      ctx.font = `${8*scale}px "Press Start 2P", monospace`;
      ctx.fillText('HOLD LONGER = HIGHER JUMP  |  ↓ = DUCK', cw/2, ch/2 + 10*scale);
    }

    if (gs === 'gameover') {
      // Dim overlay
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, cw, ch);

      ctx.fillStyle = '#fff';
      ctx.font = `${22*scale}px "Press Start 2P", monospace`;
      ctx.fillText('GAME OVER', cw/2, ch/2 - 30*scale);

      ctx.font = `${12*scale}px "Press Start 2P", monospace`;
      ctx.fillText(`SCORE: ${String(Math.floor(s.score)).padStart(5,'0')}`, cw/2, ch/2 + 5*scale);

      if (s.effects.multiplier > 1) {
        ctx.fillText(`MULTIPLIER: x${s.effects.multiplier.toFixed(1)}`, cw/2, ch/2 + 25*scale);
      }

      // Restart icon
      const cx = cw/2, cy = ch/2 + 55*scale;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3*scale;
      ctx.beginPath(); ctx.arc(cx, cy, 16*scale, 0.4*Math.PI, 1.9*Math.PI); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx+14*scale, cy-10*scale);
      ctx.lineTo(cx+22*scale, cy-4*scale);
      ctx.lineTo(cx+11*scale, cy-1*scale);
      ctx.closePath(); ctx.fillStyle='#fff'; ctx.fill();

      ctx.font = `${7*scale}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#fff';
      ctx.fillText('TAP TO RESTART  |  ✕ TO EXIT', cw/2, ch/2 + 85*scale);
    }
  }

  return (
    <div className="game-page">
      <div ref={wrapRef} className="game-canvas-wrap" style={{ width: '100%' }}>
        <canvas ref={canvasRef} tabIndex={0} style={{ display:'block', width:'100%' }} />
        <button
          className="music-toggle-btn"
          onClick={toggleMusic}
          aria-label={isMuted ? "Unmute music" : "Mute music"}
          title={isMuted ? "Unmute music" : "Mute music"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
        {/* Always-visible exit button — critical for mobile where
            there is no Escape key. Sits top-right of the canvas. */}
        <button
          className="game-exit-btn"
          onClick={exitToPage}
          aria-label="Exit to home"
          title="Exit to home"
        >
          ✕
        </button>
      </div>
      {gameState === 'idle' && (
        <div className="game-instructions">
          SPACE / ↑ = JUMP (HOLD LONGER FOR A HIGHER JUMP) &nbsp;|&nbsp; ↓ = DUCK
          <br />
          PORTALS GRANT SPECIAL ABILITIES &nbsp;|&nbsp; COLLECT PERKS FOR SCORE MULTIPLIERS
        </div>
      )}
      <div className="landscape-prompt">
        <div className="landscape-prompt-icon">📱</div>
        <div className="landscape-prompt-text">
          ROTATE YOUR PHONE<br />TO LANDSCAPE<br />FOR THE FULL EXPERIENCE
        </div>
      </div>
    </div>
  );
}