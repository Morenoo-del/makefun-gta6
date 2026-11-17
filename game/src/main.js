// main.js — SOLMAR BAY boot + game loop: wires every system together,
// runs the frame update, and stages deterministic ?shot= scenes for screenshots.
import * as THREE from 'three';
import { buildCity, mulberry32 } from './city.js';
import { createPlayer, updatePlayer, updateCamera, addCameraInput } from './player.js';
import * as Vehicles from './vehicles.js';
import * as Traffic from './traffic.js';
import * as Police from './police.js';
import * as Missions from './missions.js';
import * as Combat from './combat.js';
import * as Hud from './hud.js';
import * as AudioSys from './audio.js';
import * as SaveSys from './save.js';

const G = {
  state: 'menu',           // menu | playing | paused | busted | wasted
  time: 0, cameraShake: 0,
  keys: {}, cars: [], traffic: [], peds: [], policeCars: [], enemies: [],
  totalEarned: 0, bestWanted: 0, wanted: 0,
  rng: mulberry32(20261117),
  shot: new URLSearchParams(location.search).get('shot'),
  shotStaged: false, shotFrames: 0,
};

window.__game = G;

// ---------- particles: one Points cloud, pooled ----------
const MAX_PARTICLES = 400;
let particleGeo, particlePos, particleVel, particleLife, particlePts;
function initParticles() {
  particleGeo = new THREE.BufferGeometry();
  particlePos = new Float32Array(MAX_PARTICLES * 3);
  particleVel = new Float32Array(MAX_PARTICLES * 3);
  particleLife = new Float32Array(MAX_PARTICLES);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffcc66, size: 0.5, transparent: true, opacity: 0.9 });
  particlePts = new THREE.Points(particleGeo, mat);
  particlePts.frustumCulled = false;
  G.scene.add(particlePts);
  G.particleCursor = 0;
}
G.spawnParticles = (pos, color, n, spread) => {
  if (!particlePts) return;
  for (let i = 0; i < n; i++) {
    const idx = G.particleCursor;
    G.particleCursor = (G.particleCursor + 1) % MAX_PARTICLES;
    particlePos[idx * 3] = pos.x; particlePos[idx * 3 + 1] = pos.y; particlePos[idx * 3 + 2] = pos.z;
    particleVel[idx * 3] = (Math.random() - 0.5) * spread;
    particleVel[idx * 3 + 1] = Math.random() * spread * 0.8 + 1;
    particleVel[idx * 3 + 2] = (Math.random() - 0.5) * spread;
    particleLife[idx] = 0.5 + Math.random() * 0.5;
  }
  particlePts.material.color.setHex(color);
};
function updateParticles(dt) {
  if (!particlePts) return;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (particleLife[i] <= 0) { particlePos[i * 3 + 1] = -100; continue; }
    particleLife[i] -= dt;
    particleVel[i * 3 + 1] -= 9 * dt;
    particlePos[i * 3] += particleVel[i * 3] * dt;
    particlePos[i * 3 + 1] += particleVel[i * 3 + 1] * dt;
    particlePos[i * 3 + 2] += particleVel[i * 3 + 2] * dt;
    if (particlePos[i * 3 + 1] < 0.05) { particlePos[i * 3 + 1] = 0.05; particleVel[i * 3 + 1] = 0; }
  }
  particleGeo.attributes.position.needsUpdate = true;
}

// ---------- boot ----------
function boot() {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc3e8);
  scene.fog = new THREE.Fog(0x9fc3e0, 320, 620);
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(-210, 12, 20);
  G.camera = camera;

  // wire the module namespaces other systems call through
  G.audio = AudioSys.createAudio();
  G.audioApi = { initAudio: AudioSys.initAudio, sfx: AudioSys.sfx, setEngineSound: AudioSys.setEngineSound, setSiren: AudioSys.setSiren, toggleMute: AudioSys.toggleMute };
  G.police = { createPolice: Police.createPolice, addWanted: Police.addWanted, setWanted: Police.setWanted, updatePolice: Police.updatePolice, clearPoliceCars: Police.clearPoliceCars };
  G.vehicles = { spawnCar: Vehicles.spawnCar, spawnParkedCars: Vehicles.spawnParkedCars, nearestCar: Vehicles.nearestCar, updateDriving: Vehicles.updateDriving, enterCar: Vehicles.enterCar, exitCar: Vehicles.exitCar };
  G.trafficApi = { spawnTraffic: Traffic.spawnTraffic, updateTraffic: Traffic.updateTraffic, spawnPedestrians: Traffic.spawnPedestrians, updatePedestrians: Traffic.updatePedestrians };
  G.combat = { tryShoot: Combat.tryShoot, tryPunch: Combat.tryPunch };
  G.save = { loadSave: SaveSys.loadSave, saveGame: SaveSys.saveGame, clearSave: SaveSys.clearSave };

  buildCity(G);
  initParticles();
  createPlayer(G);
  Vehicles.spawnParkedCars(G);
  Traffic.spawnTraffic(G);
  Traffic.spawnPedestrians(G);
  Police.createPolice(G);
  Combat.createCombat(G);
  Hud.createHud(G);
  Missions.createMissions(G);
  addCameraInput(G);

  // restore save
  const save = SaveSys.loadSave();
  if (save) {
    G.player.cash = save.cash;
    G.missions.done = save.missionsDone;
    G.bestWanted = save.bestWanted;
    G.totalEarned = save.totalEarned;
    document.getElementById('btn-continue').classList.remove('hidden');
    document.getElementById('btn-start').textContent = 'NEW GAME';
    // if a save already finished the story, keep the free-roam objective
    if (G.missions.done >= 3) G.hud.setObjective('All jobs complete. Solmar Bay is yours — free roam!', 'STORY COMPLETE');
  }

  bindUI();
  bindKeys();
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.getElementById('loading').remove();
  if (G.shot) {
    // screenshot mode: skip the menu, stage the scene deterministically
    startGame(true);
  } else {
    document.getElementById('start-screen').classList.remove('hidden');
  }
  renderer.setAnimationLoop(tick);
}

// ---------- UI / input ----------
function bindUI() {
  const start = () => { AudioSys.initAudio(G); startGame(false); };
  document.getElementById('btn-start').addEventListener('click', () => {
    SaveSys.clearSave();
    G.player.cash = 0; G.missions.done = 0; G.bestWanted = 0; G.totalEarned = 0;
    start();
  });
  document.getElementById('btn-continue').addEventListener('click', start);
  document.getElementById('btn-resume').addEventListener('click', () => resumeGame());
  document.getElementById('btn-save-quit').addEventListener('click', () => {
    SaveSys.saveGame(G);
    pauseGame(true);
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  });
  document.getElementById('btn-busted-ok').addEventListener('click', () => respawnAfterBusted());
  document.getElementById('btn-wasted-ok').addEventListener('click', () => respawnAfterWasted());
  document.getElementById('dialogue').addEventListener('click', () => Missions.advanceDialogue(G));
}

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    G.keys[e.code] = true;
    if (G.state !== 'playing') {
      if (e.code === 'Enter' && Missions.isDialogueOpen(G)) Missions.advanceDialogue(G);
      return;
    }
    if (e.code === 'KeyE') Missions.interact(G);
    if (e.code === 'KeyF') Combat.tryPunch(G);
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame(false);
    if (e.code === 'KeyM') {
      const muted = AudioSys.toggleMute(G);
      G.hud.toast(muted ? 'Sound muted' : 'Sound on');
    }
    if (e.code === 'Enter' && Missions.isDialogueOpen(G)) Missions.advanceDialogue(G);
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  window.addEventListener('blur', () => { G.keys = {}; });
}

function startGame(fromShot) {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('busted-screen').classList.add('hidden');
  document.getElementById('wasted-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  G.hud.setDriving(false, '');
  G.state = 'playing';
  if (!fromShot) {
    AudioSys.initAudio(G);
    if (G.missions.done === 0 && !G.missions.current) {
      G.hud.toast('Welcome to Solmar Bay', 'Follow the gold marker to Lena.');
    }
  }
  if (fromShot) stageShotScene();
}

function pauseGame(toTitle) {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  if (!toTitle) document.getElementById('pause-screen').classList.remove('hidden');
}

function resumeGame() {
  document.getElementById('pause-screen').classList.add('hidden');
  G.state = 'playing';
}

function respawnAfterBusted() {
  document.getElementById('busted-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  const p = G.player;
  p.pos.set(-196, 0, 0); p.mesh.position.copy(p.pos);
  p.health = 100; p.mesh.visible = true;
  G.state = 'playing';
  G.hud.toast('Back on the streets', 'Lay low for a while.');
}

function respawnAfterWasted() {
  document.getElementById('wasted-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  const p = G.player;
  p.pos.set(-150, 0, -156); p.mesh.position.copy(p.pos); // St. Marina Hospital
  p.health = 100; p.mesh.visible = true;
  G.state = 'playing';
  G.hud.toast('St. Marina Hospital', 'Patched up. The Bay is still out there.');
}

// ---------- deterministic ?shot= scenes ----------
function stageShotScene() {
  const p = G.player;
  const shot = G.shot;
  // common: hide the menu, make sure the HUD is visible
  document.getElementById('hud').classList.remove('hidden');
  if (shot === 'cover') {
    // driving the orange Vento through downtown, 2 stars, Job 1 on the drive-to step
    const car = G.playerCar;
    car.mesh.position.set(-196, 0, 52);
    car.yaw = Math.PI / 2; car.speed = 0;
    Vehicles.enterCar(G, car);
    p.camYaw = Math.PI / 2; p.camPitch = 0.3;
    Missions.startMission(G);
    for (let i = 0; i < 4; i++) Missions.advanceDialogue(G); // dismiss the intro
    Missions.advanceDialogue(G);                            // dismiss Mrs. Alvarez greeting
    Missions.updateMissions(G, 0.1);                        // meet step completes (already there)
    Missions.advanceDialogue(G);                            // dismiss her boarding line
    Missions.updateMissions(G, 0.1);                        // enterCar step completes (already in car)
    Missions.advanceDialogue(G);                            // dismiss the Marina line
    // drive back downtown for the shot, with the Marina marker live on the minimap
    car.mesh.position.set(-100, 0, 52);
    car.yaw = Math.PI / 2; car.speed = 26;
    Police.addWanted(G, 2, '');
    // one patrol car closing in from the oncoming lane ahead (visible in frame),
    // one trailing behind — neither close enough to ram before the capture
    if (G.policeCars[0]) {
      const pc0 = G.policeCars[0];
      pc0.mesh.position.set(-100 + 70, 0, 52 - 7);
      pc0.yaw = -Math.PI / 2; pc0.speed = 20;
    }
    if (G.policeCars[1]) {
      const pc1 = G.policeCars[1];
      pc1.mesh.position.set(-100 - 30, 0, 52 + 4);
      pc1.yaw = Math.PI / 2; pc1.speed = 20;
    }
  } else if (shot === 'chase') {
    const car = G.playerCar;
    car.mesh.position.set(0, 0, -52);
    car.yaw = 0; car.speed = 34;
    Vehicles.enterCar(G, car);
    p.camYaw = 0; p.camPitch = 0.28;
    Police.addWanted(G, 3, '');
    for (let i = 0; i < 3 && G.policeCars.length > i; i++) {
      const pc = G.policeCars[i];
      pc.mesh.position.set(-6 + (i % 2 ? 8 : -8), 0, -52 - 42 - i * 9);
      pc.yaw = 0; pc.speed = 30;
    }
    G.spawnParticles(new THREE.Vector3(0, 0.3, -58), 0x888888, 20, 3);
    G.hud.setObjective('Survive the chase — reach the hideout at 5th & Bay.', 'JOB 3 — THE GETAWAY');
  } else if (shot === 'mission') {
    // on foot at Pier 9 with the crate, rivals visible, dialogue open
    p.pos.set(-205, 0, -190); p.mesh.position.copy(p.pos);
    p.yaw = Math.PI * 0.75; p.camYaw = Math.PI * 0.75; p.camPitch = 0.3; p.camDist = 10;
    G.missions.done = 1;
    Missions.startMission(G);
    for (let i = 0; i < 4; i++) Missions.advanceDialogue(G); // dismiss the intro
    // the meet step's onEnter dialogue (the rivals' threat) stays open for the shot
    Combat.spawnEnemy(G, -207, -182, 'Voss Boy');
    Combat.spawnEnemy(G, -203, -197, 'Voss Boy');
    G.hud.setObjective('Grab the crate — press E. Watch out for Voss\'s boys.', 'JOB 2 — THE PICKUP');
  } else if (shot === 'street') {
    // on-foot street scene: sidewalk, traffic passing, pedestrians nearby
    p.pos.set(-100, 0, 46); p.mesh.position.copy(p.pos);
    p.yaw = Math.PI / 2; p.camYaw = Math.PI / 2; p.camPitch = 0.3; p.camDist = 8;
    // pull a few pedestrians and a traffic car close to the camera
    if (G.peds[0]) { G.peds[0].mesh.position.set(-96, 0, 42); G.peds[0].target.set(-60, 0, 42); }
    if (G.peds[1]) { G.peds[1].mesh.position.set(-104, 0, 50); G.peds[1].target.set(-140, 0, 50); }
    if (G.peds[2]) { G.peds[2].mesh.position.set(-92, 0, 56); G.peds[2].target.set(-60, 0, 56); }
    if (G.traffic[0]) { G.traffic[0].mesh.position.set(-84, 0, 52); G.traffic[0].speed = 12; }
    G.hud.setObjective('Go see Lena at the gold marker to start the next job.', 'FREE ROAM — NEXT JOB AVAILABLE');
  }
  G.shotStaged = true;
}

// ---------- frame loop ----------
const clock = new THREE.Clock();
let minimapTick = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.state === 'playing') {
    G.time += dt;
    updatePlayer(G, dt);
    if (G.player.inCar) Vehicles.updateDriving(G, dt);
    // staged screenshots: keep the hero car cruising at a steady speed
    // until the frame is captured (otherwise it coasts to a stop)
    if (G.shot && !window.__shotReady && G.player.inCar && G.player.car) {
      G.player.car.speed = G.shot === 'chase' ? 34 : 26;
    }
    Traffic.updateTraffic(G, dt);
    Traffic.updatePedestrians(G, dt);
    Police.updatePolice(G, dt);
    Missions.updateMissions(G, dt);
    Combat.updateCombat(G, dt);
    updateParticles(dt);
    // ocean sway
    if (G.ocean) G.ocean.position.y = -0.4 + Math.sin(G.time * 0.7) * 0.15;
    // engine sound follows the car
    if (G.audio.ctx) {
      const speed01 = G.player.inCar && G.player.car ? Math.abs(G.player.car.speed) / 42 : 0;
      AudioSys.setEngineSound(G, speed01, G.player.inCar);
    }
    Hud.updateHud(G);
    if ((minimapTick++ & 1) === 0) Hud.drawMinimap(G);
    // camera shake decay
    if (G.cameraShake > 0) {
      G.camera.position.x += (Math.random() - 0.5) * G.cameraShake;
      G.camera.position.y += (Math.random() - 0.5) * G.cameraShake;
      G.cameraShake = Math.max(0, G.cameraShake - dt * 0.6);
    }
  }
  updateCamera(G, dt);
  G.renderer.render(G.scene, G.camera);

  // screenshot readiness: a few settled frames after staging
  if (G.shot && G.shotStaged && !window.__shotReady) {
    G.shotFrames += 1;
    if (G.shotFrames > 45) window.__shotReady = true;
  }
}

boot();
