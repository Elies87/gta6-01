// city.js — kota PALMERA dibangun prosedural: grid 6 avenue × 5 street, jalan pantai, dan
// pelabuhan di timur. Gedung memakai tekstur kanvas berjendela menyala (beberapa varian yang
// dipakai bersama), palem dan lampu jalan dari primitif, papan nama landmark dari kanvas.
// Semua collider bangunan diekspor sebagai daftar AABB untuk fisika pemain/mobil.
// Tidak ada satu pun aset eksternal: tekstur digambar di kanvas saat boot.

import * as THREE from 'three';

export const AVENUES = [-150, -90, -30, 30, 90, 150];
export const STREETS = [-120, -60, 0, 60, 120];
export const BEACH_ROAD_Z = 168;
export const ROAD_HALF = 7;

export const WORLD = { minX: -185, maxX: 250, minZ: -155, maxZ: 215 };

// Titik-titik penting cerita. Zona adalah lingkaran {x, z, r} di tanah.
export const LANDMARKS = {
  garage: { name: "Mira's Garage", x: -62, z: 84, zone: { x: -62, z: 104, r: 8 }, mira: { x: -53, z: 104 } },
  police: { name: 'Palmera PD', x: 58, z: -92, respawn: { x: 58, z: -52 } },
  hospital: { name: 'Palmera General', x: -120, z: -92, respawn: { x: -120, z: -52 } },
  hotel: { name: 'Hotel Marisol', x: 60, z: 137, zone: { x: 60, z: 122, r: 6.5 } },
  casa: { name: 'Casa Palmera', x: -120, z: 137, zone: { x: -120, z: 124, r: 6.5 } },
  harbor: { name: 'Port of Palmera', x: 214, z: 2, zone: { x: 214, z: 2, r: 7 } },
};

const LANDMARK_BLOCKS = new Set(['3,0', '0,0', '1,3']); // "avenueIdx,streetIdx" blok yang ditempati landmark (PD, rumah sakit, garasi)

export function districtAt(x, z) {
  if (x > 182) return 'Port of Palmera';
  if (z > 146) return 'Palmera Beach';
  if (x > 100) return 'Marina District';
  if (x < -95 && z < -40) return 'Old Town';
  if (Math.abs(x - 30) < 62 && Math.abs(z) < 72) return 'Downtown';
  if (z > 62) return 'South Palmera';
  if (z < -62) return 'North Palmera';
  return 'Midtown';
}

export function isOnRoad(x, z) {
  for (const a of AVENUES) if (Math.abs(x - a) < ROAD_HALF + 1) return true;
  for (const s of STREETS) if (Math.abs(z - s) < ROAD_HALF + 1) return true;
  if (Math.abs(z - BEACH_ROAD_Z) < ROAD_HALF + 1 && x > -180 && x < 190) return true;
  if (x > 184 && Math.abs(z) < 78) return true; // apron pelabuhan
  return false;
}

function buildingTexture(rng, baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,170,90,0.20)');
  grad.addColorStop(1, 'rgba(10,8,30,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 7; col++) {
      const lit = rng.chance(0.42);
      g.fillStyle = lit ? (rng.chance(0.7) ? '#ffd98a' : '#aee6ff') : '#1d212c';
      g.fillRect(8 + col * 17, 12 + row * 17, 10, 11);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = '#14101e';
  g.fillRect(0, 0, 512, 96);
  g.font = 'bold 52px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 22;
  g.fillStyle = color;
  g.fillText(text, 256, 50);
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.85;
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addSign(scene, text, color, x, y, z, w, rotY) {
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, color), side: THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.1875), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  return mesh;
}

// Beacon cahaya penanda objektif: silinder tembus pandang yang menjulang.
export function makeGlowBeacon(color) {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 80, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  outer.position.y = 40;
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 80, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  inner.position.y = 40;
  group.add(outer, inner);
  group.visible = false;
  return group;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const addCollider = (cx, cz, w, d) => {
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  };

  // Langit senja: gradien kanvas sebagai latar + kabut ungu.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const skyGrad = sg.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#241b4d');
  skyGrad.addColorStop(0.45, '#6e3560');
  skyGrad.addColorStop(0.75, '#c95d63');
  skyGrad.addColorStop(1, '#ff9a5c');
  sg.fillStyle = skyGrad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0x51365e, 130, 430);
  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x2c2c44, 0.85));
  const sun = new THREE.DirectionalLight(0xffb36b, 1.15);
  sun.position.set(-160, 95, -70);
  scene.add(sun);

  // Tanah dasar: satu kanvas besar menggambar aspal + marka jalan, supaya hemat draw call.
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = 1024;
  groundCanvas.height = 1024;
  const gg = groundCanvas.getContext('2d');
  gg.fillStyle = '#33363d';
  gg.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    gg.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    gg.fillRect(rng.range(0, 1024), rng.range(0, 1024), 3, 3);
  }
  const toPxX = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * 1024;
  const toPxZ = (z) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * 1024;
  gg.fillStyle = '#d8c95a';
  for (const s of STREETS) {
    for (let x = WORLD.minX + 6; x < 186; x += 11) gg.fillRect(toPxX(x), toPxZ(s) - 1, 12, 2);
  }
  for (const a of AVENUES) {
    for (let z = WORLD.minZ + 6; z < 150; z += 11) gg.fillRect(toPxX(a) - 1, toPxZ(z), 2, 12);
  }
  for (let x = WORLD.minX + 6; x < 186; x += 11) gg.fillRect(toPxX(x), toPxZ(BEACH_ROAD_Z) - 1, 12, 2);
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((WORLD.minX + WORLD.maxX) / 2, 0, (WORLD.minZ + WORLD.maxZ) / 2);
  scene.add(ground);

  // Pasir pantai dan lautan di selatan.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(470, 52), new THREE.MeshLambertMaterial({ color: 0xb99c6e }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(25, 0.03, 172);
  scene.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(560, 150), new THREE.MeshLambertMaterial({ color: 0x175d7a }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(20, 0.02, 268);
  scene.add(ocean);

  // Blok trotoar + gedung prosedural.
  const bases = ['#6b4a5a', '#4a5a6b', '#75604a', '#54486e', '#3f5a54', '#7a5240'];
  const facadeMats = bases.map((b) => new THREE.MeshLambertMaterial({ map: buildingTexture(rng, b) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2c33 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const slabMat = new THREE.MeshLambertMaterial({ color: 0x4c5058 });

  for (let ai = 0; ai < AVENUES.length - 1; ai++) {
    for (let si = 0; si < STREETS.length - 1; si++) {
      const x0 = AVENUES[ai] + ROAD_HALF;
      const x1 = AVENUES[ai + 1] - ROAD_HALF;
      const z0 = STREETS[si] + ROAD_HALF;
      const z1 = STREETS[si + 1] - ROAD_HALF;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const slab = new THREE.Mesh(boxGeo, slabMat);
      slab.scale.set(x1 - x0 + 2.4, 0.3, z1 - z0 + 2.4);
      slab.position.set(cx, 0.15, cz);
      scene.add(slab);
      if (LANDMARK_BLOCKS.has(`${ai},${si}`)) continue;
      const downtown = Math.abs(cx - 30) < 62 && Math.abs(cz) < 72;
      const count = rng.int(1, 3);
      for (let b = 0; b < count; b++) {
        const w = rng.range(13, 20);
        const d = rng.range(13, 20);
        const h = downtown ? rng.range(22, 58) : rng.range(9, 30);
        const bx = count === 1 ? cx : cx + (b - (count - 1) / 2) * 15 + rng.range(-2, 2);
        const bz = count === 1 ? cz : cz + rng.range(-9, 9);
        // Urutan material BoxGeometry: +x,-x,+y,-y,+z,-z — fasad di sisi jalan, atap polos di +y.
        const facade = () => facadeMats[rng.int(0, facadeMats.length - 1)];
        const building = new THREE.Mesh(boxGeo, [facade(), facade(), roofMat, roofMat, facade(), facade()]);
        building.scale.set(w, h, d);
        building.position.set(bx, 0.3 + h / 2, bz);
        scene.add(building);
        addCollider(bx, bz, w + 0.4, d + 0.4);
      }
    }
  }

  // Gedung landmark: lebih rendah, lebar, berpapan nama neon satu sisi.
  const landmarkDefs = [
    { key: 'police', w: 36, h: 17, d: 24, color: 0x51627a, sign: 'PALMERA PD', signColor: '#7fd4ff', signY: 13 },
    { key: 'hospital', w: 34, h: 21, d: 24, color: 0xd8d4cc, sign: 'PALMERA GENERAL', signColor: '#ff8a7a', signY: 16 },
    { key: 'garage', w: 30, h: 9, d: 18, color: 0x8a5a34, sign: "MIRA'S GARAGE", signColor: '#ffb347', signY: 7 },
    { key: 'hotel', w: 26, h: 40, d: 15, color: 0xcaa46a, sign: 'HOTEL MARISOL', signColor: '#ff7fd4', signY: 33 },
    { key: 'casa', w: 19, h: 8, d: 14, color: 0xe0cfa8, sign: 'CASA PALMERA', signColor: '#aef29a', signY: 6.4 },
  ];
  for (const def of landmarkDefs) {
    const lm = LANDMARKS[def.key];
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: def.color }));
    mesh.scale.set(def.w, def.h, def.d);
    mesh.position.set(lm.x, 0.3 + def.h / 2, lm.z);
    scene.add(mesh);
    addCollider(lm.x, lm.z, def.w + 0.4, def.d + 0.4);
    addSign(scene, def.sign, def.signColor, lm.x, def.signY, lm.z + def.d / 2 + 0.15, Math.min(24, def.w - 4), 0);
  }
  // Papan nama toko kecil di beberapa blok (satu sisi, menghadap jalan).
  const shopNames = [['CAFE SOL', '#ffd98a'], ['BAR ONDA', '#7fd4ff'], ['DISCO LUNA', '#ff7fd4'], ['MERCADO 24H', '#aef29a'], ['TIDES GYM', '#ffb347']];
  let shopIdx = 0;
  for (let ai = 0; ai < AVENUES.length - 1 && shopIdx < shopNames.length; ai += 2) {
    for (let si = 0; si < STREETS.length - 1 && shopIdx < shopNames.length; si += 2) {
      if (LANDMARK_BLOCKS.has(`${ai},${si}`)) continue;
      const cx = (AVENUES[ai] + AVENUES[ai + 1]) / 2;
      const cz = STREETS[si + 1] - ROAD_HALF - 0.4;
      addSign(scene, shopNames[shopIdx][0], shopNames[shopIdx][1], cx, 4.2, cz, 13, 0);
      shopIdx++;
    }
  }

  // Palem: batang miring + 6 daun plane.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3e8a4f, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 5.4, 6);
  const frondGeo = new THREE.PlaneGeometry(0.7, 2.6);
  frondGeo.translate(0, 1.3, 0);
  const makePalm = (x, z) => {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.7;
    trunk.rotation.z = rng.range(-0.09, 0.09);
    palm.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.position.y = 5.35;
      frond.rotation.y = (i / 6) * Math.PI * 2 + rng.range(-0.2, 0.2);
      frond.rotation.x = rng.range(0.7, 1.05);
      palm.add(frond);
    }
    palm.position.set(x, 0.3, z);
    scene.add(palm);
  };
  for (let x = -176; x <= 186; x += 16) {
    makePalm(x + rng.range(-2, 2), 152 + rng.range(-1.5, 1.5));
    if (rng.chance(0.6)) makePalm(x + rng.range(-2, 2), 183 + rng.range(-1.5, 1.5));
  }
  for (const a of AVENUES) for (const s of STREETS) if (rng.chance(0.55)) makePalm(a + ROAD_HALF + 2.2, s + ROAD_HALF + 2.2);

  // Lampu jalan: tiang + bola menyala (emissive saja, tanpa point light demi kinerja).
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.2, 5);
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  for (const s of STREETS) {
    for (let x = -168; x <= 168; x += 42) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 2.6, s + side * (ROAD_HALF + 0.8));
        scene.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(x, 5.3, s + side * (ROAD_HALF + 0.8));
        scene.add(bulb);
      }
    }
  }

  // Pelabuhan: slab dermaga, kontainer berwarna, dua derek.
  const dock = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x5a5148 }));
  dock.scale.set(62, 0.5, 156);
  dock.position.set(216, 0.25, 0);
  scene.add(dock);
  const containerColors = [0xb84a39, 0x396ab8, 0x3fae6a, 0xd9a03c, 0x7a4fc2, 0x9aa6b0];
  const containerGeo = new THREE.BoxGeometry(6.1, 2.6, 2.44);
  for (let i = 0; i < 22; i++) {
    const cx = rng.range(196, 234);
    const cz = rng.range(-66, 66);
    if (Math.abs(cx - LANDMARKS.harbor.x) < 9 && Math.abs(cz - LANDMARKS.harbor.z) < 9) continue;
    const level = rng.chance(0.35) ? 1 : 0;
    const box = new THREE.Mesh(containerGeo, new THREE.MeshLambertMaterial({ color: rng.pick(containerColors) }));
    box.position.set(cx, 0.5 + 1.3 + level * 2.6, cz);
    box.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
    scene.add(box);
    if (level === 0) addCollider(cx, cz, 6.4, 2.8);
  }
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd97c2e });
  for (const cz of [-38, 34]) {
    const crane = new THREE.Group();
    const legA = new THREE.Mesh(boxGeo, craneMat);
    legA.scale.set(1.2, 22, 1.2);
    legA.position.set(-6, 11, 0);
    const legB = legA.clone();
    legB.position.x = 6;
    const beam = new THREE.Mesh(boxGeo, craneMat);
    beam.scale.set(30, 1.4, 1.4);
    beam.position.y = 22;
    crane.add(legA, legB, beam);
    crane.position.set(222, 0.5, cz);
    scene.add(crane);
    addCollider(222 - 6, cz, 1.6, 1.6);
    addCollider(222 + 6, cz, 1.6, 1.6);
  }

  return { colliders };
}
