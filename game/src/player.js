// player.js — pemain: figur yang berjalan/berlari dengan kamera orbit mouse, dan mengemudi
// dengan model arcade (gas/rem/setir). Tabrakan lingkaran-vs-AABB melawan collider gedung.
// Masuk/keluar mobil ada di sini juga: F di dekat mobil traffic melempar pengemudinya keluar
// (ia kabur) dan mencatat kejahatan pencurian; mobil parkir langsung diambil.

import * as THREE from 'three';
import { WORLD } from './city.js';
import { makePersonMesh, posePerson, createPerson, blockLoop } from './people.js';
import { reportCrime } from './police.js';
import { Sound } from './audio.js';

export function createPlayer(scene) {
  const mesh = makePersonMesh({ shirt: 0x2ec2b8, pants: 0x2c3242, skin: 0xd9a066, cap: 0xc23b2e });
  mesh.position.set(24, 0.3, 20);
  scene.add(mesh);
  return {
    mesh, hp: 100, down: false, moveSpeed: 0, walkPhase: 0, heading: Math.PI, punchAnim: 0,
    mode: 'foot', car: null, role: 'player',
  };
}

// Dorong lingkaran (pos, radius) keluar dari semua AABB collider. Mengembalikan true bila menabrak.
export function pushOut(pos, radius, colliders) {
  let hit = false;
  for (const box of colliders) {
    const nearestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
    const nearestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
    const dx = pos.x - nearestX;
    const dz = pos.z - nearestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nearestX + (dx / d) * radius;
      pos.z = nearestZ + (dz / d) * radius;
    } else {
      // Pusat di dalam kotak: dorong lewat sisi terdekat.
      const left = pos.x - box.minX;
      const right = box.maxX - pos.x;
      const top = pos.z - box.minZ;
      const bottom = box.maxZ - pos.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) pos.x = box.minX - radius;
      else if (min === right) pos.x = box.maxX + radius;
      else if (min === top) pos.z = box.minZ - radius;
      else pos.z = box.maxZ + radius;
    }
  }
  return hit;
}

export function clampWorld(pos, margin) {
  pos.x = Math.max(WORLD.minX + margin, Math.min(WORLD.maxX - margin, pos.x));
  pos.z = Math.max(WORLD.minZ + margin, Math.min(WORLD.maxZ - margin, pos.z));
}

function turnToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

export function tryEnterCar(G) {
  const pos = G.player.mesh.position;
  let best = null;
  let bestDist = 3.4;
  for (const car of G.cars) {
    if (car.playerDriven) continue;
    const d = car.mesh.position.distanceTo(pos);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  if (!best) return null;
  if (best.driver && best.driver.traffic) {
    // Pengemudi traffic dilempar keluar dan kabur sebagai pejalan kaki.
    const driver = createPerson(G.rng, best.mesh.position.x + 2, best.mesh.position.z);
    driver.path = blockLoop(G.rng);
    driver.wp = 0;
    G.scene.add(driver.mesh);
    G.peds.push(driver);
    G.danger = { pos: best.mesh.position.clone(), t: G.elapsed };
    best.driver = null;
  }
  if (!best.stolen) {
    best.stolen = true;
    reportCrime(G, 'theft', best.mesh.position);
  }
  best.rail = null;
  best.parked = false;
  best.playerDriven = true;
  best.speed = 0;
  G.player.mode = 'car';
  G.player.car = best;
  G.player.mesh.visible = false;
  G.cam.yaw = best.heading;
  Sound.click();
  return best;
}

export function exitCar(G) {
  const car = G.player.car;
  if (!car) return;
  const right = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  const pos = G.player.mesh.position;
  pos.copy(car.mesh.position).addScaledVector(right, 2.3);
  pos.y = 0.3;
  pushOut(pos, 0.5, G.colliders);
  clampWorld(pos, 1);
  car.playerDriven = false;
  car.speed = 0;
  G.player.mode = 'foot';
  G.player.car = null;
  G.player.mesh.visible = true;
  G.player.heading = car.heading;
  Sound.click();
}

export function updatePlayer(G, dt) {
  const player = G.player;
  const input = G.input;
  if (player.mode === 'car' && player.car) {
    const car = player.car;
    const accel = input.forward ? 15 : 0;
    const brake = input.back ? (car.speed > 0.5 ? 22 : -8) : 0;
    car.speed += (accel + brake) * dt;
    if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4.5 * dt);
    car.speed = Math.max(-9, Math.min(37, car.speed));
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (Math.abs(car.speed) > 0.2) {
      const steerRate = steerInput * 1.55 * Math.min(1, Math.abs(car.speed) / 9) * Math.sign(car.speed);
      car.heading += steerRate * dt;
    }
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    car.mesh.position.x += fx * car.speed * dt;
    car.mesh.position.z += fz * car.speed * dt;
    const impact = Math.abs(car.speed);
    if (pushOut(car.mesh.position, car.radius, G.colliders)) {
      if (impact > 9) Sound.crash(Math.min(1, impact / 30));
      car.speed *= 0.35;
    }
    clampWorld(car.mesh.position, 2);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.4;
    for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
    player.mesh.position.copy(car.mesh.position);
    player.heading = car.heading;
    player.moveSpeed = 0;
    Sound.engine(Math.abs(car.speed) / 37, true);
    return;
  }
  Sound.engine(0, false);
  // Jalan kaki: arah dari kamera (W = menjauhi kamera).
  const sin = Math.sin(G.cam.yaw);
  const cos = Math.cos(G.cam.yaw);
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += sin; mz += cos; }
  if (input.back) { mx -= sin; mz -= cos; }
  if (input.left) { mx += cos; mz -= sin; }
  if (input.right) { mx -= cos; mz += sin; }
  const len = Math.hypot(mx, mz);
  const running = input.run;
  const speed = len > 0 ? (running ? 7.6 : 4.3) : 0;
  if (len > 0) {
    mx /= len;
    mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    player.heading = turnToward(player.heading, targetHeading, dt * 11);
    player.mesh.position.x += mx * speed * dt;
    player.mesh.position.z += mz * speed * dt;
    pushOut(player.mesh.position, 0.45, G.colliders);
    clampWorld(player.mesh.position, 1);
  }
  player.moveSpeed = speed;
  player.mesh.rotation.y = player.heading;
  posePerson(player, dt);
}

const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();

export function updateCamera(G, dt) {
  const cam = G.cam;
  const player = G.player;
  if (G.mode === 'title' || G.mode === 'shot-title') {
    const t = G.elapsed * 0.045;
    G.camera.position.set(Math.sin(t) * 120, 42, Math.cos(t) * 120 + 10);
    G.camera.lookAt(0, 6, 10);
    return;
  }
  if (player.mode === 'car' && player.car) {
    const car = player.car;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    camDesired.set(car.mesh.position.x - fx * 10.5, 3.6, car.mesh.position.z - fz * 10.5);
    camTarget.set(car.mesh.position.x + fx * 9, 1.4, car.mesh.position.z + fz * 9);
    cam.yaw = car.heading;
  } else {
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    const p = player.mesh.position;
    camDesired.set(p.x - fx * 7.6, 2.1 + cam.pitch * 5.2, p.z - fz * 7.6);
    camTarget.set(p.x, 1.55, p.z);
  }
  const blend = 1 - Math.exp(-dt * (player.mode === 'car' ? 4.2 : 7));
  G.camera.position.lerp(camDesired, blend);
  G.camera.lookAt(camTarget);
}
