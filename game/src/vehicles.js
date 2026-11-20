// vehicles.js — pabrik mesh mobil (bodi primitif three.js) dan sistem lalu lintas.
// Mobil traffic berjalan di "rel": sumbu jalan (avenue = sumbu z, street = sumbu x) dengan
// lajur kanan sesuai arah, berbelok secara acak di persimpangan, mengerem bila ada kendaraan
// atau orang di depannya. Mobil parkir menempel di tepi jalan dan bisa dicuri pemain.

import * as THREE from 'three';
import { AVENUES, STREETS, BEACH_ROAD_Z } from './city.js';
import { CAR_PAINTS } from './rng.js';

const bodyGeo = new THREE.BoxGeometry(1.82, 0.62, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.6, 0.55, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });

// Membuat satu grup mobil. kind: 'car' | 'coupe' | 'taxi' | 'police'.
// Mobil menghadap +z; heading 0 = ke selatan (+z), sesuai forward = (sin h, 0, cos h).
export function makeVehicleMesh(kind, paint) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, kind === 'police' ? new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }) : glassMat);
  cabin.position.set(0, 1.08, -0.25);
  group.add(cabin);
  if (kind === 'coupe') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.4), bodyMat);
    spoiler.position.set(0, 0.98, -2.0);
    group.add(spoiler);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    sign.position.set(0, 1.47, -0.25);
    group.add(sign);
  }
  const wheelPos = [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]];
  const wheels = [];
  for (const [wx, wz] of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lightMat);
  headL.position.set(-0.55, 0.62, 2.16);
  const headR = headL.clone();
  headR.position.x = 0.55;
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
  tailL.position.set(-0.55, 0.66, -2.16);
  const tailR = tailL.clone();
  tailR.position.x = 0.55;
  group.add(headL, headR, tailL, tailR);
  let lightBar = null;
  if (kind === 'police') {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    lightBar.add(red, blue);
    lightBar.position.set(0, 1.48, -0.25);
    group.add(lightBar);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  group.userData.wheels = wheels;
  return group;
}

export function createVehicle(kind, paint, x, z, heading) {
  const mesh = makeVehicleMesh(kind, paint);
  mesh.position.set(x, 0.3, z);
  mesh.rotation.y = heading;
  return {
    mesh, kind, paint,
    heading, speed: 0, radius: 1.75,
    driver: null, parked: false, stolen: false, chopPaid: false, missionCar: false,
    playerDriven: false, police: kind === 'police', rail: null, cruise: 11,
    honkAt: 0,
  };
}

// Lajur kanan: offset tegak lurus arah jalan. Untuk rel sumbu x (street): mobil arah +x
// beroda di z = garis + 3.4; arah -x di z = garis - 3.4. Untuk rel sumbu z (avenue) berlaku
// cerminnya pada x (kanan dari arah hadap).
function laneCoord(rail) {
  return rail.line + (rail.dir > 0 ? 3.4 : -3.4);
}

function placeOnRail(vehicle) {
  const rail = vehicle.rail;
  if (rail.axis === 'x') {
    vehicle.mesh.position.set(rail.along, 0.3, laneCoord(rail));
    vehicle.heading = rail.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    vehicle.mesh.position.set(laneCoord(rail), 0.3, rail.along);
    vehicle.heading = rail.dir > 0 ? 0 : Math.PI;
  }
  vehicle.mesh.rotation.y = vehicle.heading;
}

function randomRail(rng, nearX, nearZ) {
  const onStreet = rng.chance(0.55);
  if (onStreet) {
    const line = rng.chance(0.12) ? BEACH_ROAD_Z : rng.pick(STREETS);
    return { axis: 'x', line, dir: rng.chance(0.5) ? 1 : -1, along: nearX + rng.range(-140, 140) };
  }
  return { axis: 'z', line: rng.pick(AVENUES), dir: rng.chance(0.5) ? 1 : -1, along: nearZ + rng.range(-120, 120) };
}

// Di persimpangan: lurus atau belok ke jalan yang memotong.
function maybeTurn(vehicle, rng) {
  const rail = vehicle.rail;
  const crossings = rail.axis === 'x' ? AVENUES : STREETS;
  for (const cross of crossings) {
    if (Math.abs(rail.along - cross) < 2.2 && !rail.justTurned) {
      rail.justTurned = true;
      if (rng.chance(0.38)) {
        const oldLine = rail.line;
        rail.axis = rail.axis === 'x' ? 'z' : 'x';
        rail.line = cross;
        rail.along = oldLine;
        rail.dir = rng.chance(0.5) ? 1 : -1;
      }
      return;
    }
  }
  if (crossings.every((c) => Math.abs(rail.along - c) > 6)) rail.justTurned = false;
}

export function spawnTraffic(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const kind = rng.chance(0.16) ? 'taxi' : (rng.chance(0.2) ? 'coupe' : 'car');
    const paint = kind === 'taxi' ? 0xf2b705 : rng.pick(CAR_PAINTS);
    const vehicle = createVehicle(kind, paint, 0, 0, 0);
    vehicle.rail = randomRail(rng, rng.range(-120, 120), rng.range(-90, 90));
    vehicle.cruise = rng.range(8.5, 13);
    vehicle.driver = { traffic: true };
    placeOnRail(vehicle);
    scene.add(vehicle.mesh);
    cars.push(vehicle);
  }
  return cars;
}

export function spawnParked(scene, rng, count) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard++ < 300) {
    const onStreet = rng.chance(0.6);
    let x, z, heading;
    if (onStreet) {
      const line = rng.pick(STREETS);
      x = rng.range(-168, 168);
      if (AVENUES.some((a) => Math.abs(x - a) < 10)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      z = line + side * 5.9;
      heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const line = rng.pick(AVENUES);
      z = rng.range(-138, 108);
      if (STREETS.some((s) => Math.abs(z - s) < 10)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      x = line + side * 5.9;
      heading = side > 0 ? Math.PI : 0;
    }
    const kind = rng.chance(0.22) ? 'coupe' : 'car';
    const vehicle = createVehicle(kind, rng.pick(CAR_PAINTS), x, z, heading);
    vehicle.parked = true;
    scene.add(vehicle.mesh);
    cars.push(vehicle);
  }
  return cars;
}

// Ada penghalang di depan mobil pada relnya? Mengembalikan jarak bebas.
function clearanceAhead(G, vehicle) {
  const rail = vehicle.rail;
  const myPos = vehicle.mesh.position;
  let clear = 26;
  const check = (other) => {
    if (other === vehicle || other.down) return;
    const p = other.mesh ? other.mesh.position : other;
    const dx = p.x - myPos.x;
    const dz = p.z - myPos.z;
    const along = rail.axis === 'x' ? dx * rail.dir : dz * rail.dir;
    const lateral = rail.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
    if (along > 0 && along < clear && lateral < 2.6) clear = along;
  };
  for (const car of G.cars) if (!car.parked) check(car);
  if (G.player.mode === 'car' && G.player.car) check(G.player.car);
  if (G.player.mode === 'foot') check({ mesh: G.player.mesh });
  for (const ped of G.peds) if (!ped.down) check(ped);
  return clear;
}

export function updateTraffic(G, dt) {
  const rng = G.rng;
  for (const vehicle of G.cars) {
    if (!vehicle.rail || vehicle.playerDriven || vehicle.parked) continue;
    const clear = clearanceAhead(G, vehicle);
    const target = clear < 8 ? 0 : vehicle.cruise;
    const accel = target > vehicle.speed ? 5.5 : 14;
    vehicle.speed += Math.sign(target - vehicle.speed) * Math.min(Math.abs(target - vehicle.speed), accel * dt);
    vehicle.rail.along += vehicle.speed * vehicle.rail.dir * dt;
    // Ujung dunia: putar balik.
    const limit = vehicle.rail.axis === 'x' ? 178 : 148;
    if (vehicle.rail.along > limit) { vehicle.rail.along = limit; vehicle.rail.dir = -1; }
    if (vehicle.rail.along < -limit) { vehicle.rail.along = -limit; vehicle.rail.dir = 1; }
    maybeTurn(vehicle, rng);
    placeOnRail(vehicle);
    // Daur ulang mobil yang terlalu jauh dari pemain agar kota selalu hidup di sekitar pemain.
    const p = G.player.mesh.position;
    if (vehicle.mesh.position.distanceTo(p) > 300) {
      vehicle.rail = randomRail(rng, p.x, p.z);
      placeOnRail(vehicle);
    }
    const spin = vehicle.speed * dt * 2.4;
    for (const wheel of vehicle.mesh.userData.wheels) wheel.rotation.x += spin;
  }
}
