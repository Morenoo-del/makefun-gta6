// traffic.js — ambient city life: cars that drive the road grid and pedestrians
// who stroll the sidewalks (and run when things get loud).
import * as THREE from 'three';
import { spawnCar, makeCarMesh } from './vehicles.js';
import { nearestRoad, collidesBuilding } from './city.js';

const PED_SHIRTS = [0xd95f4b, 0x4b7fd9, 0x7ed94b, 0xd9c24b, 0x9b4bd9, 0xe2e2e2, 0x3a3a3a];
const PED_NAMES = ['Beachgoer', 'Dockworker', 'Tourist', 'Vendor', 'Jogger', 'Student'];

export function spawnTraffic(G) {
  G.traffic = [];
  const rng = G.rng;
  const colors = [0xc0392b, 0x2e6fb0, 0xd8c53a, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x222226];
  for (let i = 0; i < 14; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const axisRoads = G.city.roads.filter((r) => r.axis === axis);
    const road = axisRoads[Math.floor(rng() * axisRoads.length)];
    const dir = rng() < 0.5 ? 1 : -1;
    const along = (rng() * 2 - 1) * 200;
    const lane = dir > 0 ? 3.5 : -3.5; // right-hand traffic
    const x = axis === 'x' ? along : road.at + lane;
    const z = axis === 'x' ? road.at + lane : along;
    const car = spawnCar(G, x, z, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      colors[Math.floor(rng() * colors.length)], { traffic: true });
    car.speed = 9 + rng() * 5;
    car.traffic = { axis, dir, roadAt: road.at, lane, cruise: car.speed, slowTimer: 0 };
    G.traffic.push(car);
  }
}

export function updateTraffic(G, dt) {
  const p = G.player;
  for (const car of G.traffic) {
    const t = car.traffic;
    // slow down if the player (or another car) is right ahead
    let targetSpeed = t.cruise;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    for (const other of G.cars) {
      if (other === car) continue;
      const dx = other.mesh.position.x - car.mesh.position.x;
      const dz = other.mesh.position.z - car.mesh.position.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 12 && side < 3) { targetSpeed = Math.min(targetSpeed, 2); break; }
    }
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
    let nx = car.mesh.position.x + fx * car.speed * dt;
    let nz = car.mesh.position.z + fz * car.speed * dt;

    // at an intersection, sometimes turn onto the cross road
    const along = t.axis === 'x' ? nx : nz;
    const nearLine = Math.abs(((along + 208) % 52 + 52) % 52) < 1.2 || Math.abs(((along + 208) % 52 + 52) % 52 - 52) < 1.2;
    if (nearLine && Math.random() < 0.012) {
      const crossAt = nearestRoad(G, t.axis === 'x' ? 'z' : 'x', t.axis === 'x' ? nz : nx);
      const newDir = Math.random() < 0.5 ? 1 : -1;
      const newLane = newDir > 0 ? 3.5 : -3.5;
      if (t.axis === 'x') {
        nz = crossAt + newLane;
        car.yaw = newDir > 0 ? 0 : Math.PI;
        t.axis = 'z'; t.dir = newDir; t.roadAt = crossAt; t.lane = newLane;
      } else {
        nx = crossAt + newLane;
        car.yaw = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        t.axis = 'x'; t.dir = newDir; t.roadAt = crossAt; t.lane = newLane;
      }
    }
    // wrap around the city edge instead of driving into the ocean
    if (nx > 240 || nx < -240 || nz > 240 || nz < -240) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const road = G.city.roads.filter((r) => r.axis === axis)[Math.floor(Math.random() * 9)];
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = dir > 0 ? 3.5 : -3.5;
      nx = axis === 'x' ? -dir * 200 : road.at + lane;
      nz = axis === 'x' ? road.at + lane : -dir * 200;
      car.yaw = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      t.axis = axis; t.dir = dir; t.roadAt = road.at; t.lane = lane;
    }
    car.mesh.position.x = nx; car.mesh.position.z = nz;
    car.mesh.rotation.y = car.yaw;
    car.wheelSpin += car.speed * dt * 2.2;
    for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;

    // bumping a traffic car while speeding is a crime the police notice
    if (p.inCar && p.car) {
      const d = Math.hypot(p.car.mesh.position.x - nx, p.car.mesh.position.z - nz);
      if (d < 3.4 && Math.abs(p.car.speed) > 8) {
        car.speed = 4;
        G.police.addWanted(G, 1, 'Reckless driving');
        p.car.speed *= 0.6;
        G.spawnParticles(car.mesh.position, 0xffcc66, 8, 4);
        if (G.audio.ctx) G.audioApi.sfx.crash(G);
      }
    }
  }
}

// ---- pedestrians ----
function makePedMesh(shirtColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xb98a68 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.3), shirt);
  torso.position.y = 1.05; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
  head.position.y = 1.58; group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), pants);
  legL.position.set(-0.14, 0.31, 0); group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; group.add(legR);
  group.userData.legL = legL; group.userData.legR = legR;
  return group;
}

export function spawnPedestrians(G) {
  G.peds = [];
  const rng = G.rng;
  for (let i = 0; i < 22; i++) {
    const mesh = makePedMesh(PED_SHIRTS[Math.floor(rng() * PED_SHIRTS.length)]);
    // retry a few times so pedestrians land on open sidewalk, not inside a building
    let x = 0, z = 0, free = false;
    for (let tries = 0; tries < 8 && !free; tries++) {
      x = (rng() * 2 - 1) * 200; z = (rng() * 2 - 1) * 200;
      free = !collidesBuilding(G, x, z, 2);
    }
    if (!free) continue;
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, name: PED_NAMES[Math.floor(rng() * PED_NAMES.length)],
      health: 100, walkPhase: rng() * 6, speed: 1.2 + rng() * 1.4,
      target: new THREE.Vector3((rng() * 2 - 1) * 200, 0, (rng() * 2 - 1) * 200),
      fleeing: 0, panicFrom: null, dead: false,
    });
  }
}

export function updatePedestrians(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const m = ped.mesh;
    // fleeing from a recent gunshot
    let target = ped.target;
    let speed = ped.speed;
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      speed = 6.5;
      if (ped.panicFrom) {
        const away = new THREE.Vector3().subVectors(m.position, ped.panicFrom).setY(0);
        if (away.lengthSq() > 0.01) target = m.position.clone().add(away.normalize().multiplyScalar(30));
      }
    }
    const dx = target.x - m.position.x, dz = target.z - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      // pick a new stroll destination on a sidewalk-ish spot
      let nx, nz, tries = 0;
      do {
        nx = (Math.random() * 2 - 1) * 200; nz = (Math.random() * 2 - 1) * 200; tries++;
      } while (collidesBuilding(G, nx, nz, 2) && tries < 6);
      ped.target.set(nx, 0, nz);
      ped.fleeing = 0;
    } else {
      const vx = (dx / d) * speed, vz = (dz / d) * speed;
      const pos = { x: m.position.x + vx * dt, z: m.position.z + vz * dt };
      const hit = collidesBuilding(G, pos.x, pos.z, 0.6);
      if (!hit) { m.position.x = pos.x; m.position.z = pos.z; }
      m.rotation.y = Math.atan2(vx, vz);
      ped.walkPhase += dt * speed * 4;
      const s = Math.sin(ped.walkPhase);
      m.userData.legL.rotation.x = s * 0.6;
      m.userData.legR.rotation.x = -s * 0.6;
    }
    // hit by the player's car: knocked down, police take notice
    if (p.inCar && p.car && Math.abs(p.car.speed) > 4) {
      const dd = Math.hypot(p.car.mesh.position.x - m.position.x, p.car.mesh.position.z - m.position.z);
      if (dd < 2.2) {
        ped.health = 0; ped.dead = true;
        m.rotation.x = -Math.PI / 2; m.position.y = 0.35;
        G.police.addWanted(G, 1, 'Hit a pedestrian');
        G.spawnParticles(m.position, 0xff5544, 12, 5);
        G.hud.toast('Pedestrian down!', 'Witnesses called the police.');
      }
    }
  }
}

// Pedestrians near a point panic and run away from it.
export function scarePedestrians(G, point, radius) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const d = Math.hypot(ped.mesh.position.x - point.x, ped.mesh.position.z - point.z);
    if (d < radius) { ped.fleeing = 3 + Math.random() * 2; ped.panicFrom = point.clone(); }
  }
}
