'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const MAX_SIZE = 3;
const RADII  = [0, 16, 30, 50];   // por tamaño 1..3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Todos los asteroides usan el mismo sprite
const asteroidImg = new Image();
asteroidImg.src = 'asteroide.png';

// Tonos de roca: [claro, oscuro] para el degradado de iluminación
const ROCK_COLORS = [
  ['#b59a7a', '#4a3a2c'],   // marrón grisáceo
  ['#c0735a', '#4d2218'],   // hierro oxidado
  ['#c9b06a', '#5a4a1e'],   // ocre
  ['#8f9aa8', '#2f3844'],   // pizarra
];

class Asteroid {
  constructor(x, y, size = MAX_SIZE, color = ROCK_COLORS[randInt(0, ROCK_COLORS.length - 1)]) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.color = color;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-10, 10);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1, this.color),
      new Asteroid(this.x, this.y, this.size - 1, this.color),
    ];
  }

  draw() {
    if (!asteroidImg.complete || !asteroidImg.naturalWidth) return;
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    // Base de roca con luz arriba-izquierda (la luz no rota con el asteroide)
    const [light, dark] = this.color;
    const lx = -r * 0.4, ly = -r * 0.4;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    const g = ctx.createRadialGradient(lx * c - ly * s, lx * s + ly * c, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    // El sprite (tinta negra sobre blanco) se multiplica: cráteres y contornos quedan oscuros
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(asteroidImg, -r * 1.08, -r * 1.08, r * 2.16, r * 2.16);
    ctx.restore();
    // Contorno oscuro para separarlo del fondo
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a1208';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
const TRIPLE_DURATION = 10;    // segundos de disparo triple
const TRIPLE_CHANCE   = 0.1;   // probabilidad por impacto a un asteroide
const TRIPLE_SPREAD   = 0.2;   // separación angular entre balas (rad)

const SHIELD_DURATION = 10;    // segundos de escudo
const SLOW_DURATION   = 6;     // segundos de cámara lenta
const SLOW_FACTOR     = 0.5;   // multiplicador de velocidad de asteroides
const HYPER_DURATION  = 8;     // segundos de hipervelocidad
const HYPER_MULT      = 2;     // multiplicador del empuje de la nave
const POWERUP_CHANCE  = 0.1;   // probabilidad por impacto a un asteroide
const POWERUP_TTL     = 11;    // segundos que el símbolo permanece en pantalla

// Casco de la nave estilo cómic futurista, en coordenadas locales (nariz en +x).
// Lo usan Ship.draw y los iconos de vidas del HUD.
function drawShipHull() {
  ctx.lineJoin    = 'round';
  ctx.lineWidth   = 1.5;
  ctx.strokeStyle = '#0a0a18';

  // Alas delta con franja roja
  ctx.fillStyle = '#e03a3a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(8,   side * 3);
    ctx.lineTo(-11, side * 11);
    ctx.lineTo(-7,  side * 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Propulsores traseros
  ctx.fillStyle = '#3c4658';
  for (const side of [-1, 1]) {
    ctx.fillRect(-12, side * 3.5 - 1.8, 5, 3.6);
    ctx.strokeRect(-12, side * 3.5 - 1.8, 5, 3.6);
  }

  // Fuselaje metálico
  const body = ctx.createLinearGradient(0, -5, 0, 5);
  body.addColorStop(0, '#f2f6fb');
  body.addColorStop(1, '#7388a6');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(21,  0);
  ctx.lineTo(7,  -4.5);
  ctx.lineTo(-8, -4);
  ctx.lineTo(-9,  0);
  ctx.lineTo(-8,  4);
  ctx.lineTo(7,   4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cabina de cristal cian con brillo
  const glass = ctx.createLinearGradient(0, -2.6, 0, 2.6);
  glass.addColorStop(0, '#9ff4ff');
  glass.addColorStop(1, '#0a8fd0');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(5, 0, 6, 2.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(6.5, -1, 2.2, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.tripleShot    = 0;
    this.shield        = 0;
    this.slow          = 0;
    this.hyper         = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleShot    > 0) this.tripleShot    -= dt;
    if (this.shield        > 0) this.shield        -= dt;
    if (this.slow          > 0) this.slow          -= dt;
    if (this.hyper         > 0) this.hyper         -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260 * (this.hyper > 0 ? HYPER_MULT : 1);  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    const angles = this.tripleShot > 0
      ? [this.angle - TRIPLE_SPREAD, this.angle, this.angle + TRIPLE_SPREAD]
      : [this.angle];
    return angles.map(a => new Bullet(ox, oy, a));
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Llamas gemelas de los propulsores (detrás del casco)
    if (this.thrusting && Math.random() > 0.35) {
      ctx.fillStyle = this.hyper > 0 ? 'rgba(80, 160, 255, 0.9)' : 'rgba(255, 140, 0, 0.9)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-11, side * 3.5 - 1.8);
        ctx.lineTo(-11 - rand(6, 13), side * 3.5);
        ctx.lineTo(-11, side * 3.5 + 1.8);
        ctx.closePath();
        ctx.fill();
      }
    }

    drawShipHull();

    // Escudo: anillo alrededor de la nave
    if (this.shield > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 220, 255, 0.8)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── PowerUp (símbolo recogible) ───────────────────────────────────────────────
const POWERUP_TYPES = {
  shield: { letter: 'E', color: '#0df' },
  slow:   { letter: 'L', color: '#b6f' },
  nova:   { letter: 'N', color: '#f80' },
  hyper:  { letter: 'H', color: '#ff0' },
};

class PowerUp {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const kinds = Object.keys(POWERUP_TYPES);
    this.type = kinds[randInt(0, kinds.length - 1)];
    const angle = rand(0, Math.PI * 2);
    this.vx = Math.cos(angle) * 20;
    this.vy = Math.sin(angle) * 20;
    this.radius = 16.5;
    this.ttl  = POWERUP_TTL;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo en los últimos 2 segundos
    if (this.ttl < 2 && Math.floor(this.ttl * 6) % 2 === 0) return;
    const { letter, color } = POWERUP_TYPES[this.type];
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 21px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, this.x, this.y + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Fondo (espacio profundo) ──────────────────────────────────────────────────
// Se renderiza una sola vez por nivel en un canvas aparte; draw() solo lo copia.
// Solo degradados suaves, tonos fríos y poco brillo para no confundirse con asteroides.
function softBlob(g, x, y, r, rgb, alpha) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

const BACKDROPS = [
  // Vía Láctea: banda diagonal difusa con estrellas densas
  g => {
    const x0 = -40, y0 = H * 0.9, x1 = W + 40, y1 = H * 0.1;
    const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny);
    for (let i = 0; i < 70; i++) {
      const t = Math.random(), off = rand(-45, 45);
      softBlob(g, x0 + (x1 - x0) * t + nx / nl * off, y0 + (y1 - y0) * t + ny / nl * off,
               rand(40, 90), Math.random() < 0.5 ? '140,150,230' : '170,130,220', 0.07);
    }
    g.fillStyle = 'rgba(210,220,255,0.35)';
    for (let i = 0; i < 380; i++) {
      const t = Math.random(), off = rand(-70, 70);
      g.fillRect(x0 + (x1 - x0) * t + nx / nl * off, y0 + (y1 - y0) * t + ny / nl * off, 1, 1);
    }
  },
  // Púlsar: núcleo brillante, halo y dos haces tenues opuestos
  g => {
    const x = rand(180, 620), y = rand(140, 460), a = rand(0, Math.PI);
    softBlob(g, x, y, 90, '110,170,255', 0.35);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    for (const dir of [-1, 1]) {
      const beam = g.createLinearGradient(0, 0, dir * 320, 0);
      beam.addColorStop(0, 'rgba(150,200,255,0.30)');
      beam.addColorStop(1, 'rgba(150,200,255,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(0, -2);
      g.lineTo(dir * 320, -9);
      g.lineTo(dir * 320, 9);
      g.lineTo(0, 2);
      g.closePath();
      g.fill();
    }
    g.restore();
    softBlob(g, x, y, 14, '230,240,255', 0.9);
  },
  // Galaxia espiral inclinada + galaxia elíptica lejana
  g => {
    const x = rand(220, 580), y = rand(180, 420);
    g.save();
    g.translate(x, y);
    g.rotate(rand(-0.6, 0.6));
    g.scale(1, 0.45);
    softBlob(g, 0, 0, 70, '170,170,255', 0.28);
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 700; i++) {
        const th = i * 0.012 + arm * Math.PI;
        const r = 8 + th * 16 + rand(-12, 12);
        softBlob(g, Math.cos(th) * r, Math.sin(th) * r, rand(5, 12), '160,180,255', 0.09);
      }
    }
    g.restore();
    g.save();
    g.translate(rand(60, 740), rand(50, 550));
    g.rotate(rand(0, Math.PI));
    g.scale(1, 0.5);
    softBlob(g, 0, 0, 26, '200,190,255', 0.22);
    g.restore();
  },
  // Nebulosa: grandes nubes superpuestas magenta / turquesa
  g => {
    const tones = ['190,60,170', '40,170,190', '110,70,200'];
    for (let i = 0; i < 9; i++)
      softBlob(g, rand(0, W), rand(0, H), rand(130, 230), tones[i % tones.length], rand(0.22, 0.32));
  },
];

function buildBackground(lvl) {
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const g = off.getContext('2d');

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#05050f');
  base.addColorStop(1, '#0b0716');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  g.globalCompositeOperation = 'lighter';
  BACKDROPS[(lvl - 1) % BACKDROPS.length](g);
  g.globalCompositeOperation = 'source-over';

  // Estrellas lejanas, tenues
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.15, 0.5).toFixed(2)})`;
    g.fillRect(rand(0, W), rand(0, H), 1, 1);
  }

  // Atenuar para que quede claramente al fondo
  g.fillStyle = 'rgba(0,0,10,0.3)';
  g.fillRect(0, 0, W, H);
  return off;
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let bgCanvas;
let ship, bullets, asteroids, particles, powerups;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;
let tripleUsed; // el disparo triple solo aparece una vez por nivel
let powerupUsed; // máximo un power-up (símbolo) por nivel

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerups  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  tripleUsed  = false;
  powerupUsed = false;
  state  = 'playing';
  bgCanvas = buildBackground(level);
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  tripleUsed  = false;
  powerupUsed = false;
  bullets   = [];
  particles = [];
  powerups  = [];
  ship.reset();
  bgCanvas = buildBackground(level);
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

// Destruye un asteroide sin dividirlo (escudo / nova): puntos y explosión
function destroyAsteroid(a) {
  a.dead = true;
  score += POINTS[a.size];
  explode(a.x, a.y, a.size * 5);
}

function applyPowerUp(type) {
  if (type === 'shield')     ship.shield = SHIELD_DURATION;
  else if (type === 'slow')  ship.slow   = SLOW_DURATION;
  else if (type === 'hyper') ship.hyper  = HYPER_DURATION;
  else if (type === 'nova') {
    asteroids.forEach(destroyAsteroid);
    asteroids = [];
  }
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    powerups.forEach(p => p.update(dt));
    powerups = powerups.filter(p => !p.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  const asteroidDt = dt * (ship.slow > 0 ? SLOW_FACTOR : 1);
  asteroids.forEach(a => a.update(asteroidDt));
  particles.forEach(p => p.update(dt));
  powerups.forEach(p => p.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  powerups  = powerups.filter(p => !p.dead);
  particles = particles.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        if (!tripleUsed && Math.random() < TRIPLE_CHANCE) {
          tripleUsed = true;
          ship.tripleShot = TRIPLE_DURATION;
        }
        if (!powerupUsed && Math.random() < POWERUP_CHANCE) {
          powerupUsed = true;
          powerups.push(new PowerUp(a.x, a.y));
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs power-up
  for (const p of powerups) {
    if (dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      applyPowerUp(p.type);
    }
  }
  powerups = powerups.filter(p => !p.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (ship.shield > 0) {
          // El escudo absorbe el choque y se consume
          destroyAsteroid(a);
          ship.shield = 0;
          ship.invincible = 0.5;
        } else {
          killShip();
        }
        break;
      }
    }
    asteroids = asteroids.filter(a => !a.dead);
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(0.55, 0.55);
  drawShipHull();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  const timers = [
    ['TRIPLE', ship.tripleShot],
    ['ESCUDO', ship.shield],
    ['LENTO',  ship.slow],
    ['HIPER',  ship.hyper],
  ];
  let ty = 46;
  for (const [label, t] of timers) {
    if (t <= 0) continue;
    ctx.fillText(`${label} ${Math.ceil(t)}s`, W / 2, ty);
    ty += 20;
  }

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.drawImage(bgCanvas, 0, 0);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  bullets.forEach(b => b.draw());
  powerups.forEach(p => p.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
