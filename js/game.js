/**
 * game.js — Jeu spatial 3D (Three.js).
 */
const GAME_CONFIG = {
  lives: 3,
  shipSpeed: 19,
  shipRadius: 1.1,
  bulletSpeed: 28,
  bulletRadius: 0.25,
  handShotDebounceMs: 20,
  keyboardShotCooldown: 0.12,
  invincibleDuration: 1.8,
  scorePerSecond: 10,
  scorePerKill: 25,
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = "playing";
    this.score = 0;
    this.lives = GAME_CONFIG.lives;
    this.lastTime = 0;

    this.asteroids = [];
    this.bullets = [];
    this.explosions = [];
    this.spawnTimer = 0;

    this.direction = null;
    this.velX = 0;
    this.velY = 0;
    this.keys = { left: false, right: false, up: false, down: false, shoot: false };
    this.shootCooldown = 0;
    this.lastHandShot = 0;
    this.invincibleTimer = 0;

    this.worldW = 40;
    this.worldH = 30;
    this.onGameOver = null;
    this.onLivesChange = null;

    this.initThree();
    this.bindKeyboard();
    this.initShip();
    this.createStarfield();

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060f, 0.012);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    this.camera.position.set(0, 0, 42);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05060f);

    this.scene.add(new THREE.AmbientLight(0x334466, 0.6));

    const sun = new THREE.DirectionalLight(0x7df9ff, 1.2);
    sun.position.set(5, 10, 20);
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0xff6b6b, 0.4);
    rim.position.set(-8, -4, 10);
    this.scene.add(rim);

    this.shipGroup = new THREE.Group();
    this.buildShipMesh();
    this.scene.add(this.shipGroup);

    this.engineLight = new THREE.PointLight(0xff9f43, 2, 8);
    this.engineLight.position.set(0, -1.4, 0.5);
    this.shipGroup.add(this.engineLight);

    this.starPoints = null;
  }

  buildShipMesh() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x7df9ff,
      emissive: 0x1a6b80,
      metalness: 0.7,
      roughness: 0.25,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0a1628,
      metalness: 0.5,
      roughness: 0.4,
    });

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 6), bodyMat);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.6;
    this.shipGroup.add(body);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), darkMat);
    cockpit.position.set(0, 0, 1.3);
    this.shipGroup.add(cockpit);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.8), bodyMat);
    wings.position.set(0, 0, 0.2);
    this.shipGroup.add(wings);

    const finMat = new THREE.MeshStandardMaterial({ color: 0xff9f43, emissive: 0x994400 });
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.6), finMat);
    fin.position.set(0, -0.5, -0.2);
    this.shipGroup.add(fin);
  }

  createStarfield() {
    if (this.starPoints) {
      this.scene.remove(this.starPoints);
      this.starGeo?.dispose();
      this.starMat?.dispose();
    }

    const count = 800;
    const positions = new Float32Array(count * 3);
    this.starData = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 120;
      const y = (Math.random() - 0.5) * 80;
      const z = Math.random() * -80 - 5;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      this.starData.push({ z, speed: Math.random() * 30 + 10 });
    }

    this.starGeo = new THREE.BufferGeometry();
    this.starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.85,
    });
    this.starPoints = new THREE.Points(this.starGeo, this.starMat);
    this.scene.add(this.starPoints);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const dist = this.camera.position.z;
    const vFOV = (this.camera.fov * Math.PI) / 180;
    this.worldH = 2 * Math.tan(vFOV / 2) * dist;
    this.worldW = this.worldH * (w / h);
  }

  initShip() {
    this.ship = {
      x: 0,
      y: -this.worldH * 0.32,
      radius: GAME_CONFIG.shipRadius,
      speed: GAME_CONFIG.shipSpeed,
    };
    this.velX = 0;
    this.velY = 0;
    this.syncShipMesh();
  }

  syncShipMesh() {
    this.shipGroup.position.set(this.ship.x, this.ship.y, 0);
    if (this.direction) {
      const angle = Math.atan2(this.direction.y, this.direction.x) - Math.PI / 2;
      this.shipGroup.rotation.z = angle * 0.35;
    } else {
      this.shipGroup.rotation.z *= 0.92;
    }
  }

  bindKeyboard() {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    window.addEventListener("keydown", (e) => {
      if (map[e.key]) { this.keys[map[e.key]] = true; e.preventDefault(); }
      if (e.key === " " || e.key === "Spacebar") { this.keys.shoot = true; e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => {
      if (map[e.key]) this.keys[map[e.key]] = false;
      if (e.key === " " || e.key === "Spacebar") this.keys.shoot = false;
    });
  }

  setDirection(dx, dy) { this.direction = { x: dx, y: dy }; }
  clearDirection() { this.direction = null; }

  disposeMesh(mesh) {
    this.scene.remove(mesh);
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }

  fireBullet(fromHand = false) {
    if (this.state !== "playing") return;
    if (!fromHand && this.shootCooldown > 0) return;

    const now = performance.now();
    if (fromHand && now - this.lastHandShot < GAME_CONFIG.handShotDebounceMs) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xffaa00,
      emissiveIntensity: 2,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), mat);
    mesh.position.set(this.ship.x, this.ship.y + 1.4, 0.3);
    this.scene.add(mesh);

    this.bullets.push({ mesh, vy: GAME_CONFIG.bulletSpeed, radius: GAME_CONFIG.bulletRadius });

    if (fromHand) this.lastHandShot = now;
    else this.shootCooldown = GAME_CONFIG.keyboardShotCooldown;
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  restart() {
    this.clearEntities(this.asteroids);
    this.clearEntities(this.bullets);
    this.clearEntities(this.explosions);

    this.asteroids = [];
    this.bullets = [];
    this.explosions = [];
    this.state = "playing";
    this.score = 0;
    this.lives = GAME_CONFIG.lives;
    this.spawnTimer = 0;
    this.invincibleTimer = 0;
    this.shootCooldown = 0;
    this.lastHandShot = 0;
    this.direction = null;
    this.initShip();
    this.shipGroup.visible = true;
    this.onLivesChange?.(this.lives);
  }

  clearEntities(list) {
    for (const e of list) this.disposeMesh(e.mesh);
  }

  loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.updateStarfield(dt);
    if (this.state !== "playing") return;

    this.score += dt * GAME_CONFIG.scorePerSecond;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);

    this.updateShip(dt);
    this.spawnAsteroids(dt);
    this.updateAsteroids(dt);
    this.updateBullets(dt);
    this.updateExplosions(dt);
    this.checkCollisions();

    if (this.keys.shoot) this.fireBullet();

    this.shipGroup.visible =
      this.invincibleTimer <= 0 || Math.floor(this.invincibleTimer * 10) % 2 === 0;
    this.engineLight.intensity = 1.5 + Math.random() * 1.5;
  }

  updateShip(dt) {
    const { speed } = this.ship;

    if (this.direction) {
      const targetVx = this.direction.x * speed;
      const targetVy = -this.direction.y * speed;
      const accel = 6;
      this.velX += (targetVx - this.velX) * accel * dt;
      this.velY += (targetVy - this.velY) * accel * dt;
    } else {
      const friction = 8;
      this.velX *= Math.max(0, 1 - friction * dt);
      this.velY *= Math.max(0, 1 - friction * dt);
      if (Math.abs(this.velX) < 0.05) this.velX = 0;
      if (Math.abs(this.velY) < 0.05) this.velY = 0;

      this.velX = this.keys.left ? -speed : this.keys.right ? speed : this.velX;
      this.velY = this.keys.up ? speed : this.keys.down ? -speed : this.velY;
      if (!this.keys.left && !this.keys.right && !this.direction) this.velX = 0;
      if (!this.keys.up && !this.keys.down && !this.direction) this.velY = 0;
    }

    this.ship.x += this.velX * dt;
    this.ship.y += this.velY * dt;

    const m = this.ship.radius + 1;
    this.ship.x = THREE.MathUtils.clamp(this.ship.x, -this.worldW / 2 + m, this.worldW / 2 - m);
    this.ship.y = THREE.MathUtils.clamp(this.ship.y, -this.worldH / 2 + m, this.worldH / 2 - m);

    this.syncShipMesh();
  }

  updateStarfield(dt) {
    const pos = this.starGeo.attributes.position.array;
    for (let i = 0; i < this.starData.length; i++) {
      const s = this.starData[i];
      s.z += s.speed * dt;
      if (s.z > 5) s.z = -80 - Math.random() * 20;
      pos[i * 3 + 2] = s.z;
    }
    this.starGeo.attributes.position.needsUpdate = true;
  }

  createAsteroidMesh(radius) {
    const geo = new THREE.IcosahedronGeometry(radius, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const noise = 0.75 + Math.random() * 0.45;
      pos.setXYZ(i, pos.getX(i) * noise, pos.getY(i) * noise, pos.getZ(i) * noise);
    }
    geo.computeVertexNormals();

    return new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x5a6078,
        emissive: 0x1a1020,
        metalness: 0.3,
        roughness: 0.85,
        flatShading: true,
      })
    );
  }

  spawnAsteroids(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const difficulty = Math.min(this.score / 200, 1);
    this.spawnTimer = 1.1 - difficulty * 0.7;

    const radius = Math.random() * 1.2 + 0.8;
    const speed = 4 + Math.random() * 4 + difficulty * 6;
    const fromTop = Math.random() < 0.7;
    const z = (Math.random() - 0.5) * 4;
    const mesh = this.createAsteroidMesh(radius);

    const asteroid = fromTop
      ? {
          x: (Math.random() - 0.5) * this.worldW * 0.9,
          y: this.worldH / 2 + radius,
          vx: (Math.random() - 0.5) * 2,
          vy: -speed,
        }
      : {
          x: this.worldW / 2 + radius,
          y: (Math.random() - 0.5) * this.worldH * 0.6,
          vx: -speed,
          vy: (Math.random() - 0.5) * 2,
        };

    Object.assign(asteroid, {
      z,
      radius,
      mesh,
      rotSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ),
    });

    mesh.position.set(asteroid.x, asteroid.y, z);
    this.scene.add(mesh);
    this.asteroids.push(asteroid);
  }

  updateAsteroids(dt) {
    const hw = this.worldW / 2 + 5;
    const hh = this.worldH / 2 + 5;

    for (const a of this.asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.rotation.x += a.rotSpeed.x * dt;
      a.mesh.rotation.y += a.rotSpeed.y * dt;
      a.mesh.rotation.z += a.rotSpeed.z * dt;
    }

    this.asteroids = this.asteroids.filter((a) => {
      if (a.y < -hh || a.x < -hw || a.x > hw) {
        this.disposeMesh(a.mesh);
        return false;
      }
      return true;
    });
  }

  updateBullets(dt) {
    const limit = this.worldH / 2 + 5;
    for (const b of this.bullets) b.mesh.position.y += b.vy * dt;
    this.bullets = this.bullets.filter((b) => {
      if (b.mesh.position.y > limit) {
        this.disposeMesh(b.mesh);
        return false;
      }
      return true;
    });
  }

  updateExplosions(dt) {
    for (const ex of this.explosions) {
      ex.life -= dt;
      const t = 1 - ex.life / ex.maxLife;
      ex.mesh.scale.setScalar(ex.baseRadius * (1 + t * 2.5));
      ex.mesh.material.opacity = ex.life / ex.maxLife;
    }
    this.explosions = this.explosions.filter((ex) => {
      if (ex.life <= 0) {
        this.disposeMesh(ex.mesh);
        return false;
      }
      return true;
    });
  }

  spawnExplosion(x, y, radius) {
    const baseRadius = radius * 0.5;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(baseRadius, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 1 })
    );
    mesh.position.set(x, y, 0.5);
    this.scene.add(mesh);
    this.explosions.push({ mesh, life: 0.4, maxLife: 0.4, baseRadius });
  }

  checkCollisions() {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      for (let j = this.asteroids.length - 1; j >= 0; j--) {
        const a = this.asteroids[j];
        const dx = a.x - b.mesh.position.x;
        const dy = a.y - b.mesh.position.y;
        const hit = a.radius + b.radius + 0.3;
        if (dx * dx + dy * dy < hit * hit) {
          this.spawnExplosion(a.x, a.y, a.radius);
          this.disposeMesh(b.mesh);
          this.disposeMesh(a.mesh);
          this.bullets.splice(i, 1);
          this.asteroids.splice(j, 1);
          this.score += GAME_CONFIG.scorePerKill;
          break;
        }
      }
    }

    if (this.invincibleTimer > 0) return;

    for (const a of this.asteroids) {
      const dx = a.x - this.ship.x;
      const dy = a.y - this.ship.y;
      const minDist = a.radius * 0.85 + this.ship.radius;
      if (dx * dx + dy * dy < minDist * minDist) {
        this.loseLife();
        return;
      }
    }
  }

  loseLife() {
    this.lives--;
    this.onLivesChange?.(this.lives);

    if (this.lives <= 0) {
      this.state = "gameover";
      this.shipGroup.visible = false;
      this.onGameOver?.(Math.floor(this.score));
      return;
    }

    this.spawnExplosion(this.ship.x, this.ship.y, 1.5);
    this.invincibleTimer = GAME_CONFIG.invincibleDuration;
    this.initShip();
  }
}
