// PALMERA — Neon Tide City: program penyerahan entri gta6-01 (Node 22, pustaka standar saja).
//
// Pekerjaan program ini sederhana: menyalin folder game/ dan screenshots/ dari samping berkas
// ini ke folder keluaran, lalu menulis dossier.json di sana memakai buildDossier dari pustaka
// kit di vendor/makefun-game.ts (berkas itu tidak diubah sama sekali). Di luar kontainer penilai,
// folder keluaran diambil dari MAKEFUN_OUTPUT_DIR; di dalam penilai, keluarannya adalah /output.
// Program dijalankan dua kali oleh penilai dan kedua run harus menghasilkan byte yang sama,
// jadi tidak ada cap waktu, angka acak, atau urutan berkas yang tidak stabil di sini.
//
// Uji lokal: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Batas-batas di bawah ini adalah batas penilai sendiri (gate.json): text_max_bytes membentuk
// byte dossier, sisanya membuat program ini menolak entri yang pasti ditolak penilai — lebih
// dari 4 screenshot atau satu screenshot di atas 256 KiB, game/ di atas 993 berkas atau 48 MiB,
// atau path di bawah game/ yang lebih dari 1000 byte.
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);
