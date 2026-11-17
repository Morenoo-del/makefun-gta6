// hud.js — the DOM HUD: cash, health, wanted stars, objective, speedometer,
// canvas minimap, dialogue box, toasts and screen flashes.
export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    root: $('hud'), cash: $('cash'), healthBar: $('health-bar'), wanted: $('wanted'),
    objectiveText: $('objective-text'), missionName: $('mission-name'),
    speedo: $('speedo'), speedNum: $('speed-num'), carName: $('car-name'),
    crosshair: $('crosshair'), toastEl: $('toast'), dialogue: $('dialogue'),
    dialogueWho: $('dialogue-who'), dialogueText: $('dialogue-text'),
    interact: $('interact'), minimap: $('minimap'),
    toastTimer: null, flashTimer: null,
  };
  hud.mm = hud.minimap.getContext('2d');
  // attach the HUD API onto the state object so other modules can call it
  hud.setObjective = (text, name) => setObjective(G, text, name);
  hud.setDriving = (driving, carName) => setDriving(G, driving, carName);
  hud.setInteract = (text) => setInteract(G, text);
  hud.showDialogue = (who, text) => showDialogue(G, who, text);
  hud.hideDialogue = () => hideDialogue(G);
  hud.toast = (msg, sub) => toast(G, msg, sub);
  hud.flashWanted = () => flashWanted(G);
  hud.flashDamage = () => flashDamage(G);
  G.hud = hud;
  return hud;
}

export function setObjective(G, text, missionName) {
  G.hud.objectiveText.textContent = text;
  G.hud.missionName.textContent = missionName || '';
}

export function setDriving(G, driving, carName) {
  G.hud.speedo.classList.toggle('hidden', !driving);
  G.hud.crosshair.classList.remove('hidden'); // drive-by shooting uses the same crosshair
  G.hud.carName.textContent = carName || '';
}

export function setInteract(G, text) {
  const el = G.hud.interact;
  if (text) { el.textContent = text; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

export function showDialogue(G, who, text) {
  G.hud.dialogueWho.textContent = who;
  G.hud.dialogueText.textContent = text;
  G.hud.dialogue.classList.remove('hidden');
}

export function hideDialogue(G) {
  G.hud.dialogue.classList.add('hidden');
}

export function toast(G, msg, sub) {
  const el = G.hud.toastEl;
  el.innerHTML = sub ? `${msg}<small>${sub}</small>` : msg;
  el.classList.add('show');
  clearTimeout(G.hud.toastTimer);
  G.hud.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function flashWanted(G) {
  G.hud.wanted.style.transform = 'scale(1.25)';
  setTimeout(() => { G.hud.wanted.style.transform = 'scale(1)'; }, 180);
}

export function flashDamage(G) {
  document.body.style.boxShadow = 'inset 0 0 120px rgba(255,30,20,0.55)';
  clearTimeout(G.hud.flashTimer);
  G.hud.flashTimer = setTimeout(() => { document.body.style.boxShadow = 'none'; }, 220);
}

export function updateHud(G) {
  const p = G.player;
  const hud = G.hud;
  hud.cash.textContent = `$${Math.round(p.cash).toLocaleString('en-US')}`;
  hud.healthBar.style.width = `${Math.max(0, p.health)}%`;
  hud.healthBar.style.background = p.health > 50
    ? 'linear-gradient(90deg, #ff5a4e, #ffb03a)'
    : 'linear-gradient(90deg, #c81e1e, #ff5a4e)';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += `<span class="${i < G.wanted ? '' : 'off'}">★</span>`;
  hud.wanted.innerHTML = stars;
  if (p.inCar && p.car) {
    hud.speedNum.textContent = String(Math.round(Math.abs(p.car.speed) * 3.6));
  }
}

// ---- minimap: roads, ocean, player arrow, cars, police, mission marker ----
export function drawMinimap(G) {
  const ctx = G.hud.mm;
  const S = 380, HALF = 265;
  const toMap = (x, z) => [((x + HALF) / (HALF * 2)) * S, ((z + HALF) / (HALF * 2)) * S];
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#20242e'; ctx.fillRect(0, 0, S, S);
  // ocean on the west
  ctx.fillStyle = '#1f6f9e';
  ctx.fillRect(0, 0, (( -238 + HALF) / (HALF * 2)) * S, S);
  ctx.fillStyle = '#e0c98f';
  ctx.fillRect((( -238 + HALF) / (HALF * 2)) * S, 0, 4, S);
  // roads
  ctx.strokeStyle = '#555a66'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  for (const r of G.city.roads) {
    const [x1, z1] = toMap(r.axis === 'x' ? -HALF : r.at, r.axis === 'x' ? r.at : -HALF);
    const [x2, z2] = toMap(r.axis === 'x' ? HALF : r.at, r.axis === 'x' ? r.at : HALF);
    ctx.beginPath(); ctx.moveTo(x1, z1); ctx.lineTo(x2, z2); ctx.stroke();
  }
  // mission marker (gold pulsing dot)
  const M = G.missions;
  let mx = null, mz = null;
  if (M.current) {
    const step = M.current.steps[M.stepIndex];
    if (step && step.pos) { mx = step.pos[0]; mz = step.pos[1]; }
  } else if (currentMissionAvailable(G)) {
    mx = M.startPos.x; mz = M.startPos.z;
  }
  if (mx !== null) {
    const [px, pz] = toMap(mx, mz);
    const r = 7 + Math.sin(G.time * 5) * 2.5;
    ctx.fillStyle = '#ffc233';
    ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, pz, r + 3, 0, Math.PI * 2); ctx.stroke();
  }
  // traffic (white) + police (red) dots
  for (const car of G.traffic) {
    const [px, pz] = toMap(car.mesh.position.x, car.mesh.position.z);
    ctx.fillStyle = '#dfe6ee';
    ctx.beginPath(); ctx.arc(px, pz, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const car of G.policeCars) {
    const [px, pz] = toMap(car.mesh.position.x, car.mesh.position.z);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(px, pz, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  // player arrow (green, rotated by heading)
  const p = G.player;
  const pos = p.inCar && p.car ? p.car.mesh.position : p.pos;
  const yaw = p.inCar && p.car ? p.car.yaw : p.yaw;
  const [px, pz] = toMap(pos.x, pos.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.atan2(Math.sin(yaw), Math.cos(yaw)) * -1 + Math.PI);
  ctx.fillStyle = '#7dff9a';
  ctx.beginPath();
  ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // view cone: faint wedge showing camera direction
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.PI / 2 - p.camYaw);
  ctx.fillStyle = 'rgba(125,255,154,0.10)';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 60, -0.5, 0.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function currentMissionAvailable(G) {
  return G.missions.done < G.missions.defs.length && !G.missions.current;
}
