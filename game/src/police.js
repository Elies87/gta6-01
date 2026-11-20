// police.js — sistem wanted dan respons polisi. Kejahatan yang disaksikan menambah "panas";
// panas menentukan bintang 0-5. Mobil polisi muncul dari jalan terdekat, mengejar dan
// menabrak; petugas turun berjalan kaki pada bintang >= 2, menembak pada bintang >= 3, dan
// mengisi meteran BUSTED bila cukup dekat dengan pemain yang lambat/diam. Panas meluruh
// bila tak ada polisi/saksi yang melihat pemain selama beberapa detik.

import * as THREE from 'three';
import { AVENUES, STREETS } from './city.js';
import { createVehicle } from './vehicles.js';
import { makePersonMesh, posePerson } from './people.js';
import { pushOut, clampWorld } from './player.js';
import { Sound } from './audio.js';

export const CRIME_HEAT = { theft: 26, assault: 18, shoot: 14, kill: 42, hitrun: 36, ram: 30 };
const STAR_THRESHOLDS = [20, 45, 75, 110, 150];

export function starsForHeat(heat) {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (heat >= t) stars++;
  return stars;
}

function isWitnessed(G, pos) {
  for (const ped of G.peds) if (!ped.down && ped.mesh.position.distanceTo(pos) < 30) return true;
  for (const officer of G.officers) if (!officer.down && officer.mesh.position.distanceTo(pos) < 45) return true;
  for (const car of G.cars) if (car.police && car.mesh.position.distanceTo(pos) < 45) return true;
  return false;
}

export function reportCrime(G, kind, pos) {
  const base = CRIME_HEAT[kind] || 10;
  const witnessed = isWitnessed(G, pos);
  G.wanted.heat = Math.min(175, G.wanted.heat + (witnessed ? base : base * 0.4));
  G.wanted.stars = starsForHeat(G.wanted.heat);
  if (kind !== 'shoot') G.danger = { pos: pos.clone(), t: G.elapsed };
}

function nearestRoadPoint(rng, x, z, dist) {
  // Titik di jalan lurus terdekat sejauh dist dari pemain, untuk spawn polisi di luar pandangan dekat.
  const angle = rng.range(0, Math.PI * 2);
  const tx = x + Math.sin(angle) * dist;
  const tz = z + Math.cos(angle) * dist;
  let bestX = tx;
  let bestD = Infinity;
  for (const a of AVENUES) { const d = Math.abs(tx - a); if (d < bestD) { bestD = d; bestX = a; } }
  let bestZ = tz;
  bestD = Infinity;
  for (const s of STREETS) { const d = Math.abs(tz - s); if (d < bestD) { bestD = d; bestZ = s; } }
  return Math.abs(tx - bestX) < Math.abs(tz - bestZ) ? { x: bestX, z: tz } : { x: tx, z: bestZ };
}

export function spawnOfficerAt(G, x, z) {
  const mesh = makePersonMesh({ shirt: 0x27364f, pants: 0x1d2534, skin: 0xd9a066, cap: 0x27364f });
  mesh.position.set(x, 0.3, z);
  G.scene.add(mesh);
  const officer = {
    mesh, hp: 100, down: false, moveSpeed: 0, walkPhase: G.rng.range(0, 6), heading: 0,
    state: 'chase', role: 'officer', aggro: true, shotAt: 0, punchAnim: 0,
  };
  G.officers.push(officer);
  return officer;
}

function spawnPoliceCar(G) {
  const p = G.player.mesh.position;
  const spot = nearestRoadPoint(G.rng, p.x, p.z, G.rng.range(62, 82));
  const car = createVehicle('police', 0xf2f2f2, spot.x, spot.z, 0);
  car.cruise = 33;
  G.scene.add(car.mesh);
  G.cars.push(car);
  return car;
}

function despawnPoliceCar(G, car) {
  G.scene.remove(car.mesh);
  G.cars.splice(G.cars.indexOf(car), 1);
}

function steerToward(G, car, target, dt, maxSpeed) {
  const pos = car.mesh.position;
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-1.9 * dt, Math.min(1.9 * dt, diff));
  const want = dist > 7 ? maxSpeed : maxSpeed * 0.45;
  car.speed += Math.sign(want - car.speed) * Math.min(Math.abs(want - car.speed), 11 * dt);
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;
  if (pushOut(pos, car.radius, G.colliders)) car.speed *= 0.5;
  clampWorld(pos, 2);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.4;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
  return dist;
}

export function updatePolice(G, dt) {
  const wanted = G.wanted;
  const playerPos = G.player.mesh.position;
  // Peluruhan panas bila tak terlihat.
  let seen = false;
  for (const officer of G.officers) if (!officer.down && officer.mesh.position.distanceTo(playerPos) < 42) seen = true;
  for (const car of G.cars) if (car.police && car.mesh.position.distanceTo(playerPos) < 48) seen = true;
  if (seen) wanted.unseenFor = 0;
  else {
    wanted.unseenFor += dt;
    if (wanted.unseenFor > 6 && wanted.heat > 0) {
      wanted.heat = Math.max(0, wanted.heat - 5.5 * dt);
      wanted.stars = starsForHeat(wanted.heat);
    }
  }

  const policeCars = G.cars.filter((c) => c.police);
  const desiredCars = wanted.stars === 0 ? 0 : Math.min(1 + wanted.stars, 4);
  if (policeCars.length < desiredCars && (wanted.spawnCooldown -= dt) <= 0) {
    spawnPoliceCar(G);
    wanted.spawnCooldown = 2.5;
  }
  let nearestCopDist = Infinity;
  for (const car of policeCars) {
    const dist = car.mesh.position.distanceTo(playerPos);
    nearestCopDist = Math.min(nearestCopDist, dist);
    if (wanted.stars === 0 && dist > 90) { despawnPoliceCar(G, car); continue; }
    if (wanted.stars > 0) {
      steerToward(G, car, playerPos, dt, 33);
      // Tabrak mobil pemain.
      if (G.player.mode === 'car' && G.player.car && dist < 3.6 && Math.abs(car.speed) > 6) {
        const victim = G.player.car;
        victim.mesh.position.x += Math.sin(car.heading) * 1.4;
        victim.mesh.position.z += Math.cos(car.heading) * 1.4;
        victim.speed *= 0.55;
        Sound.crash(0.5);
        reportCrime(G, 'ram', playerPos);
      }
      // Petugas turun bila dekat dan bintang cukup.
      if (wanted.stars >= 2 && dist < 24 && G.officers.length < 3 && (wanted.officerCooldown -= dt) <= 0) {
        spawnOfficerAt(G, car.mesh.position.x + 2, car.mesh.position.z + 1);
        wanted.officerCooldown = 5;
      }
    } else {
      steerToward(G, car, { x: car.mesh.position.x + Math.sin(car.heading) * 30, z: car.mesh.position.z + Math.cos(car.heading) * 30 }, dt, 14);
    }
    // Rotator berkedip.
    const phase = Math.floor(G.elapsed * 4) % 2 === 0;
    car.mesh.userData.lightRed.material.color.setHex(phase ? 0xff2222 : 0x661111);
    car.mesh.userData.lightBlue.material.color.setHex(phase ? 0x112266 : 0x2266ff);
  }
  Sound.siren(nearestCopDist < 55 && wanted.stars > 0, G.elapsed * 0.9);

  // Petugas jalan kaki: kejar, tembak (bintang >= 3), dan isi meteran bust.
  let busting = false;
  for (const officer of [...G.officers]) {
    if (officer.down) { posePerson(officer, dt); continue; }
    const pos = officer.mesh.position;
    const dist = pos.distanceTo(playerPos);
    if (wanted.stars === 0 && dist > 70) {
      G.scene.remove(officer.mesh);
      G.officers.splice(G.officers.indexOf(officer), 1);
      continue;
    }
    if (dist > 1.9) {
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      officer.heading = Math.atan2(dx, dz);
      const speed = 5.4;
      pos.x += (dx / d) * speed * dt;
      pos.z += (dz / d) * speed * dt;
      pushOut(pos, 0.45, G.colliders);
      officer.moveSpeed = speed;
    } else {
      officer.moveSpeed = 0;
    }
    officer.mesh.rotation.y = officer.heading;
    if (wanted.stars >= 3 && dist < 36 && dist > 2.2 && G.elapsed - officer.shotAt > 1.5) {
      officer.shotAt = G.elapsed;
      Sound.shot();
      if (G.rng.chance(0.5)) G.hurtPlayer(G.rng.int(5, 9), 'officer');
    }
    const playerSlow = G.player.mode === 'foot' || Math.abs(G.player.car?.speed ?? 0) < 1.5;
    if (dist < 2.3 && playerSlow && wanted.stars > 0) busting = true;
    posePerson(officer, dt);
  }
  if (busting) wanted.bust = Math.min(1, wanted.bust + dt / 2.5);
  else wanted.bust = Math.max(0, wanted.bust - dt / 1.6);
  if (wanted.bust >= 1 && G.mode === 'playing') G.events.busted = true;
}
