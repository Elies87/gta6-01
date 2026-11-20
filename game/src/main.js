// main.js — titik masuk PALMERA — Neon Tide City. Merakit semua sistem (kota, lalu lintas,
// pejalan kaki, pemain, polisi, combat, misi, HUD), menjalankan loop, menerjemahkan input
// keyboard/mouse, mengurus layar judul/jeda/busted/wasted, autosave, mode screenshot
// deterministik (?shot=), dan kait debug window.__palmera untuk pengujian otomatis.

import * as THREE from 'three';
import { buildCity, districtAt, LANDMARKS } from './city.js';
import { makeRng } from './rng.js';
import { spawnTraffic, spawnParked, updateTraffic } from './vehicles.js';
import { spawnPedestrians, updatePedestrians } from './people.js';
import { createPlayer, updatePlayer, updateCamera, tryEnterCar, exitCar } from './player.js';
import { updatePolice, spawnOfficerAt, starsForHeat } from './police.js';
import { createCombat, playerAttack, reloadWeapon, updateCombat, hurtPlayer } from './combat.js';
import { initQuests, updateQuests, talkToMira, advanceDialog } from './quests.js';
import { initHud, updateHud, showScreen, showBanner, showToast } from './hud.js';
import { readSave, writeSave, clearSave } from './save.js';
import { applyShotPose } from './shots.js';
import { Sound } from './audio.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1) >>> 0;
const shotName = params.get('shot');

const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(90, 42, 130);
camera.lookAt(0, 4, 0);

const rng = makeRng(seed);
const { colliders } = buildCity(scene, rng);

const G = {
  scene, camera, renderer, rng, colliders,
  elapsed: 0, mode: 'title', timeMin: 18 * 60 + 24,
  cash: 120, health: 100, missionIndex: 0, storyDone: false,
  wanted: { heat: 0, stars: 0, unseenFor: 0, bust: 0, spawnCooldown: 0, officerCooldown: 0 },
  combat: createCombat(),
  player: null, cars: [], peds: [], officers: [], thugs: [], mira: null, beacon: null, quest: null,
  objective: null, prompt: '', dialog: null, district: 'Downtown', danger: null,
  events: { busted: false, wasted: false, hurtFlash: 0 },
  input: { forward: false, back: false, left: false, right: false, run: false },
  cam: { yaw: Math.PI, pitch: 0.22 },
  shotCam: null,
};
G.player = createPlayer(scene);
G.cars = [...spawnTraffic(scene, rng, 20), ...spawnParked(scene, rng, 16)];
G.peds = spawnPedestrians(scene, rng, 42);
initQuests(G);
initHud();
G.hurtPlayer = (dmg) => hurtPlayer(G, dmg);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- alur permainan ----------

function resetWanted() {
  G.wanted.heat = 0;
  G.wanted.stars = 0;
  G.wanted.bust = 0;
  G.wanted.unseenFor = 0;
}

function clearPolicePresence() {
  for (const officer of G.officers) scene.remove(officer.mesh);
  G.officers = [];
  G.cars = G.cars.filter((car) => {
    if (car.police) { scene.remove(car.mesh); return false; }
    return true;
  });
}

function placePlayerOnFoot(x, z) {
  if (G.player.car) {
    G.player.car.playerDriven = false;
    G.player.car = null;
  }
  G.player.mode = 'foot';
  G.player.mesh.visible = true;
  G.player.mesh.position.set(x, 0.3, z);
}

function newGame() {
  clearSave();
  clearPolicePresence();
  for (const thug of G.thugs) scene.remove(thug.mesh);
  G.thugs = [];
  if (G.quest.targetCar) {
    scene.remove(G.quest.targetCar.mesh);
    G.cars.splice(G.cars.indexOf(G.quest.targetCar), 1);
  }
  G.quest.step = 'idle';
  G.quest.targetCar = null;
  G.cash = 120;
  G.health = 100;
  G.missionIndex = 0;
  G.storyDone = false;
  G.combat = createCombat();
  G.timeMin = 18 * 60 + 24;
  resetWanted();
  placePlayerOnFoot(24, 20);
  G.mode = 'playing';
  showScreen(null);
  showBanner('PALMERA', 'See Mira at her garage — follow the gold marker');
  writeSave(G);
  Sound.unlock();
}

function continueGame() {
  const save = readSave();
  if (!save) return;
  clearPolicePresence();
  G.cash = save.cash;
  G.missionIndex = save.missionIndex;
  G.storyDone = !!save.storyDone;
  G.health = save.health > 0 ? save.health : 100;
  G.combat = createCombat();
  G.combat.ammo = save.ammo;
  G.combat.reserve = save.reserve;
  G.timeMin = save.timeMin || G.timeMin;
  resetWanted();
  placePlayerOnFoot(save.px ?? 24, save.pz ?? 20);
  G.mode = 'playing';
  showScreen(null);
  showToast('Save loaded — welcome back to Palmera');
  Sound.unlock();
}

function respawnAt(point, mode) {
  clearPolicePresence();
  resetWanted();
  G.health = 100;
  placePlayerOnFoot(point.x, point.z);
  G.mode = 'playing';
  showScreen(null);
}

let overlayTimer = null;
function triggerBusted() {
  G.mode = 'busted';
  showScreen('busted');
  Sound.jingle(false);
  overlayTimer = setTimeout(() => respawnAt(LANDMARKS.police.respawn, 'busted'), 2600);
}
function triggerWasted() {
  G.mode = 'wasted';
  showScreen('wasted');
  Sound.jingle(false);
  G.cash = Math.max(0, G.cash - Math.floor(G.cash * 0.1));
  overlayTimer = setTimeout(() => respawnAt(LANDMARKS.hospital.respawn, 'wasted'), 2600);
}

// ---------- input ----------

const KEYMAP = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run' };

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code] !== undefined) {
    G.input[KEYMAP[e.code]] = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  }
  if (e.code === 'Space') e.preventDefault();
  if (G.mode !== 'playing') return;
  Sound.unlock();
  if (e.code === 'KeyE' || e.code === 'Space') {
    if (G.dialog) advanceDialog(G);
    else if (nearMira()) talkToMira(G);
  } else if (e.code === 'KeyF') {
    if (G.player.mode === 'car') exitCar(G);
    else tryEnterCar(G);
  } else if (e.code === 'Digit1') G.combat.weapon = 'fist';
  else if (e.code === 'Digit2') G.combat.weapon = 'pistol';
  else if (e.code === 'KeyR') reloadWeapon(G);
  else if (e.code === 'KeyJ') playerAttack(G);
  else if (e.code === 'KeyM') {
    Sound.setMuted(!Sound.isMuted());
    showToast(Sound.isMuted() ? 'Sound off' : 'Sound on');
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    G.mode = 'paused';
    showScreen('pause');
  }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] !== undefined) G.input[KEYMAP[e.code]] = false;
});

let dragging = false;
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  Sound.unlock();
  if (G.mode === 'playing' && !G.dialog && e.button === 0) playerAttack(G);
  if (G.mode === 'playing' && renderer.domElement.requestPointerLock) {
    try { renderer.domElement.requestPointerLock(); } catch { /* headless: abaikan */ }
  }
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && !dragging) return;
  if (G.mode !== 'playing') return;
  G.cam.yaw -= (e.movementX || 0) * 0.0032;
  G.cam.pitch = Math.max(-0.05, Math.min(0.85, G.cam.pitch + (e.movementY || 0) * 0.0026));
});

function nearMira() {
  return G.mira && G.player.mesh.position.distanceTo(G.mira.mesh.position) < 3.4;
}

function refreshPrompt() {
  if (G.mode !== 'playing') { G.prompt = ''; return; }
  if (G.dialog) { G.prompt = '[E] Continue'; return; }
  if (G.player.mode === 'car') { G.prompt = '[F] Exit car'; return; }
  if (nearMira()) { G.prompt = '[E] Talk to Mira'; return; }
  const pos = G.player.mesh.position;
  for (const car of G.cars) {
    if (!car.playerDriven && car.mesh.position.distanceTo(pos) < 3.4) {
      G.prompt = car.driver ? '[F] Steal car' : '[F] Enter car';
      return;
    }
  }
  G.prompt = '';
}

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
document.getElementById('btn-resume').addEventListener('click', () => { G.mode = 'playing'; showScreen(null); });
document.getElementById('btn-save').addEventListener('click', () => { if (writeSave(G)) showToast('Saved'); });
document.getElementById('btn-title').addEventListener('click', () => { G.mode = 'title'; showScreen('title'); });

// ---------- loop ----------

let last = performance.now();
let autosaveFor = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode === 'shot' || G.mode === 'shot-title') {
    if (G.shotCam) {
      camera.position.set(...G.shotCam.pos);
      camera.lookAt(...G.shotCam.look);
    }
    updateHud(G, 0.016);
    renderer.render(scene, camera);
    G.framesRendered = (G.framesRendered || 0) + 1;
    if (G.framesRendered >= 3) window.__shotReady = true;
    return;
  }
  G.elapsed += dt;
  G.timeMin = (G.timeMin + dt * 2) % (24 * 60);
  if (G.mode === 'title') {
    updateTraffic(G, dt);
    updatePedestrians(G, dt);
    updateCamera(G, dt);
    renderer.render(scene, camera);
    return;
  }
  if (G.mode !== 'playing') {
    renderer.render(scene, camera);
    return;
  }
  if (!G.dialog) updatePlayer(G, dt);
  updateTraffic(G, dt);
  updatePedestrians(G, dt);
  updatePolice(G, dt);
  updateCombat(G, dt);
  updateQuests(G, dt);
  updateCamera(G, dt);
  refreshPrompt();
  const district = districtAt(G.player.mesh.position.x, G.player.mesh.position.z);
  G.district = district;
  autosaveFor += dt;
  if (autosaveFor > 30) { autosaveFor = 0; writeSave(G); }
  updateHud(G, dt);
  renderer.render(scene, camera);
  if (G.events.busted) { G.events.busted = false; triggerBusted(); }
  else if (G.events.wasted) { G.events.wasted = false; triggerWasted(); }
}

// ---------- kait pengujian & mode screenshot ----------

window.__palmera = {
  state() {
    const p = G.player.mesh.position;
    return {
      mode: G.mode, cash: G.cash, health: G.health, missionIndex: G.missionIndex, storyDone: G.storyDone,
      stars: G.wanted.stars, heat: Math.round(G.wanted.heat), bust: G.wanted.bust,
      playerMode: G.player.mode, px: Math.round(p.x * 10) / 10, pz: Math.round(p.z * 10) / 10,
      speedKmh: G.player.car ? Math.round(Math.abs(G.player.car.speed) * 3.6) : 0,
      questStep: G.quest.step, objective: G.objective ? G.objective.label : null,
      dialogOpen: !!G.dialog, elapsed: Math.round(G.elapsed),
      pedCount: G.peds.length, carCount: G.cars.length, officerCount: G.officers.length,
      thugsDown: G.thugs.filter((t) => t.down).length,
      weapon: G.combat.weapon, ammo: G.combat.ammo,
      save: readSave(),
    };
  },
  newGame, continueGame,
  teleport(x, z) {
    const target = G.player.mode === 'car' && G.player.car ? G.player.car.mesh.position : G.player.mesh.position;
    target.set(x, 0.3, z);
    if (G.player.mode !== 'car') G.player.mesh.position.set(x, 0.3, z);
  },
  pressE() {
    if (G.dialog) advanceDialog(G);
    else talkToMira(G);
  },
  pressF() {
    if (G.player.mode === 'car') { exitCar(G); return null; }
    const car = tryEnterCar(G);
    return car ? { kind: car.kind, missionCar: car.missionCar } : null;
  },
  attack() { playerAttack(G); },
  setWeapon(w) { G.combat.weapon = w; },
  setStars(n) {
    const thresholds = [0, 20, 45, 75, 110, 150];
    G.wanted.heat = thresholds[n] || 0;
    G.wanted.stars = starsForHeat(G.wanted.heat);
  },
  clearWanted() { resetWanted(); clearPolicePresence(); },
  spawnOfficer() { const p = G.player.mesh.position; spawnOfficerAt(G, p.x + 1.6, p.z); },
  setHealth(n) { G.health = n; },
  nearestPed() {
    let best = null; let bd = 1e9;
    for (const ped of G.peds) { const d = ped.mesh.position.distanceTo(G.player.mesh.position); if (d < bd) { bd = d; best = ped; } }
    return best ? { x: best.mesh.position.x, z: best.mesh.position.z, hp: best.hp, down: best.down } : null;
  },
  pedHp() {
    const ped = G.peds.find((p) => !p.down);
    return ped ? { hp: ped.hp, down: ped.down } : null;
  },
  thugInfo() {
    return G.thugs.map((t) => ({ x: Math.round(t.mesh.position.x), z: Math.round(t.mesh.position.z), hp: t.hp, down: t.down }));
  },
  face(x, z) {
    const p = G.player.mesh.position;
    G.player.heading = Math.atan2(x - p.x, z - p.z);
    G.player.mesh.rotation.y = G.player.heading;
  },
  hurt(n) { hurtPlayer(G, n); },
  carInfo() {
    const car = G.player.car;
    if (!car) return null;
    return {
      kind: car.kind, stolen: car.stolen, chopPaid: car.chopPaid, missionCar: car.missionCar,
      x: Math.round(car.mesh.position.x), z: Math.round(car.mesh.position.z),
      questStep: G.quest.step, missionIndex: G.missionIndex,
    };
  },
  nearestCar() {
    let best = null; let bd = 1e9;
    for (const car of G.cars) {
      if (car.police || car.playerDriven) continue;
      const d = car.mesh.position.distanceTo(G.player.mesh.position);
      if (d < bd) { bd = d; best = car; }
    }
    return best ? { x: Math.round(best.mesh.position.x), z: Math.round(best.mesh.position.z), kind: best.kind, parked: best.parked, stolen: best.stolen } : null;
  },
  teleportNearPed() {
    const ped = G.peds.find((p) => !p.down);
    if (!ped) return null;
    G.player.mesh.position.set(ped.mesh.position.x - 1.2, 0.3, ped.mesh.position.z);
    G.player.heading = Math.atan2(1.2, 0);
    G.player.mesh.rotation.y = G.player.heading;
    return { hp: ped.hp };
  },
};

if (shotName) {
  const ok = applyShotPose(G, shotName);
  G.mode = shotName === 'title' ? 'shot-title' : 'shot';
  showScreen(shotName === 'title' ? 'title' : null);
  if (!ok) G.mode = 'title';
} else {
  showScreen('title');
}
requestAnimationFrame(frame);
