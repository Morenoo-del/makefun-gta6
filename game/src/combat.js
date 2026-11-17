// combat.js — pistol hitscan, punching, floating damage numbers, enemy shooters.
import * as THREE from 'three';
import { scarePedestrians } from './traffic.js';

const raycaster = new THREE.Raycaster();
const screenVec = new THREE.Vector3();
const dmgPool = [];

export function createCombat(G) {
  G.enemies = [];      // mission rivals who shoot back
  G.tracers = [];      // fading shot lines
  G.damageLayer = document.getElementById('damage-layer');
}

// Spawn a hostile NPC at a spot. He stands his ground and shoots at the player.
export function spawnEnemy(G, x, z, name) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a1f1f });
  const pants = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xa87a55 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.76, 0.36), shirt);
  torso.position.y = 1.14; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.4), skin);
  head.position.y = 1.76; group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.74, 0.26), pants);
  legL.position.set(-0.17, 0.37, 0); group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17; group.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.44, 1.0, 0.2); group.add(gun);
  group.position.set(x, 0, z);
  G.scene.add(group);
  const enemy = { mesh: group, name, health: 100, shootTimer: 1 + Math.random(), dead: false };
  G.enemies.push(enemy);
  return enemy;
}

export function clearEnemies(G) {
  for (const e of G.enemies) G.scene.remove(e.mesh);
  G.enemies.length = 0;
}

function muzzleWorldPos(G) {
  const p = G.player;
  if (p.inCar && p.car) {
    return p.car.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  }
  return p.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
}

function addTracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  G.tracers.push({ line, life: 0.12 });
}

// Hitscan pistol shot from the camera centre through the crosshair.
export function tryShoot(G) {
  const p = G.player;
  if (G.state !== 'playing' || p.health <= 0) return;
  if (p.shootCooldown > 0) return;
  p.shootCooldown = 0.28;
  if (G.audio.ctx) G.audioApi.sfx.shoot(G);
  const from = muzzleWorldPos(G);
  raycaster.setFromCamera(new THREE.Vector2(0, 0), G.camera);
  raycaster.far = 80;
  const targets = [];
  for (const ped of G.peds) if (!ped.dead) targets.push({ mesh: ped.mesh, kind: 'ped', ref: ped });
  for (const e of G.enemies) if (!e.dead) targets.push({ mesh: e.mesh, kind: 'enemy', ref: e });
  for (const car of G.cars) targets.push({ mesh: car.mesh, kind: 'car', ref: car });
  const hits = raycaster.intersectObjects(targets.map((t) => t.mesh), true);
  let end = from.clone().add(raycaster.ray.direction.clone().multiplyScalar(80));
  let hitSomething = false;
  if (hits.length > 0) {
    const h = hits[0];
    end = h.point.clone();
    // find which logical target the hit mesh belongs to
    let owner = h.object;
    while (owner.parent && owner.parent !== G.scene) owner = owner.parent;
    const t = targets.find((tt) => tt.mesh === owner);
    if (t) {
      hitSomething = true;
      const dmg = 34;
      if (t.kind === 'ped') {
        t.ref.health -= dmg;
        spawnDamageNumber(G, h.point, `-${dmg}`, '#ffd23a');
        if (t.ref.health <= 0) {
          t.ref.dead = true;
          t.ref.mesh.rotation.x = -Math.PI / 2; t.ref.mesh.position.y = 0.35;
          G.police.addWanted(G, 2, 'You shot someone in broad daylight');
        }
      } else if (t.kind === 'enemy') {
        t.ref.health -= dmg;
        spawnDamageNumber(G, h.point, `-${dmg}`, '#ff5a4e', true);
        if (t.ref.health <= 0) {
          t.ref.dead = true;
          t.ref.mesh.rotation.x = -Math.PI / 2; t.ref.mesh.position.y = 0.35;
          G.spawnParticles(h.point, 0xff5544, 14, 5);
          G.hud.toast(`${t.ref.name} is down.`);
          G.missions.onEnemyDown(G, t.ref);
        }
      } else if (t.kind === 'car') {
        t.ref.health -= 18;
        spawnDamageNumber(G, h.point, `-${18}`, '#ffd23a');
        G.spawnParticles(h.point, 0xffcc66, 6, 3);
        if (t.ref.isTraffic) G.police.addWanted(G, 1, 'Shots fired at traffic');
      }
    }
  }
  addTracer(G, from, end);
  G.spawnParticles(end, 0xffe9a8, hitSomething ? 6 : 2, 2);
  scarePedestrians(G, p.pos, 22);
  G.cameraShake = Math.max(G.cameraShake, 0.12);
}

export function tryPunch(G) {
  const p = G.player;
  if (G.state !== 'playing' || p.inCar || p.health <= 0) return;
  if (p.punchCooldown > 0) return;
  p.punchCooldown = 0.45;
  if (G.audio.ctx) G.audioApi.sfx.punch(G);
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const reach = new THREE.Vector3(p.pos.x + fx * 1.6, 1.2, p.pos.z + fz * 1.6);
  let hitAny = false;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const d = Math.hypot(ped.mesh.position.x - reach.x, ped.mesh.position.z - reach.z);
    if (d < 1.4) {
      ped.health -= 25;
      spawnDamageNumber(G, ped.mesh.position.clone().setY(2), '-25', '#ffd23a');
      if (ped.health <= 0) {
        ped.dead = true;
        ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.35;
        G.police.addWanted(G, 1, 'Assault in public');
      }
      hitAny = true;
    }
  }
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.mesh.position.x - reach.x, e.mesh.position.z - reach.z);
    if (d < 1.6) {
      e.health -= 30;
      spawnDamageNumber(G, e.mesh.position.clone().setY(2), '-30', '#ff5a4e', true);
      if (e.health <= 0) {
        e.dead = true;
        e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.y = 0.35;
        G.missions.onEnemyDown(G, e);
      }
      hitAny = true;
    }
  }
  if (hitAny) G.cameraShake = Math.max(G.cameraShake, 0.1);
  p.armR.rotation.x = -1.6; // punch swing, eases back in updatePlayer
}

// Floating combat text: a pooled DOM element projected from world space each frame.
export function spawnDamageNumber(G, worldPos, text, color, crit = false) {
  let el = dmgPool.find((d) => !d.active);
  if (!el) {
    if (dmgPool.length >= 14) return;
    const div = document.createElement('div');
    div.className = 'dmg';
    G.damageLayer.appendChild(div);
    el = { div, active: false, pos: new THREE.Vector3(), life: 0 };
    dmgPool.push(el);
  }
  el.active = true; el.life = 0.9;
  el.pos.copy(worldPos);
  el.div.textContent = text;
  el.div.style.color = color;
  el.div.classList.toggle('crit', crit);
  el.div.style.opacity = '1';
}

export function updateCombat(G, dt) {
  // damage numbers float up and fade
  for (const el of dmgPool) {
    if (!el.active) continue;
    el.life -= dt;
    if (el.life <= 0) { el.active = false; el.div.style.opacity = '0'; continue; }
    el.pos.y += dt * 1.6;
    screenVec.copy(el.pos).project(G.camera);
    if (screenVec.z > 1) { el.div.style.opacity = '0'; continue; }
    const x = (screenVec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenVec.y * 0.5 + 0.5) * window.innerHeight;
    el.div.style.left = `${x}px`;
    el.div.style.top = `${y}px`;
    el.div.style.opacity = String(Math.min(1, el.life / 0.4));
  }
  // tracer fade
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
    if (t.life <= 0) { G.scene.remove(t.line); t.line.geometry.dispose(); G.tracers.splice(i, 1); }
  }
  // enemies shoot back at the player
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead || p.health <= 0 || G.state !== 'playing') continue;
    e.shootTimer -= dt;
    const d = Math.hypot(e.mesh.position.x - p.pos.x, e.mesh.position.z - p.pos.z);
    e.mesh.lookAt(p.pos.x, 0, p.pos.z);
    if (e.shootTimer <= 0 && d < 45) {
      e.shootTimer = 1.1 + Math.random() * 0.7;
      if (G.audio.ctx) G.audioApi.sfx.shoot(G);
      const from = e.mesh.position.clone().setY(1.3);
      const to = p.pos.clone().setY(1.3);
      addTracer(G, from, to);
      if (Math.random() < 0.55) damagePlayer(G, 7 + Math.floor(Math.random() * 6), e.name);
    }
  }
}

export function damagePlayer(G, amount, source) {
  const p = G.player;
  if (p.health <= 0) return;
  p.health -= amount;
  G.cameraShake = Math.max(G.cameraShake, 0.25);
  G.hud.flashDamage();
  if (p.health <= 0) {
    p.health = 0;
    wasted(G, source);
  }
}

function wasted(G, source) {
  const p = G.player;
  const loss = Math.floor(p.cash * 0.1);
  p.cash -= loss;
  G.wanted = 0;
  if (G.police) G.police.clearPoliceCars(G);
  G.state = 'wasted';
  if (p.inCar) { p.inCar = false; if (p.car) p.car.isPlayer = false; p.car = null; p.mesh.visible = true; }
  if (G.audio.ctx) G.audioApi.sfx.wasted(G);
  document.getElementById('wasted-sub').textContent =
    `${source || 'Solmar Bay'} got the better of you. Hospital bills cost you $${loss}.`;
  document.getElementById('wasted-screen').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  G.save.saveGame(G);
}
