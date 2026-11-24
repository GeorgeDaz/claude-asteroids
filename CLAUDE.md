# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asteroids clone in plain HTML5 Canvas + vanilla JavaScript. No dependencies, no bundler, no package.json, no tests, no linter. UI text and code comments are in Spanish; match that when editing.

## Running

Open `index.html` directly in a browser, or serve the folder with `npx serve .` (http://localhost:3000). There is no build step.

## Architecture

All game logic lives in `game.js` (loaded by `index.html` onto an 800x600 `<canvas id="canvas">`). It is a single global-scope script, organized in labeled sections:

- **Input**: `keys` tracks held keys; `justPressed` + `pressed(code)` gives one-shot edge detection (consumed on read). Used for shooting (`Space`, one bullet per press, 0.2s cooldown) and restart.
- **Entities** (`Bullet`, `Asteroid`, `Ship`, `Particle`, `PowerUp`): each has `update(dt)` / `draw()` and a `dead` flag; dead entities are filtered out of their arrays each frame. Entities draw directly with the shared global `ctx`.
- **Game state**: module-level `let` globals (`ship`, `bullets`, `asteroids`, `particles`, `powerups`, `score`, `lives`, `level`) plus `state` = `'playing' | 'dead' | 'gameover'`. `update(dt)` branches on `state`; `'dead'` is a 2s respawn timer during which asteroids/particles keep moving.
- **Loop**: `requestAnimationFrame` loop with `dt` in seconds, clamped to 0.05s. Movement is time-based (px/s).

Key conventions:
- The play field is toroidal: positions use `wrap(v, W|H)`. Particles are the exception and do not wrap.
- Asteroid size is 1..3 (`MAX_SIZE`); `RADII`, `SPEEDS`, `POINTS` are arrays indexed by size (index 0 unused). Smaller asteroids give more points. All sizes draw the same sprite (`asteroide.png`), tinted with a random `ROCK_COLORS` gradient via `multiply` and circle-clipped; `split()` produces two asteroids of `size - 1` that inherit the parent's color. Level spawns use size `MAX_SIZE`.
- Graphics: the backdrop is rendered once per level by `buildBackground(level)` into the offscreen `bgCanvas` (scenario `BACKDROPS[(level - 1) % 4]`: Milky Way, pulsar, spiral galaxy, nebula) and `draw()` just blits it. The ship hull is drawn by `drawShipHull()`, shared by `Ship.draw()` and the HUD life icons.
- Collision is circle-based via `dist()` on `radius`; ship-vs-asteroid uses `ship.radius + a.radius * 0.82`. Ship is skipped while `ship.invincible > 0` (3s after spawn, drawn blinking).
- Power-ups: triple shot is granted directly on a bullet hit (`tripleUsed`, once per level). The other four (`shield`, `slow`, `nova`, `hyper`) spawn as a `PowerUp` pickup symbol on a bullet hit (`POWERUP_CHANCE`, max one per level via `powerupUsed`, random type from `POWERUP_TYPES`). `applyPowerUp(type)` applies it; effects are timers on `Ship` (`shield`, `slow`, `hyper`) that reset with `ship.reset()`. `slow` scales only the asteroid `dt` in `update()`; a shield absorbs one asteroid hit (asteroid destroyed without splitting); `nova` clears all asteroids (no split) and so triggers `nextLevel()`.
- Level clear (no asteroids) calls `nextLevel()`, which spawns `3 + level` asteroids outside a safe radius around the center.
