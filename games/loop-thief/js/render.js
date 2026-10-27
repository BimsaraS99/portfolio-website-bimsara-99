/* LOOP THIEF — canvas renderer. Purely visual: it interpolates between two
   simulation frames and never feeds anything back into the rules. */
(function (root) {
  'use strict';

  const C = {
    bg: '#070b18', floor: '#0a0f24', floorAlt: '#0c1229', grid: 'rgba(80,120,255,.08)',
    wall: '#26336e', wallTop: '#4560c4', wallEdge: '#121a3d',
    player: '#ffffff', playerEdge: '#22d3ee',
    ghosts: ['#22d3ee', '#a78bfa', '#f472b6'],
    plate: '#f59e0b', switchOff: '#f59e0b', switchOn: '#34d399',
    door: '#ef4444', laser: '#ff3b5c', exit: '#fde047', exitEdge: '#a3e635'
  };
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.shakeUntil = 0;
      this.cs = 40;
    }

    setLevel(level) { this.level = level; this.particles = []; }

    // Fit the board inside maxW × maxH CSS pixels.
    fit(maxW, maxH) {
      const lv = this.level;
      this.cs = Math.max(18, Math.min(76, Math.floor(Math.min(maxW / lv.width, maxH / lv.height))));
      const w = this.cs * lv.width, h = this.cs * lv.height, dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    center(x, y) { return [(x + .5) * this.cs, (y + .5) * this.cs]; }

    burst(x, y, color, n, speed) {
      const [cx, cy] = this.center(x, y);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (speed || 1) * (40 + Math.random() * 140);
        this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: .9 + Math.random() * .9, color, size: 1.5 + Math.random() * 2.5 });
      }
    }

    shake(ms) { this.shakeUntil = performance.now() + ms; }

    /* view: { from, to, k, time, dt, reduced, ghosts:[{id,colorIndex,attempt}], planPath, trails, spawn:{id:t0}, showLinks } */
    draw(view) {
      const ctx = this.ctx, lv = this.level, cs = this.cs, t = view.time / 1000;
      const k = ease(Math.max(0, Math.min(1, view.k)));
      const W = cs * lv.width, H = cs * lv.height;
      ctx.save();
      if (!view.reduced && view.time < this.shakeUntil) ctx.translate((Math.random() - .5) * 6, (Math.random() - .5) * 6);
      ctx.fillStyle = C.bg; ctx.fillRect(-10, -10, W + 20, H + 20);

      // floor
      for (let y = 0; y < lv.height; y++) for (let x = 0; x < lv.width; x++) {
        if (lv.walls.has(x + ',' + y)) continue;
        ctx.fillStyle = (x + y) % 2 ? C.floor : C.floorAlt;
        ctx.fillRect(x * cs, y * cs, cs, cs);
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        ctx.strokeRect(x * cs + .5, y * cs + .5, cs - 1, cs - 1);
      }

      const val = (frame, id) => id in frame.plates ? frame.plates[id] : !!frame.switches[id];
      const mix = id => lerp(+val(view.from, id), +val(view.to, id), k);

      // wiring between controllers and what they control
      const ctrlPos = {};
      lv.plates.forEach(p => { ctrlPos[p.id] = p; });
      lv.switches.forEach(s => { ctrlPos[s.id] = s; });
      const wire = (fromId, tx, ty, color) => {
        const p = ctrlPos[fromId]; if (!p) return;
        const on = mix(fromId), [ax, ay] = this.center(p.x, p.y), [bx, by] = this.center(tx, ty);
        ctx.save();
        ctx.setLineDash([3, 6]); ctx.lineDashOffset = view.reduced ? 0 : -t * 18;
        ctx.strokeStyle = rgba(color, .12 + on * .45); ctx.lineWidth = 1.5 + on;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.restore();
      };
      lv.doors.forEach(d => d.by.forEach(id => wire(id, d.x, d.y, C.door)));
      lv.hazards.forEach(h => h.offBy.forEach(id => wire(id, h.x, h.y, C.laser)));

      // plates
      lv.plates.forEach(p => {
        const on = mix(p.id), x = p.x * cs, y = p.y * cs, m = cs * (.16 + on * .04);
        ctx.save();
        ctx.shadowColor = C.plate; ctx.shadowBlur = on * 18;
        ctx.fillStyle = rgba(C.plate, .25 + on * .55);
        roundRect(ctx, x + m, y + m, cs - 2 * m, cs - 2 * m, cs * .12); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = C.plate; ctx.lineWidth = 2;
        roundRect(ctx, x + m, y + m, cs - 2 * m, cs - 2 * m, cs * .12); ctx.stroke();
        label(ctx, p.id.toUpperCase(), x + cs / 2, y + cs / 2, cs * .28, on > .5 ? '#1a1205' : C.plate);
      });

      // switches
      lv.switches.forEach(s => {
        const on = mix(s.id), [cx, cy] = this.center(s.x, s.y), r = cs * .3;
        const col = on > .5 ? C.switchOn : C.switchOff;
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = 10 + on * 8;
        ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        const ang = lerp(-2.4, -.7, on);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy + r * .3); ctx.lineTo(cx + Math.cos(ang) * r * .95, cy + r * .3 + Math.sin(ang) * r * .95); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy + r * .3, 3, 0, Math.PI * 2); ctx.fill();
        label(ctx, on > .5 ? 'ON' : 'OFF', cx, cy + cs * .38, cs * .17, col);
      });

      // vault / artifact
      {
        const [cx, cy] = this.center(lv.exit.x, lv.exit.y), r = cs * .26;
        const spin = view.reduced ? 0 : t * 1.2, pulse = view.reduced ? 0 : Math.sin(t * 3) * .5 + .5;
        ctx.save();
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cs * .7);
        g.addColorStop(0, rgba(C.exit, .35 + pulse * .15)); g.addColorStop(1, rgba(C.exit, 0));
        ctx.fillStyle = g; ctx.fillRect(cx - cs, cy - cs, cs * 2, cs * 2);
        ctx.translate(cx, cy); ctx.rotate(spin);
        ctx.shadowColor = C.exit; ctx.shadowBlur = 16;
        ctx.fillStyle = C.exit; ctx.strokeStyle = C.exitEdge; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * .8, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      // lasers
      lv.hazards.forEach(h => {
        const on = lerp(+view.from.hazards[h.id], +view.to.hazards[h.id], k), x = h.x * cs, y = h.y * cs;
        ctx.fillStyle = rgba(C.laser, .08 + on * .1); ctx.fillRect(x, y, cs, cs);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, cs, cs); ctx.clip();
        ctx.strokeStyle = rgba(C.laser, .12 + on * .18); ctx.lineWidth = cs * .08;
        for (let i = -1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + i * cs * .33, y + cs); ctx.lineTo(x + i * cs * .33 + cs * .4, y); ctx.stroke(); }
        ctx.restore();
        if (on > .02) {
          const flick = view.reduced ? 1 : .8 + Math.sin(t * 14 + h.x) * .2;
          ctx.save();
          ctx.globalAlpha = on * flick;
          ctx.shadowColor = C.laser; ctx.shadowBlur = 14;
          ctx.strokeStyle = '#ffd1d9'; ctx.lineWidth = 2;
          for (const yy of [.32, .68]) { ctx.beginPath(); ctx.moveTo(x + 3, y + cs * yy); ctx.lineTo(x + cs - 3, y + cs * yy); ctx.stroke(); }
          ctx.restore();
        }
        ctx.fillStyle = on > .5 ? C.laser : '#5b2433';
        ctx.fillRect(x + 1, y + cs * .2, 3, cs * .6); ctx.fillRect(x + cs - 4, y + cs * .2, 3, cs * .6);
      });

      // doors
      lv.doors.forEach(d => {
        const open = lerp(+view.from.doors[d.id], +view.to.doors[d.id], k), x = d.x * cs, y = d.y * cs;
        const half = (cs / 2) * (1 - open * .82);
        ctx.fillStyle = rgba(C.door, .1 + open * .05); ctx.fillRect(x, y, cs, cs);
        ctx.save();
        ctx.shadowColor = C.door; ctx.shadowBlur = (1 - open) * 12;
        ctx.fillStyle = open > .5 ? rgba(C.door, .45) : '#8f1d2c';
        ctx.fillRect(x, y, half, cs); ctx.fillRect(x + cs - half, y, half, cs);
        ctx.restore();
        ctx.strokeStyle = C.door; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, half - 1, cs - 2); ctx.strokeRect(x + cs - half, y + 1, half - 1, cs - 2);
        if (open < .5) lock(ctx, x + cs / 2, y + cs / 2, cs * .16);
        else label(ctx, d.group, x + cs / 2, y + cs / 2, cs * .22, rgba(C.door, .8));
      });

      // walls
      lv.walls.forEach(kk => {
        const [x, y] = kk.split(',').map(Number), px = x * cs, py = y * cs;
        ctx.fillStyle = C.wall; ctx.fillRect(px, py, cs, cs);
        // brick seams
        ctx.fillStyle = 'rgba(7,11,24,.45)';
        ctx.fillRect(px, py + cs / 2 - 1, cs, 2);
        ctx.fillRect(px + ((y % 2) ? cs * .25 : cs * .75) - 1, py, 2, cs / 2);
        ctx.fillRect(px + ((y % 2) ? cs * .75 : cs * .25) - 1, py + cs / 2, 2, cs / 2);
        // bevel facing open floor
        if (y > 0 && !lv.walls.has(x + ',' + (y - 1))) { ctx.fillStyle = C.wallTop; ctx.fillRect(px, py, cs, 3); }
        if (y + 1 < lv.height && !lv.walls.has(x + ',' + (y + 1))) { ctx.fillStyle = C.wallEdge; ctx.fillRect(px, py + cs - 4, cs, 4); }
      });

      // ghost trails & player plan preview
      (view.trails || []).forEach(tr => path(ctx, tr.points, this, rgba(C.ghosts[tr.colorIndex], .32), [2, 5], 2));
      if (view.planPath && view.planPath.length > 1) path(ctx, view.planPath, this, 'rgba(255,255,255,.55)', [6, 5], 2.5, view.reduced ? 0 : -t * 20);

      // characters (ghosts first, player on top)
      const meta = {};
      (view.ghosts || []).forEach(g => { meta[g.id] = g; });
      view.to.chars.forEach((c, i) => {
        const a = view.from.chars[i];
        let x = lerp(a.x, c.x, k), y = lerp(a.y, c.y, k);
        if (c.bumped && DIRS[c.bumped]) {
          const b = Math.sin(Math.min(1, view.k) * Math.PI) * .2;
          x += DIRS[c.bumped][0] * b; y += DIRS[c.bumped][1] * b;
        }
        const caught = c.caught && view.k > .45;
        const m = meta[c.id] || {};
        const color = c.kind === 'player' ? C.playerEdge : C.ghosts[m.colorIndex == null ? c.color : m.colorIndex];
        const spawnT = view.spawn && view.spawn[c.id] != null ? (view.time - view.spawn[c.id]) / 650 : 2;
        this.drawThief(x, y, c.kind === 'player', color, m.attempt, caught, view, spawnT, i);
      });

      // particles
      const dt = Math.min(.05, (view.dt || 16) / 1000);
      this.particles = this.particles.filter(p => (p.life -= p.decay * dt) > 0);
      this.particles.forEach(p => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy = p.vy * .96 + 30 * dt;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
      ctx.globalAlpha = 1;

      // CRT scanlines
      if (!view.reduced) {
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        for (let yy = 0; yy < H; yy += 3) ctx.fillRect(0, yy, W, 1);
      }
      ctx.restore();
    }

    drawThief(gx, gy, isPlayer, color, attempt, caught, view, spawnT, seed) {
      const ctx = this.ctx, cs = this.cs, t = view.time / 1000;
      const bob = view.reduced ? 0 : Math.sin(t * 4 + seed * 1.7) * cs * .025;
      const [cx, cy0] = this.center(gx, gy), cy = cy0 + bob;
      const s = cs * .58, r = s * .32;
      ctx.save();
      ctx.globalAlpha = caught ? .3 : 1;

      // ghost materialise: horizontal glitch slices
      if (spawnT < 1 && !view.reduced) {
        ctx.globalAlpha *= spawnT;
        ctx.translate((Math.random() - .5) * cs * .3 * (1 - spawnT), 0);
      }

      ctx.shadowColor = color; ctx.shadowBlur = isPlayer ? 16 : 12;
      ctx.fillStyle = isPlayer ? C.player : rgba(color, .3);
      ctx.strokeStyle = color; ctx.lineWidth = isPlayer ? 3 : 2;
      roundRect(ctx, cx - s / 2, cy - s / 2, s, s, r); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      // thief mask + eyes
      ctx.fillStyle = isPlayer ? '#0b1020' : rgba('#0b1020', .7);
      roundRect(ctx, cx - s * .44, cy - s * .2, s * .88, s * .26, s * .1); ctx.fill();
      ctx.fillStyle = isPlayer ? C.playerEdge : color;
      const blink = !view.reduced && (Math.floor(t * 10 + seed * 13) % 37 === 0);
      const eh = blink ? 1 : s * .1;
      ctx.fillRect(cx - s * .26, cy - s * .07 - eh / 2 + s * .0, s * .14, eh);
      ctx.fillRect(cx + s * .12, cy - s * .07 - eh / 2 + s * .0, s * .14, eh);

      if (!isPlayer) {
        // ghost scanline body
        ctx.fillStyle = rgba(color, .25);
        for (let yy = cy - s / 2 + 2; yy < cy + s / 2; yy += 3) ctx.fillRect(cx - s / 2 + 2, yy, s - 4, 1);
        if (attempt) {
          const bx = cx + s * .48, by = cy - s * .48;
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(bx, by, cs * .14, 0, Math.PI * 2); ctx.fill();
          label(ctx, String(attempt), bx, by + .5, cs * .16, '#0b1020');
        }
      }
      if (caught) {
        ctx.globalAlpha = 1; ctx.strokeStyle = C.laser; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - s * .4, cy - s * .4); ctx.lineTo(cx + s * .4, cy + s * .4);
        ctx.moveTo(cx + s * .4, cy - s * .4); ctx.lineTo(cx - s * .4, cy + s * .4); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function label(ctx, text, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.font = '600 ' + Math.max(8, Math.round(size)) + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function lock(ctx, x, y, s) {
    ctx.save();
    ctx.fillStyle = '#ffd1d1'; ctx.strokeStyle = '#ffd1d1'; ctx.lineWidth = Math.max(1.5, s * .3);
    ctx.beginPath(); ctx.arc(x, y - s * .35, s * .55, Math.PI, 0); ctx.stroke();
    ctx.fillRect(x - s * .85, y - s * .35, s * 1.7, s * 1.3);
    ctx.restore();
  }

  function path(ctx, pts, r, color, dash, width, offset) {
    ctx.save();
    ctx.setLineDash(dash); ctx.lineDashOffset = offset || 0;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => { const [x, y] = r.center(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    const last = pts[pts.length - 1], [lx, ly] = r.center(last[0], last[1]);
    ctx.setLineDash([]); ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(lx, ly, width * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  root.LoopThief = Object.assign(root.LoopThief || {}, { Renderer, COLORS: C });
})(window);
