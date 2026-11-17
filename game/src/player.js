// player.js — Milo Kade on foot: movement, the low-poly character mesh, third-person camera.
import * as THREE from 'three';
import { resolveBuildingCollision } from './city.js';

export function createPlayer(G) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x1f8a6e });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3442 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1c1410 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
  head.position.y = 1.72; head.castShadow = true; group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.44), hair);
  hairTop.position.y = 1.96; group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legL.position.set(-0.16, 0.36, 0); legL.castShadow = true; group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armL.position.set(-0.42, 1.14, 0); armL.castShadow = true; group.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; group.add(armR);
  // a simple pistol in the right hand (visible when armed)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.42, 0.82, 0.18); group.add(gun);

  group.position.set(-196, 0, 0);
  G.scene.add(group);
  G.player = {
    mesh: group, legL, legR, armL, armR, gun,
    pos: new THREE.Vector3(-196, 0, 0),
    yaw: 0, walkPhase: 0,
    health: 100, cash: 0,
    inCar: false, car: null,
    speed: 0, moving: false,
    camYaw: Math.PI, camPitch: 0.32, camDist: 9,
    punchCooldown: 0, shootCooldown: 0,
  };
  return G.player;
}

// On-foot update: WASD relative to camera, sprint, building collision, walk animation.
export function updatePlayer(G, dt) {
  const p = G.player;
  if (p.inCar || p.health <= 0) { p.moving = false; return; }
  const k = G.keys;
  const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
  const strafe = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
  const sprint = k['ShiftLeft'] || k['ShiftRight'];
  const speed = sprint ? 9.5 : 5.2;
  let mx = 0, mz = 0;
  if (fwd || strafe) {
    const cy = p.camYaw;
    // camera looks along -Z rotated by camYaw; forward is away from camera
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const rx = -Math.cos(cy), rz = Math.sin(cy);
    mx = fx * fwd + rx * strafe;
    mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    p.yaw = Math.atan2(mx, mz);
    p.moving = true;
  } else {
    p.moving = false;
  }
  const nx = p.pos.x + mx * speed * dt;
  const nz = p.pos.z + mz * speed * dt;
  const pos = { x: nx, z: nz };
  resolveBuildingCollision(G, pos, 0.7);
  pos.x = Math.max(-234, Math.min(248, pos.x));
  pos.z = Math.max(-248, Math.min(248, pos.z));
  p.pos.set(pos.x, 0, pos.z);
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.yaw;
  // walk-cycle swing
  if (p.moving) {
    p.walkPhase += dt * (sprint ? 13 : 9);
    const s = Math.sin(p.walkPhase);
    p.legL.rotation.x = s * 0.7; p.legR.rotation.x = -s * 0.7;
    p.armL.rotation.x = -s * 0.5; p.armR.rotation.x = s * 0.5;
  } else {
    p.legL.rotation.x *= 0.8; p.legR.rotation.x *= 0.8;
    p.armL.rotation.x *= 0.8; p.armR.rotation.x *= 0.8;
  }
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
}

// Third-person camera: drag to orbit, wheel to zoom. Follows the player or their car.
export function updateCamera(G, dt) {
  const p = G.player;
  const cam = G.camera;
  let target;
  if (p.inCar && p.car) {
    const car = p.car;
    // chase cam: ease the camera yaw toward the car's heading
    let dy = car.yaw - p.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    p.camYaw += dy * Math.min(1, dt * 2.2);
    p.camPitch += (0.26 - p.camPitch) * Math.min(1, dt * 3);
    target = car.mesh.position;
  } else {
    target = p.mesh.position;
  }
  const dist = p.inCar ? 12 : p.camDist;
  const pitch = p.camPitch;
  const cx = target.x - Math.sin(p.camYaw) * Math.cos(pitch) * dist;
  const cz = target.z - Math.cos(p.camYaw) * Math.cos(pitch) * dist;
  const cy = (p.inCar ? 3.4 : 2.2) + Math.sin(pitch) * dist;
  const desired = new THREE.Vector3(cx, cy, cz);
  cam.position.lerp(desired, Math.min(1, dt * 10));
  cam.lookAt(target.x, target.y + (p.inCar ? 1.4 : 1.6), target.z);
}

export function addCameraInput(G) {
  const canvas = G.renderer.domElement;
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (G.state === 'playing' && e.button === 0) G.combat.tryShoot(G);
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const p = G.player;
    p.camYaw -= dx * 0.005;
    p.camPitch = Math.max(-0.15, Math.min(0.9, p.camPitch + dy * 0.004));
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    G.player.camDist = Math.max(5, Math.min(16, G.player.camDist + e.deltaY * 0.01));
  }, { passive: false });
}
