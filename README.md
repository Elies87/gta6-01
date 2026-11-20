[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Elies87/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Elies87/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# PALMERA — Neon Tide City

An original open-world crime game for the browser, built for make.fun's
[gta6-01 "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). Everything — the city, the
characters, the story, the art, the sounds — is made up for this game; nothing is taken from
any commercial game.

Explore the dusk-lit coastal city of Palmera on foot and by car: a 6 × 5 street grid plus a
beach road and a working port, with live traffic, pedestrians, stealable cars, a 0–5 star
wanted system with police who chase, shoot and bust you, fist and pistol combat, and a
three-mission story for Mira of Mira's Garage — plus her chop shop, which pays $60 for every
hot car you bring her afterwards.

## Play it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open the address in desktop Chrome. No build step, no network: the game is plain static
files under `game/`, with three.js vendored as `game/vendor/three.module.min.js`.

**Controls:** WASD move/drive · mouse camera · Shift run · F enter/steal/exit car ·
E talk · click or J punch/shoot · 1/2 fist/pistol · R reload · P pause · M mute.
Progress autosaves to localStorage (and on every mission); Continue picks it back up.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output folder and writes `dossier.json`
with the kit's `vendor/makefun-game.ts`, deterministically — two runs, identical bytes.

## Layout

- `game/index.html` + `game/style.css` — page, HUD DOM, styling
- `game/src/` — the game, one job per file: `city` (procedural city), `vehicles` (cars +
  traffic), `people` (pedestrians), `player` (on-foot/driving/camera), `police` (wanted +
  response), `combat`, `quests` (Mira's missions + chop shop), `hud` (+ minimap), `audio`
  (synthesised WebAudio), `save`, `shots` (deterministic screenshot poses), `main` (glue)
- `screenshots/` — four real renders of the game (cover: a three-star chase)
