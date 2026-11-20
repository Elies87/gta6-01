// save.js — simpanan permainan di localStorage: uang, progres misi, posisi pemain, health,
// amunisi, dan jam kota. Ditulis saat misi selesai, tiap 30 detik otomatis, dan manual dari
// menu jeda. Dibaca oleh tombol Continue di layar judul.

export const SAVE_KEY = 'palmera-neon-tide-save-v1';

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(G) {
  try {
    const pos = G.player.mesh.position;
    const data = {
      cash: G.cash,
      missionIndex: G.missionIndex,
      storyDone: G.storyDone,
      px: Math.round(pos.x * 10) / 10,
      pz: Math.round(pos.z * 10) / 10,
      health: Math.round(G.health),
      ammo: G.combat.ammo,
      reserve: G.combat.reserve,
      timeMin: Math.floor(G.timeMin),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
}
