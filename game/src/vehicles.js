// vehicles.js — car meshes, arcade driving physics, entering / exiting / stealing.
import * as THREE from 'three';
import { resolveBuildingCollision } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2e6fb0, 0xd8c53a, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x222226, 0x16a085, 0xb03a5b];
const CAR_NAMES = ['Vento GT', 'Kairo Coupe', 'Solmar Cruiser', 'Tide Runner', 'Palma Sedan', 'Coral Hatch', 'Bayline Van', 'Marina Sport'];

export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.08, -0.25); cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    group.add(w); wheels.push(w);
  }
  // headlights / taillights
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 0.8 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), headMat);
    h.position.set(sx, 0.62, 2.22); group.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 0.7 });
  for (const sx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tailMat);
    t.position.set(sx, 0.62, -2.22); group.add(t);
  }
  if (opts.police) {
    // black-and-white patrol livery + light bar
    body.material = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 1.6), new THREE.MeshLambertMaterial({ color: 0x14181f }));
    band.position.set(0, 0.62, -0.4); group.add(band);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 1 }));
    bar.position.set(0, 1.42, -0.25); group.add(bar);
    group.userData.lightBar = bar;
  }
  group.userData.wheels = wheels;
  return group;
}

export function spawnCar(G, x, z, yaw, color, opts = {}) {
  const mesh = makeCarMesh(color, opts);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  G.scene.add(mesh);
  const car = {
    mesh, yaw, speed: 0, steer: 0, color,
    name: opts.name || CAR_NAMES[Math.floor(Math.random() * CAR_NAMES.length)],
    health: 100, owned: !!opts.owned, isPolice: !!opts.police,
    isTraffic: !!opts.traffic, isPlayer: false,
    wheelSpin: 0, smokeTimer: 0, stuckTimer: 0,
  };
  G.cars.push(car);
  return car;
}

// A few drivable cars parked along the roads near the spawn, plus the player's starter car.
export function spawnParkedCars(G) {
  const rng = G.rng;
  const spots = [
    { x: -198, z: -40, yaw: 0 }, { x: -198, z: 30, yaw: 0 }, { x: 52, z: -198, yaw: Math.PI / 2 },
    { x: -146, z: 104, yaw: Math.PI }, { x: 104, z: -146, yaw: -Math.PI / 2 }, { x: 4, z: 156, yaw: Math.PI / 2 },
    { x: -52, z: -52, yaw: 0 }, { x: 156, z: 52, yaw: Math.PI },
  ];
  for (const s of spots) {
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    spawnCar(G, s.x, s.z, s.yaw, color, { name: CAR_NAMES[Math.floor(rng() * CAR_NAMES.length)] });
  }
  // Milo's own starter car, parked outside the Marina Court apartments.
  const mine = spawnCar(G, -194, -8, 0, 0xff8c2e, { name: 'Milo\u2019s Vento GT', owned: true });
  G.playerCar = mine;
  return mine;
}

export function nearestCar(G, pos, maxDist) {
  let best = null, bd = maxDist;
  for (const car of G.cars) {
    if (car.isTraffic || car.isPolice) continue;
    const d = Math.hypot(car.mesh.position.x - pos.x, car.mesh.position.z - pos.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

// Arcade driving: accelerate, brake/reverse, steering that tightens at low speed,
// handbrake drift with skid particles. dt in seconds.
export function updateDriving(G, dt) {
  const car = G.player.car;
  if (!car || G.player.health <= 0) return;
  const k = G.keys;
  const forward = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
  const steerIn = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
  const handbrake = !!k['Space'];
  const maxSpeed = 42;              // ~150 km/h feel
  const accel = 26;
  if (forward > 0) car.speed += accel * dt;
  else if (forward < 0) car.speed -= (car.speed > 1 ? 34 : 14) * dt; // brake, then reverse
  else car.speed -= Math.sign(car.speed) * 10 * dt;                  // drag
  if (handbrake) car.speed -= Math.sign(car.speed) * 26 * dt;
  if (Math.abs(car.speed) < 0.2 && forward === 0) car.speed = 0;
  car.speed = Math.max(-14, Math.min(maxSpeed, car.speed));

  // steering: sharper when slow, plus drift slide on handbrake
  const speedFactor = Math.min(1, Math.abs(car.speed) / 12);
  const steerTarget = steerIn * (0.55 + 0.45 * (1 - speedFactor)) * (car.speed >= 0 ? 1 : -1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const turnRate = car.steer * (0.9 + 0.9 * speedFactor) * Math.min(1, Math.abs(car.speed) / 6);
  car.yaw += turnRate * dt * Math.sign(car.speed || 1) * (car.speed >= 0 ? 1 : -1);
  if (handbrake && Math.abs(car.speed) > 8) car.yaw += steerIn * 1.1 * dt;

  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  let nx = car.mesh.position.x + fx * car.speed * dt;
  let nz = car.mesh.position.z + fz * car.speed * dt;
  const pos = { x: nx, z: nz };
  const hitWall = resolveBuildingCollision(G, pos, 2.2);
  if (hitWall && Math.abs(car.speed) > 6) {
    car.speed *= 0.45;
    G.spawnParticles(car.mesh.position, 0xffcc66, 10, 4);
    if (G.audio.ctx) { const { sfx } = G.audioApi; sfx.crash(G); }
    car.health -= Math.abs(car.speed) * 0.4;
  }
  // stay inside the city + off the deep ocean
  pos.x = Math.max(-232, Math.min(248, pos.x));
  pos.z = Math.max(-248, Math.min(248, pos.z));
  car.mesh.position.x = pos.x; car.mesh.position.z = pos.z;
  car.mesh.rotation.y = car.yaw;
  // body roll + wheel spin
  car.mesh.rotation.z = -car.steer * 0.06 * Math.min(1, Math.abs(car.speed) / 20);
  car.wheelSpin += car.speed * dt * 2.2;
  for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
  // skid particles + smoke when wrecked
  if (handbrake && Math.abs(car.speed) > 10 && Math.random() < 0.6) {
    G.spawnParticles(new THREE.Vector3(pos.x - fx * 1.6, 0.2, pos.z - fz * 1.6), 0x888888, 2, 1.5);
  }
  if (car.health < 35) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.12;
      G.spawnParticles(new THREE.Vector3(pos.x, 1.2, pos.z), 0x555555, 3, 1);
    }
  }
  if (car.health <= 0) {
    if (!car.wrecked) {
      car.wrecked = true;
      G.hud.toast('Your car is wrecked — get out and find another one.');
    }
    car.speed = 0;
  }
}

export function enterCar(G, car) {
  const p = G.player;
  p.inCar = true; p.car = car;
  car.isPlayer = true;
  p.mesh.visible = false;
  if (!car.owned) {
    car.owned = true; // it is yours now
    G.hud.toast('Car stolen!', 'The Solmar Bay Police have been alerted.');
    G.police.addWanted(G, 1, 'Grand theft auto');
    if (G.audio.ctx) G.audioApi.sfx.sirenBlip(G);
  } else {
    G.hud.toast(car.name);
  }
  G.hud.setDriving(true, car.name);
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  p.inCar = false; p.car = null;
  car.isPlayer = false; car.speed = 0;
  const side = Math.random() < 0.5 ? 1 : -1;
  p.pos.set(car.mesh.position.x - fz * side * 2.4, 0, car.mesh.position.z + fx * side * 2.4);
  p.mesh.position.copy(p.pos);
  p.mesh.visible = true;
  p.yaw = car.yaw;
  G.hud.setDriving(false, '');
}
