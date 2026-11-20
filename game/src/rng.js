// rng.js — generator angka acak ber-seed (mulberry32) agar kota, lalu lintas, dan pose
// screenshot selalu sama untuk seed yang sama. Semua keberuntungan di game ini lewat sini,
// tidak ada Math.random() di modul lain, supaya pose ?shot=<mode>&seed=1 deterministik.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length) % list.length];
    },
    chance(probability) {
      return next() < probability;
    },
  };
}

// Palet warna mobil dan baju pejalan kaki, dipakai beberapa modul.
export const CAR_PAINTS = [0xc23b2e, 0x2e6fc2, 0xe0a51c, 0x3fae6a, 0xd8d8dc, 0x22242a, 0x7a4fc2, 0xc26a2e, 0x2ec2b8, 0x8f9aa6];
export const SHIRT_COLORS = [0xe8e3d8, 0xd94f3d, 0x3d7bd9, 0x3dd97a, 0xe8c832, 0x9b59d0, 0xe87fb0, 0x4fd8d0, 0xf0832e, 0x5a6270];
export const PANTS_COLORS = [0x2c3242, 0x4a3b2c, 0x5c6670, 0x243028, 0x6e2f35, 0x30385c];
export const SKIN_TONES = [0xf2c79b, 0xd9a066, 0xa0663a, 0x7a4a28, 0xffdbac];
