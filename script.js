/*
    Copyright (C) 2023-2026 Lion-A Softwares

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://gnu.org>.



    2023-2026 Mister Cobalt,
    WAC-MAN English - An web port of BANDAI NAMCO's PAC-MAN
*/







(() => {
  const T = 24, C = 19, R = 21;
  const MAP = [
    "###################",
    "#........#........#",
    "#o##.###.#.###.##o#",
    "#.................#",
    "#.##.#.#####.#.##.#",
    "#....#...#...#....#",
    "####.### # ###.####",
    "####.#       #.####",
    "####.# ##-## #.####",
    "    .  #GGG#  .    ",
    "####.# ##### #.####",
    "####.#       #.####",
    "####.# ##### #.####",
    "#........#........#",
    "#.##.###.#.###.##.#",
    "#o.#.....P.....#.o#",
    "##.#.#.#####.#.#.##",
    "#....#...#...#....#",
    "#.######.#.######.#",
    "#.................#",
    "###################"
  ];
  const DIRS = { up: {x:0,y:-1}, down: {x:0,y:1}, left: {x:-1,y:0}, right: {x:1,y:0} };
  const ORDER = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];
  const MODES = [7, 20, 7, 20, 5, 20, 5, 1e9]; // even index: scatter, odd index: chase

  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = C * T * dpr;
  cv.height = R * T * dpr;
  ctx.scale(dpr, dpr);

  const elScore = document.getElementById('score');
  const elHi = document.getElementById('hi');
  const elLvl = document.getElementById('lvl');
  const elLives = document.getElementById('lives');

  let grid, pelletsLeft, score = 0, hi = 0, lives = 3, level = 1, extraGiven = false;
  let totalPellets = 0, fruit = null, fruitSpawned = 0;
  let state = 'title', prevState = 'play', stateT = 0;
  let modeIdx = 0, modeT = 0, frightT = 0, combo = 0;
  let pac, ghosts, popups = [];

  /* ---------- difficulty ---------- */
  const DIFFS = {
    easy:   { label: 'EASY',  lives: 5, ghost: 0.85, pac: 1.05, fright: 9,   frightDecay: 0.5, frightMin: 3,   scatter: 1.4, release: 0.7, fruit: 12 },
    normal: { label: 'NORMAL', lives: 3, ghost: 1,    pac: 1,    fright: 7,   frightDecay: 0.7, frightMin: 2.5, scatter: 1,   release: 1,   fruit: 10 },
    hard:   { label: 'HARD',    lives: 3, ghost: 1.12, pac: 1,    fright: 4.5, frightDecay: 0.7, frightMin: 1.2, scatter: 0.5, release: 0.5, fruit: 7 }
  };
  let diffName = 'normal';
  try { const sd = localStorage.getItem('pacman-diff'); if (DIFFS[sd]) diffName = sd; } catch (e) {}
  let D = DIFFS[diffName];
  lives = D.lives;
  const hiKey = () => 'pacman-hi-' + diffName;
  function loadHi() { hi = 0; try { hi = parseInt(localStorage.getItem(hiKey()) || '0', 10) || 0; } catch (e) {} }
  loadHi();

  /* ---------- fruit ---------- */
  const FRUITS = [
    { n: 'cherry', pts: 100 }, { n: 'strawberry', pts: 300 }, { n: 'orange', pts: 500 },
    { n: 'apple', pts: 700 }, { n: 'melon', pts: 1000 }, { n: 'bell', pts: 2000 }, { n: 'key', pts: 3000 }
  ];
  function checkFruit() {
    const eaten = totalPellets - pelletsLeft;
    if ((fruitSpawned === 0 && eaten >= totalPellets * 0.33) || (fruitSpawned === 1 && eaten >= totalPellets * 0.7)) {
      fruitSpawned++;
      fruit = Object.assign({ x: 9, y: 11, t: D.fruit }, FRUITS[Math.min(level - 1, FRUITS.length - 1)]);
    }
  }

  /* ---------- sound ---------- */
  let AC = null, master = null, sirenOsc = null, sirenGain = null, wakaFlip = false, sirenMode = '';
  let muted = false;
  try { muted = localStorage.getItem('pacman-mute') === '1'; } catch (e) {}
  function audioInit() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      AC = new A();
      master = AC.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(AC.destination);
      sirenOsc = AC.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = AC.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch (e) { AC = null; }
  }
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!AC || muted) return;
    const t0 = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  const INTRO = [[494,.09],[988,.09],[740,.09],[622,.09],[988,.06],[740,.12],[622,.18],
                 [523,.09],[1047,.09],[784,.09],[659,.09],[1047,.06],[784,.12],[659,.18]];
  const sfx = {
    waka() { wakaFlip = !wakaFlip; tone(wakaFlip ? 330 : 220, 0.07, 'triangle', 0.16, 0, wakaFlip ? 220 : 330); },
    power() { tone(200, 0.3, 'sawtooth', 0.12, 0, 900); },
    ghost() { tone(300, 0.3, 'square', 0.11, 0, 1500); },
    fruit() { [660, 880, 1320].forEach((f, i) => tone(f, 0.09, 'square', 0.11, i * 0.07)); },
    extra() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.16, i * 0.09)); },
    clear() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.09, i * 0.12)); },
    death() { for (let i = 0; i < 6; i++) tone(800 - i * 90, 0.2, 'sawtooth', 0.12, i * 0.2, 300 - i * 30); },
    intro() { let t = 0; INTRO.forEach(([f, d]) => { tone(f, d, 'square', 0.08, t); t += d + 0.02; }); }
  };
  function sirenUpdate(t) {
    if (!AC || !sirenOsc) return;
    const now = AC.currentTime;
    let target = 0, f = 200, type = 'triangle', mode = 'off';
    if (state === 'play' && !muted) {
      const prog = totalPellets ? 1 - pelletsLeft / totalPellets : 0;
      if (ghosts.some(g => g.state === 'eaten')) { mode = 'eaten'; type = 'sine'; f = 700 + Math.sin(t * 18) * 250; target = 0.05; }
      else if (frightT > 0) { mode = 'fright'; type = 'square'; f = 120 + Math.abs(Math.sin(t * 12)) * 110; target = 0.022; }
      else { mode = 'normal'; f = 170 + prog * 90 + Math.sin(t * (4 + prog * 6)) * 35; target = 0.05; }
    }
    if (mode !== sirenMode) { sirenMode = mode; if (mode !== 'off') sirenOsc.type = type; }
    sirenOsc.frequency.setTargetAtTime(f, now, 0.03);
    sirenGain.gain.setTargetAtTime(target, now, 0.04);
  }
  function toggleMute() {
    audioInit();
    muted = !muted;
    try { localStorage.setItem('pacman-mute', muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, AC.currentTime, 0.02);
    syncCtl();
  }

  /* ---------- controls ---------- */
  const segBtns = document.querySelectorAll('[data-diff]');
  const sndBtn = document.getElementById('snd');
  function canChangeDiff() { return state === 'title' || state === 'over'; }
  let ctlKey = '';
  function syncCtl() {
    const key = diffName + canChangeDiff() + muted;
    if (key === ctlKey) return;
    ctlKey = key;
    segBtns.forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.diff === diffName));
      b.disabled = !canChangeDiff();
    });
    sndBtn.textContent = 'SOUND: ' + (muted ? 'OFF' : 'ON');
    sndBtn.setAttribute('aria-pressed', String(!muted));
  }
  function setDiff(name) {
    if (!DIFFS[name] || !canChangeDiff()) return;
    diffName = name; D = DIFFS[name];
    try { localStorage.setItem('pacman-diff', name); } catch (e) {}
    lives = D.lives;
    loadHi(); hud(); syncCtl();
  }
  segBtns.forEach(b => b.addEventListener('click', () => { setDiff(b.dataset.diff); b.blur(); }));
  sndBtn.addEventListener('click', () => { toggleMute(); sndBtn.blur(); });

  const wrapX = x => (x + C) % C;
  const tileAt = (x, y) => (y < 0 || y >= R) ? '#' : grid[y][wrapX(x)];
  const canGoPac = (x, y) => { const t = tileAt(x, y); return t !== '#' && t !== '-'; };
  const canGoGhost = (g, x, y) => {
    const t = tileAt(x, y);
    if (t === '#') return false;
    if (t === '-') return g.state === 'leaving' || g.state === 'eaten';
    return true;
  };

  function hud() {
    elScore.textContent = score;
    elHi.textContent = hi;
    elLvl.textContent = level;
    elLives.innerHTML = '<i class="life"></i>'.repeat(Math.max(0, lives));
  }
  function saveHi() {
    if (score > hi) {
      hi = score;
      try { localStorage.setItem(hiKey(), String(hi)); } catch (e) {}
    }
    hud();
  }
  function addScore(n) {
    score += n;
    if (score > hi) hi = score;
    if (!extraGiven && score >= 10000) { extraGiven = true; lives++; sfx.extra(); }
    hud();
  }

  function loadLevel() {
    grid = MAP.map(r => r.split(''));
    pelletsLeft = 0;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      const ch = grid[y][x];
      if (ch === '.' || ch === 'o') pelletsLeft++;
      if (ch === 'P' || ch === 'G') grid[y][x] = ' ';
    }
    modeIdx = 0; modeT = MODES[0] * D.scatter; frightT = 0; combo = 0; popups = [];
    totalPellets = pelletsLeft; fruit = null; fruitSpawned = 0;
    resetActors();
    hud();
  }

  function resetActors() {
    pac = { tx: 9, ty: 15, dx: 0, dy: 0, prog: 0, want: DIRS.left, face: Math.PI, mouthT: 0 };
    const mk = (name, color, tx, ty, wait, corner, st) => ({
      name, color, tx, ty, dx: 0, dy: 0, prog: 0, state: st, wait, corner, fright: false
    });
    ghosts = [
      mk('blinky', '#ff2a2a', 9, 7, 0, [17, 1], 'normal'),
      mk('pinky', '#ffb8de', 9, 9, 2.5 * D.release, [1, 1], 'pen'),
      mk('inky', '#00e5ff', 8, 9, 5 * D.release, [17, 19], 'pen'),
      mk('clyde', '#ffb851', 10, 9, 8 * D.release, [1, 19], 'pen')
    ];
    ghosts[0].dx = -1;
    frightT = 0; combo = 0;
  }

  function startGame() {
    score = 0; lives = D.lives; level = 1; extraGiven = false; sfx.intro();
    loadLevel();
    state = 'ready'; stateT = 2;
  }

  function flip(a) {
    a.tx = wrapX(a.tx + a.dx); a.ty += a.dy;
    a.dx = -a.dx; a.dy = -a.dy;
    a.prog = 1 - a.prog;
  }

  function setWant(d) {
    if (!pac) return;
    pac.want = d;
    if (state === 'play' && (pac.dx || pac.dy) && pac.dx === -d.x && pac.dy === -d.y) flip(pac);
  }

  function advance(a, dist, onArrive) {
    if (!a.dx && !a.dy) { onArrive(a); return; }
    a.prog += dist;
    while (a.prog >= 1) {
      a.prog -= 1;
      a.tx = wrapX(a.tx + a.dx); a.ty += a.dy;
      onArrive(a);
      if (!a.dx && !a.dy) { a.prog = 0; break; }
    }
  }

  function pacArrive(p) {
    if (canGoPac(p.tx + p.want.x, p.ty + p.want.y)) { p.dx = p.want.x; p.dy = p.want.y; }
    else if (!canGoPac(p.tx + p.dx, p.ty + p.dy)) { p.dx = 0; p.dy = 0; }
    if (p.dx || p.dy) p.face = Math.atan2(p.dy, p.dx);
  }

  function bfs(g, gx, gy) {
    const seen = new Uint8Array(C * R);
    const q = [];
    seen[g.ty * C + g.tx] = 1;
    for (const d of ORDER) {
      const nx = wrapX(g.tx + d.x), ny = g.ty + d.y;
      if (ny < 0 || ny >= R || seen[ny * C + nx] || !canGoGhost(g, nx, ny)) continue;
      seen[ny * C + nx] = 1; q.push([nx, ny, d]);
    }
    for (let i = 0; i < q.length; i++) {
      const [x, y, f] = q[i];
      if (x === gx && y === gy) return f;
      for (const d of ORDER) {
        const nx = wrapX(x + d.x), ny = y + d.y;
        if (ny < 0 || ny >= R || seen[ny * C + nx] || !canGoGhost(g, nx, ny)) continue;
        seen[ny * C + nx] = 1; q.push([nx, ny, f]);
      }
    }
    return null;
  }

  function targetFor(g) {
    if (modeIdx % 2 === 0) return g.corner;
    const pd = (pac.dx || pac.dy) ? { x: pac.dx, y: pac.dy } : pac.want;
    switch (g.name) {
      case 'blinky': return [pac.tx, pac.ty];
      case 'pinky': return [pac.tx + pd.x * 4, pac.ty + pd.y * 4];
      case 'inky': {
        const px = pac.tx + pd.x * 2, py = pac.ty + pd.y * 2;
        const b = ghosts[0];
        return [px * 2 - b.tx, py * 2 - b.ty];
      }
      default: {
        const d2 = (g.tx - pac.tx) ** 2 + (g.ty - pac.ty) ** 2;
        return d2 > 64 ? [pac.tx, pac.ty] : g.corner;
      }
    }
  }

  function ghostArrive(g) {
    if (g.state === 'eaten' && g.tx === 9 && g.ty === 9) { g.state = 'leaving'; g.fright = false; }
    if (g.state === 'leaving' && g.tx === 9 && g.ty === 7) g.state = 'normal';
    let dir = null;
    const open = () => ORDER.filter(d => canGoGhost(g, g.tx + d.x, g.ty + d.y));
    if (g.state === 'eaten') dir = bfs(g, 9, 9);
    else if (g.state === 'leaving') dir = bfs(g, 9, 7);
    else {
      let opts = open().filter(d => !(d.x === -g.dx && d.y === -g.dy));
      if (!opts.length) opts = open();
      if (g.fright) dir = opts[(Math.random() * opts.length) | 0];
      else {
        const [tx, ty] = targetFor(g);
        let best = Infinity;
        for (const d of opts) {
          const dist = (g.tx + d.x - tx) ** 2 + (g.ty + d.y - ty) ** 2;
          if (dist < best) { best = dist; dir = d; }
        }
      }
    }
    if (!dir) { const o = open(); dir = o[(Math.random() * o.length) | 0]; }
    g.dx = dir.x; g.dy = dir.y;
  }

  const posOf = a => ({ x: a.tx + a.dx * a.prog, y: a.ty + a.dy * a.prog });

  function ghostSpeed(g) {
    if (g.state === 'eaten') return 14;
    let s;
    if (g.state === 'leaving') s = 5;
    else if (g.fright) s = 3.8;
    else s = Math.min(6.4 + level * 0.3, 8.2);
    if (g.state !== 'leaving') s *= D.ghost;
    if (g.ty === 9 && (g.tx < 4 || g.tx > 14)) s *= 0.55;
    return s;
  }

  function update(dt) {
    if (frightT > 0) {
      frightT -= dt;
      if (frightT <= 0) { frightT = 0; ghosts.forEach(g => g.fright = false); }
    } else {
      modeT -= dt;
      if (modeT <= 0) {
        modeIdx = Math.min(modeIdx + 1, MODES.length - 1);
        modeT = MODES[modeIdx] * (modeIdx % 2 === 0 ? D.scatter : 1);
        ghosts.forEach(g => { if (g.state === 'normal' && (g.dx || g.dy)) flip(g); });
      }
    }

    const ps = (7.2 + Math.min(level, 5) * 0.2) * D.pac;
    advance(pac, ps * dt, pacArrive);
    if (pac.dx || pac.dy) pac.mouthT += dt * 14;

    const et = pac.prog < 0.5 ? [pac.tx, pac.ty] : [wrapX(pac.tx + pac.dx), pac.ty + pac.dy];
    const ch = grid[et[1]][et[0]];
    if (ch === '.') { grid[et[1]][et[0]] = ' '; pelletsLeft--; addScore(10); sfx.waka(); }
    else if (ch === 'o') {
      grid[et[1]][et[0]] = ' '; pelletsLeft--; addScore(50);
      sfx.power();
      frightT = Math.max(D.frightMin, D.fright - level * D.frightDecay);
      combo = 0;
      ghosts.forEach(g => {
        if (g.state !== 'eaten') {
          g.fright = true;
          if (g.state === 'normal' && (g.dx || g.dy)) flip(g);
        }
      });
    }

    checkFruit();
    if (fruit) {
      fruit.t -= dt;
      const fp = posOf(pac);
      if ((fp.x - fruit.x) ** 2 + (fp.y - fruit.y) ** 2 < 0.5) {
        addScore(fruit.pts); sfx.fruit();
        popups.push({ x: (fruit.x + 0.5) * T, y: (fruit.y + 0.5) * T, text: String(fruit.pts), t: 1.2, color: '#ff9bd0' });
        fruit = null;
      } else if (fruit.t <= 0) fruit = null;
    }

    for (const g of ghosts) {
      if (g.state === 'pen') {
        g.wait -= dt;
        if (g.wait <= 0) { g.state = 'leaving'; g.dx = 0; g.dy = 0; }
        continue;
      }
      advance(g, ghostSpeed(g) * dt, ghostArrive);
    }

    const pp = posOf(pac);
    for (const g of ghosts) {
      if (g.state === 'eaten' || g.state === 'pen') continue;
      const gp = posOf(g);
      if ((gp.x - pp.x) ** 2 + (gp.y - pp.y) ** 2 < 0.36) {
        if (g.fright) {
          g.state = 'eaten'; g.fright = false;
          const pts = 200 * 2 ** combo; combo = Math.min(combo + 1, 3);
          addScore(pts); sfx.ghost();
          popups.push({ x: (gp.x + 0.5) * T, y: (gp.y + 0.5) * T, text: String(pts), t: 0.9 });
        } else {
          state = 'dying'; stateT = 1.6; lives--; hud(); sfx.death();
          return;
        }
      }
    }

    if (pelletsLeft <= 0) { state = 'levelup'; stateT = 2; saveHi(); fruit = null; sfx.clear(); }
  }

  function tick(dt) {
    if (state === 'ready') { stateT -= dt; if (stateT <= 0) state = 'play'; }
    else if (state === 'play') update(dt);
    else if (state === 'dying') {
      stateT -= dt;
      if (stateT <= 0) {
        if (lives <= 0) { state = 'over'; saveHi(); }
        else { resetActors(); state = 'ready'; stateT = 1.5; }
      }
    } else if (state === 'levelup') {
      stateT -= dt;
      if (stateT <= 0) { level++; loadLevel(); state = 'ready'; stateT = 2; sfx.intro(); }
    }
    popups.forEach(p => { p.t -= dt; p.y -= 12 * dt; });
    popups = popups.filter(p => p.t > 0);
  }

  /* ---------- drawing ---------- */
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px "Press Start 2P", ui-monospace, monospace';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawMaze(t) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, C * T, R * T);
    const flash = state === 'levelup' && Math.floor(t * 5) % 2 === 1;
    ctx.fillStyle = '#05053c';
    ctx.strokeStyle = flash ? '#ffffff' : '#2b2bff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      if (grid[y][x] !== '#') continue;
      const px = x * T, py = y * T;
      ctx.fillRect(px, py, T, T);
      const open = (nx, ny) => ny >= 0 && ny < R && nx >= 0 && nx < C && grid[ny][nx] !== '#';
      if (open(x, y - 1)) { ctx.moveTo(px, py); ctx.lineTo(px + T, py); }
      if (open(x, y + 1)) { ctx.moveTo(px, py + T); ctx.lineTo(px + T, py + T); }
      if (open(x - 1, y)) { ctx.moveTo(px, py); ctx.lineTo(px, py + T); }
      if (open(x + 1, y)) { ctx.moveTo(px + T, py); ctx.lineTo(px + T, py + T); }
    }
    ctx.stroke();
    ctx.fillStyle = '#ffb8de';
    ctx.fillRect(9 * T, 8 * T + T / 2 - 2, T, 4);

    const blink = Math.floor(t * 4) % 2 === 0;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      const ch = grid[y][x];
      if (ch === '.') {
        ctx.fillStyle = '#ffd9b0';
        ctx.fillRect(x * T + T / 2 - 2, y * T + T / 2 - 2, 4, 4);
      } else if (ch === 'o' && (blink || state !== 'play')) {
        ctx.fillStyle = '#ffd9b0';
        ctx.beginPath();
        ctx.arc(x * T + T / 2, y * T + T / 2, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPac() {
    const p = posOf(pac);
    const cx = (p.x + 0.5) * T, cy = (p.y + 0.5) * T, r = 10.5;
    let m;
    if (state === 'dying') {
      const k = Math.min(1, (1.6 - stateT) / 1.3);
      m = 0.25 * Math.PI + k * 0.75 * Math.PI;
    } else {
      m = (0.05 + 0.23 * Math.abs(Math.sin(pac.mouthT))) * Math.PI;
    }
    ctx.fillStyle = '#ffe100';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, pac.face + m, pac.face + Math.PI * 2 - m);
    ctx.closePath();
    ctx.fill();
  }

  function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function drawFruit(f, cx, cy, t) {
    cy += Math.sin(t * 6);
    ctx.lineCap = 'round'; ctx.lineWidth = 2;
    switch (f.n) {
      case 'cherry':
        ctx.strokeStyle = '#4caf50';
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy + 4); ctx.quadraticCurveTo(cx - 3, cy - 7, cx + 3, cy - 9);
        ctx.moveTo(cx + 5, cy + 5); ctx.quadraticCurveTo(cx + 6, cy - 5, cx + 3, cy - 9);
        ctx.stroke();
        ctx.fillStyle = '#ff1f3d'; disc(cx - 5, cy + 5, 4.5); disc(cx + 5, cy + 6, 4.5);
        break;
      case 'strawberry':
        ctx.fillStyle = '#ff2a4d';
        ctx.beginPath(); ctx.arc(cx, cy - 1, 8, Math.PI, 0); ctx.lineTo(cx, cy + 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe9a0';
        [[-4, -2], [3, -3], [-1, 2], [3, 2]].forEach(([dx, dy]) => disc(cx + dx, cy + dy, 1));
        ctx.fillStyle = '#4caf50'; ctx.fillRect(cx - 5, cy - 10, 10, 3);
        break;
      case 'orange':
        ctx.fillStyle = '#ff9a1f'; disc(cx, cy + 1, 8);
        ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(cx + 2, cy - 8, 4, 2, -0.4, 0, Math.PI * 2); ctx.fill();
        break;
      case 'apple':
        ctx.fillStyle = '#e4262c'; disc(cx, cy + 1, 8);
        ctx.strokeStyle = '#8b5a2b'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 1, cy - 10); ctx.stroke();
        ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(cx + 4, cy - 8, 3.5, 1.8, -0.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'melon':
        ctx.fillStyle = '#7ed957'; disc(cx, cy + 1, 8);
        ctx.strokeStyle = '#2e8b3a'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 7);
        ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 7);
        ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 9);
        ctx.stroke();
        break;
      case 'bell':
        ctx.fillStyle = '#ffd21f';
        ctx.beginPath(); ctx.arc(cx, cy - 1, 7, Math.PI, 0); ctx.lineTo(cx + 9, cy + 6); ctx.lineTo(cx - 9, cy + 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; disc(cx, cy + 8, 2);
        break;
      case 'key':
        ctx.strokeStyle = '#5ee6ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy - 5, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - 1); ctx.lineTo(cx, cy + 9);
        ctx.moveTo(cx, cy + 5); ctx.lineTo(cx + 4, cy + 5);
        ctx.moveTo(cx, cy + 9); ctx.lineTo(cx + 4, cy + 9);
        ctx.stroke();
        break;
    }
  }

  function drawGhost(g, t) {
    const p = posOf(g);
    const cx = (p.x + 0.5) * T;
    const cy = (p.y + 0.5) * T + (g.state === 'pen' ? Math.sin(t * 8 + g.tx) * 2 : 0);
    const r = 10;
    if (g.state !== 'eaten') {
      let col = g.color;
      if (g.fright) col = (frightT < 2 && Math.floor(t * 6) % 2) ? '#ffffff' : '#2a2aff';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy - 1, r, Math.PI, 0);
      ctx.lineTo(cx + r, cy + r);
      const ph = Math.floor(t * 8) % 2;
      for (let i = 1; i <= 6; i++) {
        const x = cx + r - i * (2 * r / 6);
        ctx.lineTo(x, cy + r - (((i + ph) % 2) ? 4 : 0));
      }
      ctx.closePath();
      ctx.fill();
    }
    if (g.fright && g.state !== 'eaten') {
      ctx.fillStyle = (frightT < 2 && Math.floor(t * 6) % 2) ? '#ff2a2a' : '#ffd9b0';
      ctx.fillRect(cx - 5, cy - 4, 3, 3);
      ctx.fillRect(cx + 2, cy - 4, 3, 3);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy + 4);
      for (let i = 1; i <= 4; i++) ctx.lineTo(cx - 6 + i * 3, cy + (i % 2 ? 1 : 4));
      ctx.stroke();
    } else {
      const ox = g.dx * 1.8, oy = g.dy * 1.8;
      for (const s of [-4, 4]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(cx + s, cy - 3, 3.2, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1aff';
        ctx.beginPath(); ctx.arc(cx + s + ox, cy - 3 + oy, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function overlay(alpha) {
    ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    ctx.fillRect(0, 0, C * T, R * T);
  }

  function draw(t) {
    drawMaze(t);
    if (state !== 'title') {
      if (fruit && (fruit.t > 2 || Math.floor(t * 8) % 2)) drawFruit(fruit, (fruit.x + 0.5) * T, (fruit.y + 0.5) * T, t);
      drawPac();
      if (state !== 'dying') ghosts.forEach(g => drawGhost(g, t));
      popups.forEach(p => text(p.text, p.x, p.y, 8, p.color || '#00e5ff'));
    }
    const cx = C * T / 2;
    if (state === 'title') {
      overlay(0.75);
      text('WAC-MAN', cx, 170, 30, '#ffe100');
      text('TO START', cx, 250, 10, '#f4f4f4');
      if (Math.floor(t * 2) % 2 === 0) text('PRESS SPACE or TAP', cx, 275, 10, '#ffe100');
      text('Swipe or use arrow keys', cx, 340, 8, '#8b8bb0');
      text('DIFFICULTY: ' + D.label, cx, 375, 8, '#00e5ff');
    } else if (state === 'ready') {
      text('READY!', cx, 11.5 * T + 2, 14, '#ffe100');
    } else if (state === 'paused') {
      overlay(0.6);
      text('PAUSED', cx, 250, 14, '#ffe100');
      text('tap to resume', cx, 285, 8, '#8b8bb0');
    } else if (state === 'over') {
      overlay(0.6);
      text('GAME OVER', cx, 240, 20, '#ff2a2a');
      text('SCORE ' + score, cx, 285, 10, '#f4f4f4');
      if (Math.floor(t * 2) % 2 === 0) text('AGAIN: SPACE / TAP', cx, 330, 8, '#ffe100');
    }
  }

  /* ---------- input ---------- */
  function primary() {
    audioInit();
    if (state === 'title' || state === 'over') startGame();
    else if (state === 'paused') state = prevState;
  }
  function togglePause() {
    if (state === 'play' || state === 'ready') { prevState = state; state = 'paused'; }
    else if (state === 'paused') state = prevState;
  }

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right'
  };
  window.addEventListener('keydown', e => {
    if (KEYS[e.key]) { e.preventDefault(); setWant(DIRS[KEYS[e.key]]); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); primary(); }
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
    else if (e.key === 'm' || e.key === 'M') toggleMute();
  });

  let sx = 0, sy = 0, touching = false;
  cv.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; touching = true; primary(); });
  cv.addEventListener('pointermove', e => {
    if (!touching) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) {
      setWant(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up));
      sx = e.clientX; sy = e.clientY;
    }
  });
  window.addEventListener('pointerup', () => { touching = false; });
  window.addEventListener('pointercancel', () => { touching = false; });

  document.querySelectorAll('.pad button').forEach(b => {
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (state === 'title' || state === 'over' || state === 'paused') primary();
      setWant(DIRS[b.dataset.d]);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'play' || state === 'ready')) { prevState = state; state = 'paused'; }
  });

  /* ---------- main loop ---------- */
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    tick(dt);
    draw(ts / 1000);
    sirenUpdate(ts / 1000);
    syncCtl();
    requestAnimationFrame(frame);
  }

  loadLevel();
  try { if (document.fonts) document.fonts.load('12px "Press Start 2P"'); } catch (e) {}
  requestAnimationFrame(frame);
})();
