import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dino,
  Cactus,
  Bird,
  Cloud,
  GroundDeco,
  CANVAS_HEIGHT,
  GROUND_Y,
  BIRD_SCORE_THRESHOLD,
  minObstacleGap,
  randomCactusGroup,
  randomBirdLevel,
  getTheme,
  rectsOverlap,
} from "./engine";

const START_SPEED           = 7;
const SPEED_INCREASE_AMOUNT = 0.25;
const SPEED_INCREASE_EVERY  = 5000;
const BASE_FRAME_MS         = 1000 / 60;
const HIGH_SCORE_KEY        = "dino_high_score";

// ── Web Audio sound effects ────────────────────────────────────
let audioCtx = null;
function getAC() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq, type, dur, vol = 0.15) {
  try {
    const ac = getAC();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start(); o.stop(ac.currentTime + dur);
  } catch {}
}
function playJump() {
  try {
    const ac = getAC();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'square';
    o.frequency.setValueAtTime(200, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(500, ac.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    o.start(); o.stop(ac.currentTime + 0.15);
  } catch {}
}
function playDie() {
  beep(300, 'sawtooth', 0.1, 0.2);
  setTimeout(() => beep(150, 'sawtooth', 0.15, 0.2), 80);
}
function playMilestone() {
  beep(880, 'square', 0.06, 0.1);
  setTimeout(() => beep(880, 'square', 0.06, 0.1), 90);
}

// ── Apply theme to the whole page via CSS variables ────────────
function applyPageTheme(bg, fg) {
  const root = document.documentElement;
  root.style.setProperty('--page-bg', bg);
  root.style.setProperty('--page-fg', fg);
  root.style.setProperty('--color-bg', bg);
  root.style.setProperty('--color-fg', fg);
  document.body.style.background = bg;
  document.body.style.color      = fg;
}

// ── DinoGame ──────────────────────────────────────────────────
export default function DinoGame({ onGameOver }) {
  const canvasRef    = useRef(null);
  const wrapRef      = useRef(null);
  const stateRef     = useRef(null);
  const gsRef        = useRef("idle");
  const lastMilestone= useRef(0);

  const [gameState, setGameState]     = useState("idle");
  const [displayScore, setDisplayScore] = useState(0);
  const [highScore, setHighScore]     = useState(
    () => parseInt(localStorage.getItem(HIGH_SCORE_KEY) || "0", 10)
  );
  // keep highScore accessible in RAF loop without re-creating loop
  const highScoreRef = useRef(highScore);
  useEffect(() => { highScoreRef.current = highScore; }, [highScore]);

  // ── canvas resize ──────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current, w = wrapRef.current;
    if (!c || !w) return;
    c.width  = w.clientWidth;
    c.height = CANVAS_HEIGHT;
  }, []);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [resize]);

  // ── init ──────────────────────────────────────────────────
  const initState = useCallback(() => {
    const W = canvasRef.current?.width || 900;
    const dino = new Dino();
    stateRef.current = {
      dino, obstacles: [], clouds: [], groundDecos: [],
      speed: START_SPEED, score: 0,
      distSinceSpawn: 0, distSinceSpeedup: 0,
      lastTime: null, birdsEnabled: false, canvasWidth: W,
    };
    lastMilestone.current = 0;
    // seed clouds
    for (let i = 0; i < 4; i++)
      stateRef.current.clouds.push(new Cloud(Math.random()*W, 20+Math.random()*60));
    // seed decos
    const kinds = ['dot','dash','pair'];
    for (let i = 0; i < 30; i++)
      stateRef.current.groundDecos.push(
        new GroundDeco(Math.random()*W, kinds[Math.floor(Math.random()*kinds.length)]));
  }, []);

  const startGame = useCallback(() => {
    initState();
    setDisplayScore(0);
    // Reset page to day
    applyPageTheme('rgb(255,255,255)', 'rgb(83,83,83)');
    gsRef.current = "running";
    setGameState("running");
  }, [initState]);

  const endGame = useCallback((finalScore) => {
    playDie();
    gsRef.current = "gameover";
    setGameState("gameover");
    const rounded = Math.floor(finalScore);
    const newHigh = Math.max(highScoreRef.current, rounded);
    if (newHigh > highScoreRef.current) {
      highScoreRef.current = newHigh;
      setHighScore(newHigh);
      localStorage.setItem(HIGH_SCORE_KEY, String(newHigh));
    }
    if (onGameOver) onGameOver(rounded);
  }, [onGameOver]);

  // ── input ─────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e) => {
      const gs = gsRef.current;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (gs === 'idle' || gs === 'gameover') { startGame(); return; }
        if (gs === 'running') {
          const jumped = stateRef.current.dino.jump();
          if (jumped) playJump();
        }
      }
      if (e.code === 'Enter' && gs === 'gameover') startGame();
      if (e.code === 'ArrowDown' && gs === 'running') {
        e.preventDefault();
        stateRef.current.dino.setDuck(true);
      }
    };
    const onUp = (e) => {
      if (e.code === 'ArrowDown') stateRef.current?.dino.setDuck(false);
    };
    const onTouch = (e) => {
      const gs = gsRef.current;
      if (gs === 'idle' || gs === 'gameover') { startGame(); return; }
      if (gs === 'running') {
        const rect = canvasRef.current?.getBoundingClientRect();
        const y = e.changedTouches[0].clientY - (rect?.top||0);
        if (y > CANVAS_HEIGHT / 2) {
          stateRef.current.dino.setDuck(true);
          setTimeout(() => stateRef.current?.dino.setDuck(false), 600);
        } else {
          const jumped = stateRef.current.dino.jump();
          if (jumped) playJump();
        }
      }
    };
    const onClick = () => {
      if (gsRef.current === 'idle' || gsRef.current === 'gameover') startGame();
    };
    const cv = canvasRef.current;
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    cv?.addEventListener('touchstart', onTouch, { passive: true });
    cv?.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
      cv?.removeEventListener('touchstart', onTouch);
      cv?.removeEventListener('click', onClick);
    };
  }, [startGame]);

  // ── game loop ─────────────────────────────────────────────
  useEffect(() => {
    initState();
  }, [initState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    let rafId;

    const loop = (time) => {
      const s = stateRef.current;
      if (!s) { rafId = requestAnimationFrame(loop); return; }
      if (s.lastTime === null) s.lastTime = time;
      const dt = Math.min(time - s.lastTime, 50);
      s.lastTime = time;

      if (gsRef.current === 'running') tick(s, dt);
      draw(ctx, s, gsRef.current, canvas.width);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []); // runs once

  // ── tick ──────────────────────────────────────────────────
  function tick(s, dt) {
    const ff = dt / BASE_FRAME_MS;
    const dx = s.speed * ff;
    s.canvasWidth = canvasRef.current?.width || 900;

    s.score += dt * 0.012 * (1 + (s.speed - START_SPEED) / 10);
    const fl = Math.floor(s.score);
    setDisplayScore(fl);

    // milestone beep every 100 pts
    const ms = Math.floor(fl / 100) * 100;
    if (ms > lastMilestone.current) { lastMilestone.current = ms; if (ms > 0) playMilestone(); }

    if (fl >= BIRD_SCORE_THRESHOLD) s.birdsEnabled = true;

    // speed
    s.distSinceSpeedup += dt;
    if (s.distSinceSpeedup >= SPEED_INCREASE_EVERY) {
      s.distSinceSpeedup = 0; s.speed += SPEED_INCREASE_AMOUNT;
    }

    // dino
    s.dino.update(dt);

    // obstacles
    s.distSinceSpawn += dx;
    const gap = minObstacleGap(s.speed, s.canvasWidth);
    if (s.distSinceSpawn >= gap) {
      s.distSinceSpawn = 0;
      if (s.birdsEnabled && Math.random() < 0.28) {
        s.obstacles.push(new Bird(s.canvasWidth + 10, randomBirdLevel()));
      } else {
        const { type, count } = randomCactusGroup();
        s.obstacles.push(new Cactus(s.canvasWidth + 10, type, count));
      }
    }
    for (const ob of s.obstacles)
      ob.update.length === 2 ? ob.update(dx, dt) : ob.update(dx);
    s.obstacles = s.obstacles.filter(ob => ob.x + ob.width > -20);

    // clouds
    for (const c of s.clouds) c.update(dx);
    s.clouds = s.clouds.filter(c => c.x + c.width > -10);
    if (Math.random() < 0.004 * ff)
      s.clouds.push(new Cloud(s.canvasWidth + 20, 15 + Math.random() * 60));

    // decos
    const kinds = ['dot','dash','pair'];
    for (const g of s.groundDecos) g.update(dx);
    s.groundDecos = s.groundDecos.filter(g => g.x > -20);
    if (Math.random() < 0.08 * ff)
      s.groundDecos.push(new GroundDeco(
        s.canvasWidth + Math.random() * 30,
        kinds[Math.floor(Math.random() * kinds.length)]));

    // collision
    const db = s.dino.hitbox;
    for (const ob of s.obstacles) {
      if (rectsOverlap(db, ob.hitbox)) {
        s.dino.dead = true;
        endGame(s.score);
        break;
      }
    }

    // push theme to page every frame (smooth fade)
    const theme = getTheme(fl);
    applyPageTheme(theme.bg, theme.fg);
  }

  // ── draw ──────────────────────────────────────────────────
  function draw(ctx, s, gs, W) {
    const theme = getTheme(Math.floor(s.score));
    const { bg, fg } = theme;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, CANVAS_HEIGHT);

    for (const c of s.clouds) c.draw(ctx, fg);

    // ground line
    ctx.fillStyle = fg;
    ctx.fillRect(0, GROUND_Y + 2, W, 2);

    for (const g of s.groundDecos) g.draw(ctx, fg);
    for (const ob of s.obstacles)  ob.draw(ctx, fg);

    s.dino.draw(ctx, fg, bg);

    // score HUD
    ctx.fillStyle  = fg;
    ctx.font       = 'bold 20px "Press Start 2P", monospace';
    ctx.textAlign  = 'right';
    const hi  = String(highScoreRef.current).padStart(5, '0');
    const cur = String(Math.floor(s.score)).padStart(5, '0');
    ctx.fillText(`HI ${hi}  ${cur}`, W - 16, 36);

    // overlays
    ctx.textAlign = 'center';
    if (gs === 'idle') {
      ctx.fillStyle = fg;
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillText('PRESS SPACE TO START', W/2, CANVAS_HEIGHT/2 - 20);
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillText('SPACE / ↑ = JUMP   ↓ = DUCK', W/2, CANVAS_HEIGHT/2 + 8);
    }
    if (gs === 'gameover') {
      ctx.fillStyle = fg;
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.fillText('GAME OVER', W/2, CANVAS_HEIGHT/2 - 22);
      // restart icon
      const cx = W/2, cy = CANVAS_HEIGHT/2 + 16;
      ctx.strokeStyle = fg; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0.4*Math.PI, 1.9*Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+14,cy-10); ctx.lineTo(cx+22,cy-4); ctx.lineTo(cx+11,cy-1);
      ctx.closePath(); ctx.fillStyle = fg; ctx.fill();
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('SPACE / ENTER / CLICK TO RESTART', W/2, CANVAS_HEIGHT/2 + 48);
    }
  }

  return (
    <div className="game-page">
      <div ref={wrapRef} className="game-canvas-wrap" style={{ width: '100%' }}>
        <canvas ref={canvasRef} tabIndex={0} style={{ display: 'block', width: '100%' }} />
      </div>
      <div className="game-instructions">
        SPACE / ↑ = JUMP &nbsp;|&nbsp; ↓ = DUCK &nbsp;|&nbsp; TAP UPPER/LOWER HALF ON MOBILE
      </div>
    </div>
  );
}