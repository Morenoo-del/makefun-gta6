// missions.js — the Solmar Bay story: three chained jobs for Lena, with objectives,
// dialogue, markers and cash rewards.
import * as THREE from 'three';
import { spawnEnemy, clearEnemies } from './combat.js';

// Mission steps: goto (walk/drive to a point), enterCar, driveTo, collect, survive, talk.
const MISSIONS = [
  {
    id: 1, name: 'JOB 1 — FIRST FARE', reward: 250,
    intro: [
      ['Lena', 'Milo! You came back. Good — the Bay eats people who stay away too long.'],
      ['Lena', 'I need a driver I can trust. One fare: take Mrs. Alvarez to the Marina. No drama, no cops.'],
      ['Milo', 'One fare. Then I\'m gone, Lena.'],
      ['Lena', 'Sure you are. Get in your car and meet her at the corner of Coral & 3rd.'],
    ],
    steps: [
      { type: 'goto', pos: [-196, 52], radius: 4, objective: 'Meet Mrs. Alvarez at Coral & 3rd (walk to the gold marker).',
        onEnter: [['Mrs. Alvarez', 'Ah, Milo! You grew up so fast. The Marina, dear — and mind the traffic.']] },
      { type: 'enterCar', objective: 'Get in your car.',
        onEnter: [['Mrs. Alvarez', 'Such a lovely car. My grandson would be jealous.']] },
      { type: 'driveTo', pos: [-208, -190], radius: 8, objective: 'Drive Mrs. Alvarez to the Marina (follow the gold marker).',
        onEnter: [['Mrs. Alvarez', 'The sea air! You can keep the change, dear.']] },
    ],
    outro: [['Lena', 'Clean run, Milo. $250, like I said. I\'ve got something bigger — come see me at the docks.']],
  },
  {
    id: 2, name: 'JOB 2 — THE PICKUP', reward: 600,
    intro: [
      ['Lena', 'A crate came in at Pier 9. Customs never saw it. You never saw it either.'],
      ['Lena', 'Two of Voss\'s boys are guarding it. They don\'t like visitors. Take the crate to the Palms Motel.'],
      ['Milo', 'Voss. Of course it\'s Voss. Fine — but this one costs double.'],
      ['Lena', 'It costs $600. Don\'t get shot, Milo. I hate funerals.'],
    ],
    steps: [
      { type: 'goto', pos: [-205, -195], radius: 6, objective: 'Reach Pier 9 at the docks (west edge of the city).',
        onEnter: [['Rival', 'Hey! That crate ain\'t yours, pretty boy!'], ['Milo', 'It is now.']] },
      { type: 'collect', pos: [-205, -195], radius: 5, objective: 'Grab the crate — press E. Watch out for Voss\'s boys.',
        spawnEnemies: [[-205, -185, 'Voss Boy'], [-211, -198, 'Voss Boy']] },
      { type: 'driveTo', pos: [104, 156], radius: 8, objective: 'Deliver the crate to the Palms Motel. The cops are on you — lose them or outrun them!',
        onEnter: [['Lena', 'The SBP picked up your plate. Drive like you mean it!']], wanted: 2 },
    ],
    outro: [['Lena', '$600. You\'re getting good at this, Milo. One last job, and we\'re both free of Voss.']],
  },
  {
    id: 3, name: 'JOB 3 — THE GETAWAY', reward: 1500,
    intro: [
      ['Lena', 'Voss knows it was you. He sent every patrol car in the Bay after us.'],
      ['Milo', 'Then we stop running and start driving.'],
      ['Lena', 'Get to the hideout under the Coral Bridge — that\'s the old garage at 5th & Bay.'],
      ['Lena', 'Three stars, Milo. Survive the heat and bring the car home.'],
    ],
    steps: [
      { type: 'enterCar', objective: 'Get in a car — any car. Now.',
        onEnter: [['Radio', 'All units: suspect Milo Kade, orange Vento GT. Approach with caution.']] },
      { type: 'survive', seconds: 45, wanted: 3, objective: 'Survive the 3-star chase for 45 seconds — then reach the hideout.',
        onEnter: [['Lena', 'They\'re everywhere! Keep moving, don\'t let them box you in!']] },
      { type: 'driveTo', pos: [52, 208], radius: 9, objective: 'Reach the hideout garage at 5th & Bay.',
        onEnter: [['Lena', 'You did it. Voss\'s boys are gone, the cops lost you. We\'re free, Milo.']] },
    ],
    outro: [['Lena', '$1,500 — and the Bay is yours now, Milo. Drive safe. Or don\'t.'],
      ['Milo', 'Solmar Bay. Sun, salt, and stolen cars. Yeah. I\'m home.']],
  },
];

export function createMissions(G) {
  G.missions = {
    defs: MISSIONS, done: 0, current: null, stepIndex: 0,
    marker: null, markerRing: null, dialogue: null, dialogueIndex: 0,
    stepTimer: 0, enemiesSpawned: false, available: true,
  };
  // start marker: Lena waits on Coral & 3rd, outside the Marina Court apartments
  makeMarker(G, -196, 0);
  G.missions.startPos = new THREE.Vector3(-196, 0, 0);
  // attach the mission API onto the state object so other modules can call it
  G.missions.onEnemyDown = onEnemyDown;
  G.missions.update = updateMissions;
  G.missions.interact = interact;
  G.missions.advanceDialogue = advanceDialogue;
  G.missions.isDialogueOpen = isDialogueOpen;
  G.missions.startMission = startMission;
  updateObjective(G);
}

function makeMarker(G, x, z) {
  removeMarker(G);
  const geo = new THREE.CylinderGeometry(1.6, 1.6, 7, 20, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 3.5, z);
  G.scene.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.08, z);
  G.scene.add(ring);
  G.missions.marker = m; G.missions.markerRing = ring;
}

function removeMarker(G) {
  if (G.missions.marker) { G.scene.remove(G.missions.marker); G.missions.marker = null; }
  if (G.missions.markerRing) { G.scene.remove(G.missions.markerRing); G.missions.markerRing = null; }
}

export function currentMission(G) {
  return G.missions.done < MISSIONS.length ? MISSIONS[G.missions.done] : null;
}

function updateObjective(G) {
  const M = G.missions;
  const mission = currentMission(G);
  if (M.current) {
    const step = M.current.steps[M.stepIndex];
    G.hud.setObjective(step ? step.objective : '', M.current.name);
  } else if (mission) {
    G.hud.setObjective('Go see Lena at the gold marker to start the next job.', 'FREE ROAM — NEXT JOB AVAILABLE');
  } else {
    G.hud.setObjective('All jobs complete. Solmar Bay is yours — free roam!', 'STORY COMPLETE');
  }
}

export function startMission(G) {
  const M = G.missions;
  const mission = currentMission(G);
  if (!mission || M.current) return;
  M.current = mission; M.stepIndex = 0; M.enemiesSpawned = false;
  if (G.audio.ctx) G.audioApi.sfx.mission(G);
  showDialogue(G, mission.intro, () => enterStep(G));
}

function enterStep(G) {
  const M = G.missions;
  const step = M.current.steps[M.stepIndex];
  if (!step) { completeMission(G); return; }
  M.stepTimer = 0;
  if (step.onEnter) showDialogue(G, step.onEnter, null);
  if (step.spawnEnemies && !M.enemiesSpawned) {
    M.enemiesSpawned = true;
    for (const [x, z, name] of step.spawnEnemies) spawnEnemy(G, x, z, name);
  }
  if (step.wanted) G.police.setWanted(G, step.wanted, 'The heat is on');
  if (step.pos) makeMarker(G, step.pos[0], step.pos[1]);
  else removeMarker(G);
  updateObjective(G);
}

function completeStep(G) {
  const M = G.missions;
  M.stepIndex += 1;
  if (G.audio.ctx) G.audioApi.sfx.pickup(G);
  if (M.stepIndex >= M.current.steps.length) completeMission(G);
  else enterStep(G);
}

function completeMission(G) {
  const M = G.missions;
  const mission = M.current;
  G.player.cash += mission.reward;
  G.totalEarned += mission.reward;
  M.done += 1;
  M.current = null; M.stepIndex = 0;
  clearEnemies(G);
  removeMarker(G);
  if (G.audio.ctx) G.audioApi.sfx.cash(G);
  G.hud.toast(`JOB COMPLETE — $${mission.reward}`, mission.name);
  G.save.saveGame(G);
  // next job marker back at Lena's spot
  const next = currentMission(G);
  if (next) makeMarker(G, -196, 0);
  showDialogue(G, mission.outro, () => updateObjective(G));
  updateObjective(G);
}

export function onEnemyDown(G, enemy) {
  // clearing both rivals in Job 2 lets the collect step proceed cleanly
  const M = G.missions;
  if (M.current && M.current.id === 2 && G.enemies.every((e) => e.dead)) {
    G.hud.toast('The dock is clear.', 'Grab the crate.');
  }
}

// Dialogue: an array of [speaker, line]; callback runs when the last line is dismissed.
export function showDialogue(G, lines, onDone) {
  const M = G.missions;
  M.dialogue = { lines, index: 0, onDone };
  G.hud.showDialogue(lines[0][0], lines[0][1]);
}

export function advanceDialogue(G) {
  const M = G.missions;
  if (!M.dialogue) return false;
  M.dialogue.index += 1;
  if (M.dialogue.index >= M.dialogue.lines.length) {
    const cb = M.dialogue.onDone;
    M.dialogue = null;
    G.hud.hideDialogue();
    if (cb) cb();
    return true;
  }
  const [who, text] = M.dialogue.lines[M.dialogue.index];
  G.hud.showDialogue(who, text);
  return true;
}

export function isDialogueOpen(G) { return !!G.missions.dialogue; }

// E-key context action: start a job, collect a crate, talk.
export function interact(G) {
  const M = G.missions;
  const p = G.player;
  if (M.dialogue) { advanceDialogue(G); return; }
  if (M.current) {
    const step = M.current.steps[M.stepIndex];
    if (step && step.type === 'collect') {
      const d = Math.hypot(p.pos.x - step.pos[0], p.pos.z - step.pos[1]);
      if (d < step.radius + 1) { completeStep(G); return; }
    }
  } else {
    const mission = currentMission(G);
    if (mission) {
      const d = Math.hypot(p.pos.x - M.startPos.x, p.pos.z - M.startPos.z);
      if (d < 5) { startMission(G); return; }
    }
  }
  // otherwise: enter / exit the nearest car
  if (p.inCar) G.vehicles.exitCar(G);
  else {
    const car = G.vehicles.nearestCar(G, p.pos, 4.5);
    if (car) G.vehicles.enterCar(G, car);
  }
}

export function updateMissions(G, dt) {
  const M = G.missions;
  // marker pulse + spin
  if (M.marker) {
    M.marker.rotation.y += dt * 1.2;
    M.marker.material.opacity = 0.3 + Math.sin(G.time * 4) * 0.15;
    if (M.markerRing) M.markerRing.scale.setScalar(1 + Math.sin(G.time * 4) * 0.12);
  }
  // no job running: show the "talk to Lena" prompt near her marker
  // (use the car's position while driving — the on-foot position is stale in a car)
  if (!M.current) {
    const mission = currentMission(G);
    if (mission && !M.dialogue) {
      const p = G.player;
      const eff = p.inCar && p.car ? p.car.mesh.position : p.pos;
      const d = Math.hypot(eff.x - M.startPos.x, eff.z - M.startPos.z);
      G.hud.setInteract(d < 5 ? 'PRESS E — TALK TO LENA' : '');
    } else {
      G.hud.setInteract('');
    }
    return;
  }
  if (M.dialogue) return;
  const step = M.current.steps[M.stepIndex];
  if (!step) return;
  const p = G.player;
  const eff = p.inCar && p.car ? p.car.mesh.position : p.pos; // where the player actually is
  switch (step.type) {
    case 'goto': {
      const d = Math.hypot(eff.x - step.pos[0], eff.z - step.pos[1]);
      if (d < step.radius) completeStep(G);
      break;
    }
    case 'enterCar': {
      if (p.inCar) completeStep(G);
      break;
    }
    case 'driveTo': {
      if (!p.inCar || !p.car) break;
      const d = Math.hypot(p.car.mesh.position.x - step.pos[0], p.car.mesh.position.z - step.pos[1]);
      if (d < step.radius) completeStep(G);
      break;
    }
    case 'collect': {
      const d = Math.hypot(eff.x - step.pos[0], eff.z - step.pos[1]);
      G.hud.setInteract(d < step.radius + 1 ? 'PRESS E — GRAB THE CRATE' : '');
      break;
    }
    case 'survive': {
      M.stepTimer += dt;
      const left = Math.max(0, Math.ceil(step.seconds - M.stepTimer));
      G.hud.setObjective(`Survive the chase — ${left}s left, then reach the hideout.`, M.current.name);
      if (M.stepTimer >= step.seconds) completeStep(G);
      break;
    }
    default: break;
  }
}
