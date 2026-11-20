// hud.js — seluruh tampilan 2D: uang, bintang wanted, jam, bar nyawa, senjata/amunisi,
// objektif + jarak, prompt konteks, kotak dialog, banner misi, toast, meteran BUSTED,
// speedometer, label distrik, dan minimap bundar (canvas 2D, utara di atas: jalan, pantai,
// beacon misi berdenyut, titik polisi berkedip, panah pemain). Layar judul/jeda/busted/
// wasted adalah overlay DOM yang ditoggle dari sini.

import { AVENUES, STREETS, BEACH_ROAD_Z, WORLD } from './city.js';
import { readSave } from './save.js';

const el = {};
let bannerTimer = 0;
let toastTimer = 0;
let minimapCtx = null;

export function initHud() {
  for (const id of ['cash', 'stars', 'clock', 'district', 'healthfill', 'weapon', 'speedo', 'objective', 'prompt',
    'dialog', 'dialog-name', 'dialog-text', 'banner', 'banner-title', 'banner-sub', 'toast', 'bust-wrap', 'bust-fill',
    'flash', 'title-screen', 'pause-screen', 'busted-screen', 'wasted-screen', 'btn-continue', 'minimap', 'hud']) {
    el[id] = document.getElementById(id);
  }
  minimapCtx = el.minimap.getContext('2d');
}

export function showScreen(name) {
  el['title-screen'].style.display = name === 'title' ? 'flex' : 'none';
  el['pause-screen'].style.display = name === 'pause' ? 'flex' : 'none';
  el['busted-screen'].style.display = name === 'busted' ? 'flex' : 'none';
  el['wasted-screen'].style.display = name === 'wasted' ? 'flex' : 'none';
  el.hud.style.display = name === 'title' ? 'none' : 'block';
  if (name === 'title') el['btn-continue'].classList.toggle('disabled', !readSave());
}

export function showBanner(title, sub) {
  el['banner-title'].textContent = title;
  el['banner-sub'].textContent = sub || '';
  el.banner.style.display = 'block';
  bannerTimer = 3.4;
}

export function showToast(text) {
  el.toast.textContent = text;
  el.toast.style.display = 'block';
  toastTimer = 3.6;
}

function fmtClock(timeMin) {
  const h = Math.floor(timeMin / 60) % 24;
  const m = Math.floor(timeMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function drawMinimap(G) {
  const ctx = minimapCtx;
  const S = 168;
  const scale = S / (WORLD.maxX - WORLD.minX);
  const mx = (x) => (x - WORLD.minX) * scale;
  const mz = (z) => (z - WORLD.minZ) * scale;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#232733';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#175d7a';
  ctx.fillRect(0, mz(196), S, S - mz(196));
  ctx.fillStyle = '#b99c6e';
  ctx.fillRect(0, mz(148), S, mz(196) - mz(148));
  ctx.strokeStyle = '#4c5261';
  ctx.lineWidth = 2.4;
  for (const a of AVENUES) { ctx.beginPath(); ctx.moveTo(mx(a), 0); ctx.lineTo(mx(a), S); ctx.stroke(); }
  for (const s of STREETS) { ctx.beginPath(); ctx.moveTo(0, mz(s)); ctx.lineTo(S, mz(s)); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, mz(BEACH_ROAD_Z)); ctx.lineTo(S, mz(BEACH_ROAD_Z)); ctx.stroke();
  ctx.fillStyle = '#3a3f4d';
  ctx.fillRect(mx(186), mz(-78), mx(246) - mx(186), mz(78) - mz(-78));
  // Beacon objektif berdenyut.
  if (G.objective) {
    const pulse = 3.4 + Math.sin(G.elapsed * 5) * 1.4;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(mx(G.objective.x), mz(G.objective.z), pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // Polisi berkedip merah/biru.
  const blink = Math.floor(G.elapsed * 3) % 2 === 0;
  for (const car of G.cars) {
    if (!car.police) continue;
    ctx.fillStyle = blink ? '#ff4444' : '#4488ff';
    ctx.beginPath();
    ctx.arc(mx(car.mesh.position.x), mz(car.mesh.position.z), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4488ff';
  for (const officer of G.officers) {
    if (officer.down) continue;
    ctx.beginPath();
    ctx.arc(mx(officer.mesh.position.x), mz(officer.mesh.position.z), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Panah pemain.
  const p = G.player.mesh.position;
  const heading = G.player.mode === 'car' ? G.player.heading : G.cam.yaw;
  ctx.save();
  ctx.translate(mx(p.x), mz(p.z));
  ctx.rotate(Math.PI - heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -5.4);
  ctx.lineTo(3.8, 4.4);
  ctx.lineTo(0, 2.4);
  ctx.lineTo(-3.8, 4.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

export function updateHud(G, dt) {
  el.cash.textContent = `$${G.cash.toLocaleString('en-US')}`;
  const stars = G.wanted.stars;
  el.stars.textContent = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars);
  el.stars.style.color = stars > 0 ? '#ffd94d' : 'rgba(255,255,255,0.25)';
  el.clock.textContent = fmtClock(G.timeMin);
  el.district.textContent = G.district;
  el.healthfill.style.width = `${Math.max(0, G.health)}%`;
  el.healthfill.style.background = G.health > 30 ? '#53d769' : '#e23b2e';
  el.weapon.textContent = G.combat.weapon === 'fist' ? 'FIST' : `PISTOL ${G.combat.ammo} / ${G.combat.reserve}${G.combat.reloading > 0 ? ' …' : ''}`;
  if (G.player.mode === 'car' && G.player.car) {
    el.speedo.style.display = 'block';
    el.speedo.textContent = `${Math.round(Math.abs(G.player.car.speed) * 3.6)} km/h`;
  } else {
    el.speedo.style.display = 'none';
  }
  if (G.objective) {
    const p = G.player.mesh.position;
    const dist = Math.hypot(G.objective.x - p.x, G.objective.z - p.z);
    el.objective.style.display = 'block';
    el.objective.textContent = `${G.objective.label} · ${Math.round(dist)} m`;
  } else {
    el.objective.style.display = 'none';
  }
  el.prompt.style.display = G.prompt ? 'block' : 'none';
  if (G.prompt) el.prompt.textContent = G.prompt;
  if (G.dialog) {
    el.dialog.style.display = 'block';
    el['dialog-name'].textContent = G.dialog.name;
    el['dialog-text'].textContent = G.dialog.lines[G.dialog.index];
  } else {
    el.dialog.style.display = 'none';
  }
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) el.banner.style.display = 'none'; }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.toast.style.display = 'none'; }
  el['bust-wrap'].style.display = G.wanted.bust > 0.02 ? 'block' : 'none';
  el['bust-fill'].style.width = `${G.wanted.bust * 100}%`;
  if (G.events.hurtFlash > 0) {
    G.events.hurtFlash -= dt;
    el.flash.style.opacity = String(Math.min(0.45, G.events.hurtFlash * 1.6));
  } else {
    el.flash.style.opacity = '0';
  }
  drawMinimap(G);
}
