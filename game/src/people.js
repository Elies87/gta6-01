// people.js — figur manusia low-poly dari primitif (badan, kepala, lengan/kaki berporos di
// bahu/pinggul agar bisa dianimasikan mengayun saat berjalan) dan sistem pejalan kaki:
// 42 warga berjalan mengitari blok di trotoar, sesekali berhenti mengobrol, dan melarikan
// diri dari bahaya (tembakan, kejahatan, mobil kencang) yang dicatat di G.danger.

import * as THREE from 'three';
import { AVENUES, STREETS, ROAD_HALF } from './city.js';
import { SHIRT_COLORS, PANTS_COLORS, SKIN_TONES } from './rng.js';

const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.19);
const armGeo = new THREE.BoxGeometry(0.14, 0.72, 0.16);
const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.28);
const headGeo = new THREE.BoxGeometry(0.3, 0.34, 0.3);
legGeo.translate(0, -0.39, 0);
armGeo.translate(0, -0.33, 0);

// Satu figur manusia menghadap +z. userData menyimpan referensi anggota badan untuk animasi.
export function makePersonMesh({ shirt, pants, skin, cap = null }) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.14, 0.8, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.14, 0.8, 0);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = 1.16;
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.34, 1.48, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.34, 1.48, 0);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.72;
  group.add(legL, legR, torso, armL, armR, head);
  if (cap !== null) {
    const capMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: cap }));
    capMesh.position.y = 1.92;
    group.add(capMesh);
  }
  group.userData.parts = { legL, legR, armL, armR, torso, head };
  return group;
}

// Ayunan jalan: fase bertambah sebanding kecepatan; pose jatuh untuk orang yang tumbang.
export function posePerson(person, dt) {
  const mesh = person.mesh;
  const parts = mesh.userData.parts;
  if (person.down) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.35;
    return;
  }
  mesh.rotation.x = 0;
  mesh.position.y = 0.3;
  const moving = person.moveSpeed > 0.2;
  person.walkPhase = (person.walkPhase || 0) + dt * (moving ? person.moveSpeed * 2.6 : 0);
  const swing = moving ? Math.sin(person.walkPhase) * 0.55 : 0;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8;
  parts.armR.rotation.x = swing * 0.8;
  if (person.punchAnim > 0) {
    person.punchAnim -= dt * 4;
    parts.armR.rotation.x = -1.9 * Math.max(0, person.punchAnim);
  }
}

export function createPerson(rng, x, z) {
  const mesh = makePersonMesh({
    shirt: rng.pick(SHIRT_COLORS),
    pants: rng.pick(PANTS_COLORS),
    skin: rng.pick(SKIN_TONES),
    cap: rng.chance(0.3) ? rng.pick(SHIRT_COLORS) : null,
  });
  mesh.position.set(x, 0.3, z);
  return {
    mesh, hp: 100, down: false, moveSpeed: 0, walkPhase: rng.range(0, 6),
    heading: 0, state: 'walk', role: 'ped', aggro: false,
    path: null, wp: 0, idleFor: 0, fleeUntil: 0, hitCooldown: 0, punchAnim: 0,
  };
}

// Loop trotoar: persegi mengitari satu blok, 2.2 m di luar tepi jalan.
export function blockLoop(rng) {
  const ai = rng.int(0, AVENUES.length - 2);
  const si = rng.int(0, STREETS.length - 2);
  const x0 = AVENUES[ai] + ROAD_HALF + 2.2;
  const x1 = AVENUES[ai + 1] - ROAD_HALF - 2.2;
  const z0 = STREETS[si] + ROAD_HALF + 2.2;
  const z1 = STREETS[si + 1] - ROAD_HALF - 2.2;
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

export function spawnPedestrians(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const ped = createPerson(rng, 0, 0);
    ped.path = blockLoop(rng);
    ped.wp = rng.int(0, 3);
    const [sx, sz] = ped.path[ped.wp];
    ped.mesh.position.set(sx + rng.range(-4, 4), 0.3, sz + rng.range(-4, 4));
    ped.speed = rng.range(1.1, 1.9);
    scene.add(ped.mesh);
    peds.push(ped);
  }
  return peds;
}

const tmpDir = new THREE.Vector3();

export function updatePedestrians(G, dt) {
  const now = G.elapsed;
  for (const ped of G.peds) {
    if (ped.down) { ped.moveSpeed = 0; posePerson(ped, dt); continue; }
    const pos = ped.mesh.position;
    let targetSpeed = 0;
    // Bahaya segar di dekatnya? Kabur menjauh.
    if (G.danger && now - G.danger.t < 3.5 && pos.distanceTo(G.danger.pos) < 26) {
      tmpDir.copy(pos).sub(G.danger.pos).setY(0).normalize();
      ped.heading = Math.atan2(tmpDir.x, tmpDir.z);
      targetSpeed = 4.6;
      pos.x += tmpDir.x * targetSpeed * dt;
      pos.z += tmpDir.z * targetSpeed * dt;
    } else if (ped.idleFor > 0) {
      ped.idleFor -= dt;
      targetSpeed = 0;
    } else {
      const [tx, tz] = ped.path[ped.wp];
      tmpDir.set(tx - pos.x, 0, tz - pos.z);
      const dist = tmpDir.length();
      if (dist < 0.7) {
        ped.wp = (ped.wp + 1) % ped.path.length;
        if (G.rng.chance(0.1)) ped.idleFor = G.rng.range(1.5, 4); // berhenti mengobrol
      } else {
        tmpDir.normalize();
        ped.heading = Math.atan2(tmpDir.x, tmpDir.z);
        targetSpeed = ped.speed;
        pos.x += tmpDir.x * targetSpeed * dt;
        pos.z += tmpDir.z * targetSpeed * dt;
      }
    }
    ped.moveSpeed = targetSpeed;
    ped.mesh.rotation.y = ped.heading;
    posePerson(ped, dt);
  }
}
