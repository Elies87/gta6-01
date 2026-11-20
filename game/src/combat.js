// combat.js — pertarungan pemain: tinju (klik / J) dan pistol hitscan (klik saat senjata
// pistol, R untuk reload, 1/2 ganti senjata), plus pemeriksaan tabrak-lari saat mengemudi.
// Setiap serangan yang disaksikan dilaporkan ke sistem wanted; tembakan juga membuat
// pejalan kaki sekitar kabur ketakutan.

import { reportCrime } from './police.js';
import { Sound } from './audio.js';

export function createCombat() {
  return { weapon: 'fist', ammo: 12, reserve: 60, cooldown: 0, reloading: 0 };
}

export function hurtPlayer(G, dmg) {
  if (G.mode !== 'playing' || G.health <= 0) return;
  G.health = Math.max(0, G.health - dmg);
  G.events.hurtFlash = 0.3;
  if (G.health <= 0) G.events.wasted = true;
}

export function damagePerson(G, person, dmg, crimeKind) {
  if (person.down || person.role === 'mira') return;
  person.hp -= dmg;
  if (person.role === 'thug') person.aggro = true;
  if (person.hp <= 0) {
    person.down = true;
    person.moveSpeed = 0;
    if (crimeKind) reportCrime(G, 'kill', person.mesh.position);
    return;
  }
  if (crimeKind === 'assault') reportCrime(G, 'assault', person.mesh.position);
  if (person.role === 'ped') G.danger = { pos: person.mesh.position.clone(), t: G.elapsed };
}

function allPeople(G) {
  return [...G.peds, ...G.officers, ...G.thugs];
}

function personInFront(G, range, arcCos) {
  const pos = G.player.mesh.position;
  const hx = Math.sin(G.player.heading);
  const hz = Math.cos(G.player.heading);
  let best = null;
  let bestDist = range;
  for (const person of allPeople(G)) {
    if (person.down || person.role === 'mira') continue;
    const dx = person.mesh.position.x - pos.x;
    const dz = person.mesh.position.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || dist < 0.01) continue;
    const dot = (dx * hx + dz * hz) / dist;
    if (dot > arcCos && dist < bestDist) { best = person; bestDist = dist; }
  }
  return best;
}

export function playerAttack(G) {
  const combat = G.combat;
  if (combat.cooldown > 0 || combat.reloading > 0 || G.player.mode !== 'foot') return;
  if (combat.weapon === 'fist') {
    combat.cooldown = 0.38;
    G.player.punchAnim = 1;
    const target = personInFront(G, 2.3, 0.2);
    if (target) {
      Sound.punch();
      damagePerson(G, target, 34, 'assault');
      // Korban terpental sedikit.
      const dx = target.mesh.position.x - G.player.mesh.position.x;
      const dz = target.mesh.position.z - G.player.mesh.position.z;
      const d = Math.hypot(dx, dz) || 1;
      target.mesh.position.x += (dx / d) * 0.7;
      target.mesh.position.z += (dz / d) * 0.7;
    }
    return;
  }
  // Pistol: hitscan sepanjang arah kamera.
  if (combat.ammo <= 0) {
    Sound.click();
    reloadWeapon(G);
    return;
  }
  combat.cooldown = 0.3;
  combat.ammo--;
  Sound.shot();
  reportCrime(G, 'shoot', G.player.mesh.position);
  G.danger = { pos: G.player.mesh.position.clone(), t: G.elapsed };
  const pos = G.player.mesh.position;
  const dx = Math.sin(G.cam.yaw);
  const dz = Math.cos(G.cam.yaw);
  let best = null;
  let bestT = 48;
  for (const person of allPeople(G)) {
    if (person.down || person.role === 'mira') continue;
    const rx = person.mesh.position.x - pos.x;
    const rz = person.mesh.position.z - pos.z;
    const t = rx * dx + rz * dz;
    if (t < 0.5 || t > bestT) continue;
    const perp = Math.abs(rx * dz - rz * dx);
    if (perp < 0.95) { best = person; bestT = t; }
  }
  if (best) damagePerson(G, best, 55, 'shoot');
}

export function reloadWeapon(G) {
  const combat = G.combat;
  if (combat.reloading > 0 || combat.ammo >= 12 || combat.reserve <= 0) return;
  combat.reloading = 1.2;
}

export function updateCombat(G, dt) {
  const combat = G.combat;
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  if (combat.reloading > 0) {
    combat.reloading -= dt;
    if (combat.reloading <= 0) {
      const take = Math.min(12 - combat.ammo, combat.reserve);
      combat.ammo += take;
      combat.reserve -= take;
    }
  }
  // Tabrak-lari: mobil pemain yang melaju menabrak orang.
  if (G.player.mode === 'car' && G.player.car && Math.abs(G.player.car.speed) > 4) {
    const car = G.player.car;
    for (const person of allPeople(G)) {
      if (person.down || person.role === 'mira') continue;
      person.hitCooldown = Math.max(0, (person.hitCooldown || 0) - dt);
      if (person.hitCooldown > 0) continue;
      if (person.mesh.position.distanceTo(car.mesh.position) < 2.2) {
        person.hitCooldown = 1;
        damagePerson(G, person, 70, 'hitrun');
        if (person.role !== 'officer') reportCrime(G, 'hitrun', car.mesh.position);
        Sound.crash(0.4);
        car.speed *= 0.55;
      }
    }
  }
}
