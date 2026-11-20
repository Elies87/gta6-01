// quests.js — cerita PALMERA: Mira di garasinya memberi rantai 3 misi, dan setelah misi 1
// garasinya juga membeli mobil curian (chop shop, $60 per mobil). Mesin langkah sederhana:
// tiap misi punya step, objektif + beacon diturunkan dari step, dan updateQuests memeriksa
// syarat langkah tiap frame. Dialog ditampilkan HUD dan dimajukan dengan E / Space.
//
// Bug lama yang sengaja tidak diulang: coupe misi 1 dulu terbayar DUA kali — sekali sebagai
// hadiah misi dan sekali sebagai mobil chop shop. Di sini finishMission menandai mobil itu
// chopPaid = true sebelum pemain bisa menjualnya, jadi loop chop shop melewatinya.

import { LANDMARKS, makeGlowBeacon } from './city.js';
import { createVehicle } from './vehicles.js';
import { makePersonMesh, posePerson } from './people.js';
import { starsForHeat } from './police.js';
import { hurtPlayer } from './combat.js';
import { exitCar } from './player.js';
import { showBanner, showToast } from './hud.js';
import { writeSave } from './save.js';
import { Sound } from './audio.js';

const DIALOGS = {
  m1: [
    'You must be the new driver everyone is talking about. I am Mira. My garage keeps half of Palmera moving.',
    'A client left an amber coupe near Hotel Marisol and "forgot" the payment. Bring it to my garage and it is ours.',
    'Steal it clean, bring it here, and there is $300 with your name on it.',
  ],
  m2: [
    'Good work on the coupe. Now something delicate: a package is waiting at the port, east docks.',
    'The moment you touch it, every badge in Palmera will smell it. You will have 150 seconds to reach Hotel Marisol.',
    'Do not be late, and do not lead them to my door.',
  ],
  m3: [
    'Last job, then you are a made driver. The Volt Crew is muscling my port route tonight — three of them, at the docks.',
    'Put them down, then disappear at Casa Palmera until the heat dies. $600 when it is done.',
  ],
  busy: ['Finish what you are doing for me first, driver. The marker on your map has the details.'],
  done: ['The chop shop is always open for you. Bring me any hot car and I will make it disappear — $60 a piece.'],
};

export function initQuests(G) {
  const mesh = makePersonMesh({ shirt: 0xe87fb0, pants: 0x30385c, skin: 0xa0663a, cap: null });
  mesh.position.set(LANDMARKS.garage.mira.x, 0.3, LANDMARKS.garage.mira.z);
  G.scene.add(mesh);
  G.mira = { mesh, hp: 100, down: false, moveSpeed: 0, walkPhase: 0, heading: Math.PI, role: 'mira', punchAnim: 0 };
  G.beacon = makeGlowBeacon(0xffd94d);
  G.scene.add(G.beacon);
  G.quest = { step: 'idle', targetCar: null, timer: 0 };
  G.thugs = [];
}

function startDialog(G, lines, onDone) {
  G.dialog = { name: 'Mira', lines, index: 0, onDone: onDone || null };
}

export function advanceDialog(G) {
  if (!G.dialog) return;
  G.dialog.index++;
  Sound.click();
  if (G.dialog.index >= G.dialog.lines.length) {
    const done = G.dialog.onDone;
    G.dialog = null;
    if (done) done();
  }
}

export function talkToMira(G) {
  if (G.dialog) { advanceDialog(G); return; }
  const q = G.quest;
  if (q.step !== 'idle') { startDialog(G, DIALOGS.busy); return; }
  if (G.missionIndex === 0) startDialog(G, DIALOGS.m1, () => startMission1(G));
  else if (G.missionIndex === 1) startDialog(G, DIALOGS.m2, () => startMission2(G));
  else if (G.missionIndex === 2) startDialog(G, DIALOGS.m3, () => startMission3(G));
  else startDialog(G, DIALOGS.done);
}

function startMission1(G) {
  const coupe = createVehicle('coupe', 0xd98a2e, 96, 125.6, -Math.PI / 2);
  coupe.parked = true;
  coupe.missionCar = true;
  G.scene.add(coupe.mesh);
  G.cars.push(coupe);
  G.quest.targetCar = coupe;
  G.quest.step = 'steal';
  showBanner('FIRST WHEELS', 'Steal the amber coupe near Hotel Marisol');
}

function startMission2(G) {
  G.quest.step = 'pickup';
  showBanner('MIDNIGHT PACKAGE', 'Pick up the package at the port');
}

function startMission3(G) {
  const spots = [[205, -14], [219, 7], [210, 17]];
  for (const [x, z] of spots) {
    const mesh = makePersonMesh({ shirt: 0x22242a, pants: 0x22242a, skin: 0x7a4a28, cap: 0x7a4fc2 });
    mesh.position.set(x, 0.3, z);
    G.scene.add(mesh);
    G.thugs.push({
      mesh, hp: 100, down: false, moveSpeed: 0, walkPhase: G.rng.range(0, 6), heading: 0,
      role: 'thug', aggro: false, hitCooldown: 0, punchAnim: 0,
    });
  }
  G.quest.step = 'fight';
  showBanner('HARBOR HEAT', 'Take down the Volt Crew at the port');
}

function finishMission(G, reward, title, sub) {
  G.cash += reward;
  G.quest.step = 'idle';
  G.quest.targetCar = null;
  showBanner('MISSION PASSED', `${title} · +$${reward}`);
  showToast(sub);
  Sound.jingle(true);
  writeSave(G);
}

function inZone(pos, zone) {
  return Math.hypot(pos.x - zone.x, pos.z - zone.z) < zone.r;
}

export function updateQuests(G, dt) {
  const q = G.quest;
  const p = G.player.mesh.position;
  let objective = null;

  if (q.step === 'idle') {
    if (G.missionIndex < 3) objective = { x: LANDMARKS.garage.mira.x, z: LANDMARKS.garage.mira.z, label: 'Talk to Mira' };
  } else if (q.step === 'steal' && q.targetCar) {
    const cp = q.targetCar.mesh.position;
    objective = { x: cp.x, z: cp.z, label: 'Steal the amber coupe' };
    if (G.player.car === q.targetCar) {
      q.step = 'deliver';
      showBanner('FIRST WHEELS', "Now bring it to Mira's Garage");
    }
  } else if (q.step === 'deliver') {
    objective = { x: LANDMARKS.garage.zone.x, z: LANDMARKS.garage.zone.z, label: "Deliver the coupe to Mira's Garage" };
    if (G.player.car === q.targetCar && inZone(p, LANDMARKS.garage.zone)) {
      q.targetCar.chopPaid = true; // perbaikan bug bayar dobel: mobil misi bukan barang chop shop
      G.missionIndex = 1;
      finishMission(G, 300, 'First Wheels', 'Chop shop unlocked — bring Mira any stolen car for $60');
    }
  } else if (q.step === 'pickup') {
    objective = { x: LANDMARKS.harbor.zone.x, z: LANDMARKS.harbor.zone.z, label: 'Pick up the package at the port' };
    if (inZone(p, LANDMARKS.harbor.zone)) {
      Sound.pickup();
      G.wanted.heat = Math.max(G.wanted.heat, 46);
      G.wanted.stars = starsForHeat(G.wanted.heat);
      q.timer = 150;
      q.step = 'rush';
      showBanner('PACKAGE TAKEN', 'The law is coming — reach Hotel Marisol!');
    }
  } else if (q.step === 'rush') {
    q.timer -= dt;
    objective = { x: LANDMARKS.hotel.zone.x, z: LANDMARKS.hotel.zone.z, label: `Deliver the package to Hotel Marisol · ${Math.max(0, Math.ceil(q.timer))}s` };
    if (inZone(p, LANDMARKS.hotel.zone)) {
      G.missionIndex = 2;
      finishMission(G, 450, 'Midnight Package', 'One more job, driver — see Mira');
    } else if (q.timer <= 0) {
      q.step = 'idle';
      showBanner('MISSION FAILED', 'The package went cold — see Mira to try again');
      Sound.jingle(false);
    }
  } else if (q.step === 'fight') {
    objective = { x: LANDMARKS.harbor.zone.x, z: LANDMARKS.harbor.zone.z, label: 'Beat the Volt Crew at the port' };
    updateThugs(G, dt);
    if (G.thugs.length > 0 && G.thugs.every((t) => t.down)) {
      q.step = 'escape';
      showBanner('CREW DOWN', 'Hide at Casa Palmera until the heat dies');
    }
  } else if (q.step === 'escape') {
    objective = { x: LANDMARKS.casa.zone.x, z: LANDMARKS.casa.zone.z, label: 'Hide at Casa Palmera until the heat dies' };
    if (inZone(p, LANDMARKS.casa.zone) && G.wanted.stars === 0) {
      G.missionIndex = 3;
      G.storyDone = true;
      finishMission(G, 600, 'Harbor Heat', 'Story complete — Palmera is yours, driver');
    }
  }

  // Chop shop: mobil curian apa pun (selain mobil misi yang sudah ditandai) laku $60 di garasi.
  if (G.missionIndex >= 1 && q.step !== 'deliver' && G.player.mode === 'car' && G.player.car) {
    const car = G.player.car;
    if (car.stolen && !car.chopPaid && inZone(p, LANDMARKS.garage.zone)) {
      car.chopPaid = true;
      G.cash += 60;
      showToast('+$60 — car chopped at Mira\'s');
      Sound.pickup();
      exitCar(G);
      G.scene.remove(car.mesh);
      G.cars.splice(G.cars.indexOf(car), 1);
      writeSave(G);
    }
  }

  G.objective = objective;
  if (objective) {
    G.beacon.visible = true;
    G.beacon.position.set(objective.x, 0, objective.z);
  } else {
    G.beacon.visible = false;
  }
  // Mira menatap pemain yang mendekat.
  const mira = G.mira;
  const dx = p.x - mira.mesh.position.x;
  const dz = p.z - mira.mesh.position.z;
  if (Math.hypot(dx, dz) < 9) mira.heading = Math.atan2(dx, dz);
  mira.mesh.rotation.y = mira.heading;
  posePerson(mira, dt);
}

function updateThugs(G, dt) {
  const p = G.player.mesh.position;
  for (const thug of G.thugs) {
    if (thug.down) { posePerson(thug, dt); continue; }
    const pos = thug.mesh.position;
    const dist = pos.distanceTo(p);
    if (dist < 34) thug.aggro = true;
    thug.hitCooldown = Math.max(0, thug.hitCooldown - dt);
    if (thug.aggro && dist > 1.8) {
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      thug.heading = Math.atan2(dx, dz);
      pos.x += (dx / d) * 4.6 * dt;
      pos.z += (dz / d) * 4.6 * dt;
      thug.moveSpeed = 4.6;
    } else if (thug.aggro && dist <= 1.9) {
      thug.moveSpeed = 0;
      thug.heading = Math.atan2(p.x - pos.x, p.z - pos.z);
      if (thug.hitCooldown <= 0) {
        thug.hitCooldown = 1.1;
        thug.punchAnim = 1;
        hurtPlayer(G, 8);
        Sound.punch();
      }
    } else {
      thug.moveSpeed = 0;
    }
    thug.mesh.rotation.y = thug.heading;
    posePerson(thug, dt);
  }
}
