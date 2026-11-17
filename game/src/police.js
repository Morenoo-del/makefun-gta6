// police.js — the wanted system: stars, patrol-car pursuit, ramming, and getting busted.
import * as THREE from 'three';
import { spawnCar } from './vehicles.js';
import { resolveBuildingCollision } from './city.js';

export function createPolice(G) {
  G.wanted = 0;
  G.bestWanted = 0;
  G.wantedTimer = 0;      // counts down to losing one star
  G.policeCars = [];
  G.bustedTimer = 0;
  G.sirenOn = false;
}

export function addWanted(G, stars, reason) {
  if (G.state !== 'playing') return;
  const before = G.wanted;
  G.wanted = Math.max(0, Math.min(5, G.wanted + stars));
  if (G.wanted > before) {
    G.bestWanted = Math.max(G.bestWanted, G.wanted);
    G.wantedTimer = 25;
    syncPoliceCars(G);
    if (G.audio.ctx) G.audioApi.sfx.sirenBlip(G);
    G.hud.flashWanted();
    if (reason) G.hud.toast(`${'★'.repeat(G.wanted)} WANTED`, reason);
  }
}

export function setWanted(G, stars, reason) {
  G.wanted = Math.max(0, Math.min(5, stars));
  G.bestWanted = Math.max(G.bestWanted, G.wanted);
  G.wantedTimer = 25;
  syncPoliceCars(G);
  if (reason) G.hud.toast(`${'★'.repeat(G.wanted)} WANTED`, reason);
}

export function clearPoliceCars(G) {
  for (const car of G.policeCars) {
    G.scene.remove(car.mesh);
    const idx = G.cars.indexOf(car);
    if (idx >= 0) G.cars.splice(idx, 1);
  }
  G.policeCars.length = 0;
}

// Keep the number of active patrol cars equal to the wanted level (1 car per star).
function syncPoliceCars(G) {
  while (G.policeCars.length < G.wanted) {
    const p = G.player;
    const ang = Math.random() * Math.PI * 2;
    const dist = 55 + Math.random() * 25;
    let x = p.pos.x + Math.cos(ang) * dist;
    let z = p.pos.z + Math.sin(ang) * dist;
    x = Math.max(-230, Math.min(240, x));
    z = Math.max(-240, Math.min(240, z));
    const car = spawnCar(G, x, z, Math.atan2(p.pos.x - x, p.pos.z - z), 0xf2f2f2,
      { police: true, name: 'SBP Patrol' });
    car.speed = 0;
    car.police = { stuck: 0, ramCooldown: 0 };
    G.policeCars.push(car);
  }
  while (G.policeCars.length > G.wanted) {
    const car = G.policeCars.pop();
    G.scene.remove(car.mesh);
    const idx = G.cars.indexOf(car);
    if (idx >= 0) G.cars.splice(idx, 1);
  }
}

export function updatePolice(G, dt) {
  const p = G.player;
  // wanted decay: one star fades every 25 quiet seconds
  if (G.wanted > 0) {
    G.wantedTimer -= dt;
    if (G.wantedTimer <= 0) {
      G.wanted -= 1;
      G.wantedTimer = 25;
      syncPoliceCars(G);
      if (G.wanted === 0) G.hud.toast('You lost the heat.', 'The SBP called off the chase.');
    }
  }
  // siren light bar flash + audio
  const sirenOn = G.wanted > 0 && G.state === 'playing';
  if (sirenOn !== G.sirenOn) {
    G.sirenOn = sirenOn;
    if (G.audio.ctx) G.audioApi.setSiren(G, sirenOn);
  }
  for (const car of G.policeCars) {
    const bar = car.mesh.userData.lightBar;
    if (bar) {
      const phase = Math.floor(G.time * 6) % 2 === 0;
      bar.material.emissive.setHex(phase ? 0xff2222 : 0x2244ff);
      bar.material.emissiveIntensity = 1.4;
    }
    const target = p.inCar && p.car ? p.car.mesh.position : p.pos;
    const dx = target.x - car.mesh.position.x;
    const dz = target.z - car.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz);
    let dy = wantYaw - car.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const topSpeed = 30 + G.wanted * 3.5; // hotter wanted = faster cops
    car.speed += (topSpeed - car.speed) * Math.min(1, dt * 0.7);
    car.yaw += Math.max(-2.4, Math.min(2.4, dy * 3)) * dt;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const pos = { x: car.mesh.position.x + fx * car.speed * dt, z: car.mesh.position.z + fz * car.speed * dt };
    const hit = resolveBuildingCollision(G, pos, 2.2);
    if (hit) {
      car.speed *= 0.5;
      car.police.stuck += dt;
      if (car.police.stuck > 1.2) { // back out of the wall
        car.yaw += Math.PI * 0.9; car.police.stuck = 0; car.speed = 6;
      }
    } else {
      car.police.stuck = 0;
    }
    pos.x = Math.max(-234, Math.min(248, pos.x));
    pos.z = Math.max(-248, Math.min(248, pos.z));
    car.mesh.position.x = pos.x; car.mesh.position.z = pos.z;
    car.mesh.rotation.y = car.yaw;
    car.wheelSpin += car.speed * dt * 2.2;
    for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
    car.police.ramCooldown = Math.max(0, car.police.ramCooldown - dt);

    // ramming the player's car
    if (p.inCar && p.car && dist < 4.6 && car.police.ramCooldown <= 0) {
      car.police.ramCooldown = 1.1;
      const push = new THREE.Vector3(dx / (dist || 1), 0, dz / (dist || 1));
      p.car.mesh.position.addScaledVector(push, 1.4);
      p.car.speed *= 0.82;
      p.car.health -= 6;
      G.spawnParticles(p.car.mesh.position, 0xffcc66, 10, 4);
      if (G.audio.ctx) G.audioApi.sfx.crash(G);
      G.hud.toast('Police rammed you!', 'Your car is taking damage.');
    }
    // busted: a patrol car sits on the player on foot
    if (!p.inCar && dist < 3.2) {
      G.bustedTimer += dt;
      if (G.bustedTimer > 1.6) { bustPlayer(G); return; }
    } else {
      G.bustedTimer = Math.max(0, G.bustedTimer - dt * 2);
    }
  }
}

function bustPlayer(G) {
  const p = G.player;
  G.bustedTimer = 0;
  const fine = Math.min(p.cash, 200 + Math.floor(p.cash * 0.1));
  p.cash -= fine;
  G.wanted = 0; syncPoliceCars(G);
  G.state = 'busted';
  if (p.inCar) {
    p.inCar = false; p.car.isPlayer = false; p.car = null;
    p.mesh.visible = true;
  }
  if (G.audio.ctx) G.audioApi.sfx.busted(G);
  document.getElementById('busted-sub').textContent =
    `The Solmar Bay Police caught up with you. Bail and fines cost you $${fine}.`;
  document.getElementById('busted-screen').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  G.save.saveGame(G);
}
