// shots.js — pose deterministik untuk screenshot (?shot=<mode>&seed=1, dipetakan shots.json).
// Setiap pose menyusun adegan persis sama di setiap run: mobil pemain, polisi, pejalan kaki,
// objektif, banner, dan kamera tetap (G.shotCam dibaca loop utama menggantikan kamera bebas).
// Sampul (1-chase) sengaja menaruh kamera DI DEPAN mobil pemain: badan mobil menghadap
// penonton dan dua mobil polisi ber-rotator terlihat menempel di belakangnya.

import { LANDMARKS } from './city.js';
import { createVehicle } from './vehicles.js';
import { showBanner, showToast } from './hud.js';

function setPlayerCar(G, car) {
  car.playerDriven = true;
  car.stolen = true;
  G.cars.push(car);
  G.scene.add(car.mesh);
  G.player.mode = 'car';
  G.player.car = car;
  G.player.mesh.visible = false;
  G.player.mesh.position.copy(car.mesh.position);
}

function addPolice(G, x, z, heading, speed) {
  const car = createVehicle('police', 0xf2f2f2, x, z, heading);
  car.speed = speed;
  car.mesh.userData.lightRed.material.color.setHex(0xff2222);
  car.mesh.userData.lightBlue.material.color.setHex(0x2266ff);
  G.cars.push(car);
  G.scene.add(car.mesh);
  return car;
}

const POSES = {
  chase(G) {
    const coupe = createVehicle('coupe', 0xc23b2e, 34, 3.4, Math.PI / 2);
    coupe.speed = 13.6; // 49 km/h di speedometer
    setPlayerCar(G, coupe);
    addPolice(G, 21, 2.6, Math.PI / 2, 14);
    addPolice(G, 9, 6.8, Math.PI / 2, 14.5);
    G.wanted.heat = 82;
    G.wanted.stars = 3;
    G.objective = { x: LANDMARKS.garage.zone.x, z: LANDMARKS.garage.zone.z, label: "Deliver the coupe to Mira's Garage" };
    G.beacon.visible = true;
    G.beacon.position.set(LANDMARKS.garage.zone.x, 0, LANDMARKS.garage.zone.z);
    G.shotCam = { pos: [46.5, 2.7, -1.5], look: [30, 1.0, 4.2] };
  },
  downtown(G) {
    const p = G.player.mesh.position;
    p.set(25, 0.3, 11);
    G.player.heading = 2.6;
    G.player.mesh.rotation.y = 2.6;
    const spots = [[20, 14], [29, 15], [18, 7], [31, 6], [27, 18]];
    spots.forEach(([x, z], i) => {
      if (G.peds[i]) G.peds[i].mesh.position.set(x, 0.3, z);
    });
    const taxi = G.cars.find((c) => c.kind === 'taxi');
    if (taxi) {
      taxi.rail = null;
      taxi.mesh.position.set(46, 0.3, -3.4);
      taxi.heading = -Math.PI / 2;
      taxi.mesh.rotation.y = -Math.PI / 2;
    }
    G.objective = { x: LANDMARKS.garage.mira.x, z: LANDMARKS.garage.mira.z, label: 'Talk to Mira' };
    G.shotCam = { pos: [36, 3.6, 25], look: [21, 1.2, 7] };
  },
  garage(G) {
    const coupe = createVehicle('coupe', 0xd98a2e, -57, 99, 0.7);
    coupe.stolen = true;
    coupe.chopPaid = true;
    G.cars.push(coupe);
    G.scene.add(coupe.mesh);
    const p = G.player.mesh.position;
    p.set(-51, 0.3, 103);
    G.player.heading = -0.9;
    G.player.mesh.rotation.y = -0.9;
    G.cash = 420;
    G.missionIndex = 1;
    G.district = 'South Palmera';
    showBanner('MISSION PASSED', 'First Wheels · +$300');
    showToast("Chop shop unlocked — bring Mira any stolen car for $60");
    G.shotCam = { pos: [-38, 3.4, 119], look: [-60, 1.4, 95] };
  },
  title(G) {
    G.shotCam = { pos: [92, 40, 128], look: [-10, 2, -6] };
  },
};

export function applyShotPose(G, name) {
  const pose = POSES[name];
  if (!pose) return false;
  pose(G);
  return true;
}
