// city.js — procedural Solmar Bay: roads, blocks, buildings, beach, ocean, props.
// Everything here is generated from a fixed seed so the city is identical every run.
import * as THREE from 'three';

export const BLOCK_PITCH = 52;      // distance between road centre-lines
export const ROAD_W = 14;           // road width
export const GRID_N = 9;            // 9 x 9 roads
export const CITY_HALF = 260;       // ground plane half-size
export const BEACH_X = -238;        // west of this is sand, then ocean

// Deterministic RNG (mulberry32) — the city must look the same in every screenshot.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roadCoord(i) { return -208 + i * BLOCK_PITCH; } // road centre lines: -208 .. 208

// A canvas texture for the whole ground: asphalt roads with lane dashes, sidewalks,
// crosswalks, block tint variation, and the beach strip on the west edge.
function makeGroundTexture(rng) {
  const S = 2048;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const worldToPx = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * S;
  const pxPerUnit = S / (CITY_HALF * 2);

  // base: pale sidewalk concrete
  g.fillStyle = '#a8a49a'; g.fillRect(0, 0, S, S);
  // subtle block tint variation
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const x0 = worldToPx(roadCoord(i) + ROAD_W / 2);
      const z0 = worldToPx(roadCoord(j) + ROAD_W / 2);
      const w = (BLOCK_PITCH - ROAD_W) * pxPerUnit;
      const shade = 150 + Math.floor(rng() * 26);
      g.fillStyle = `rgb(${shade},${shade - 4},${shade - 12})`;
      g.fillRect(x0, z0, w, w);
      // plaza grass in a few blocks
      if (rng() < 0.14) {
        g.fillStyle = '#6f9e5f';
        g.fillRect(x0 + w * 0.12, z0 + w * 0.12, w * 0.76, w * 0.76);
      }
    }
  }
  // beach sand strip on the west edge
  g.fillStyle = '#e0c98f';
  g.fillRect(0, 0, worldToPx(BEACH_X + 6), S);
  g.fillStyle = '#d9c184';
  for (let k = 0; k < 260; k++) {
    g.fillRect(rng() * worldToPx(BEACH_X + 6), rng() * S, 3, 3);
  }
  // roads: dark asphalt strips
  g.fillStyle = '#2f2f36';
  for (let i = 0; i < GRID_N; i++) {
    const c0 = worldToPx(roadCoord(i) - ROAD_W / 2);
    const w = ROAD_W * pxPerUnit;
    g.fillRect(c0, 0, w, S);          // north-south road
    g.fillRect(0, c0, S, w);          // east-west road
  }
  // road edge lines + centre dashes
  g.strokeStyle = 'rgba(230,230,220,0.55)'; g.lineWidth = 2;
  g.setLineDash([14, 18]);
  for (let i = 0; i < GRID_N; i++) {
    const c0 = worldToPx(roadCoord(i));
    g.beginPath(); g.moveTo(c0, 0); g.lineTo(c0, S); g.stroke();
    g.beginPath(); g.moveTo(0, c0); g.lineTo(S, c0); g.stroke();
  }
  g.setLineDash([]);
  // crosswalks at every intersection
  g.fillStyle = 'rgba(240,240,235,0.75)';
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const cx = worldToPx(roadCoord(i)), cz = worldToPx(roadCoord(j));
      for (let s = -2; s <= 2; s++) {
        g.fillRect(cx + s * 7 - 2, cz - ROAD_W / 2 + 3, 4, ROAD_W - 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Window texture shared by every building: a lit-window grid on a facade.
function makeFacadeTexture(baseColor, rng) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor; g.fillRect(0, 0, 128, 256);
  // grime gradient at the bottom
  const grad = g.createLinearGradient(0, 180, 0, 256);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : 'rgba(20,24,34,0.85)';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBillboardTexture(lines, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 34px Arial';
  lines.forEach((line, i) => g.fillText(line, 128, 52 + i * 38));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(G) {
  const rng = mulberry32(1337);
  const scene = G.scene;
  const city = {
    buildings: [],           // {x0,z0,x1,z1,h} AABBs for collision
    roads: [],               // {axis:'x'|'z', at} centre-lines for traffic AI
    parks: [],
    bounds: CITY_HALF - 8,
  };
  for (let i = 0; i < GRID_N; i++) {
    city.roads.push({ axis: 'x', at: roadCoord(i) });
    city.roads.push({ axis: 'z', at: roadCoord(i) });
  }
  G.city = city;

  // ---- lights: warm late-afternoon sun + sky bounce ----
  const sun = new THREE.DirectionalLight(0xffe0b3, 2.4);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x8a7a5a, 0.9));
  G.sun = sun;

  // ---- ground + ocean ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng) })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(320, CITY_HALF * 2 + 200),
    new THREE.MeshLambertMaterial({ color: 0x1f6f9e, transparent: true, opacity: 0.94 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(BEACH_X - 150, -0.4, 0);
  scene.add(ocean);
  G.ocean = ocean;

  // ---- buildings ----
  const facadePalette = ['#b98d5f', '#8a7f8f', '#7d8ea3', '#a3706a', '#6f7f6a', '#9c8f7a', '#5f7486'];
  const facadeTexes = facadePalette.map((col) => makeFacadeTexture(col, rng));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let buildingCount = 0;

  for (let i = 0; i < GRID_N - 1; i++) {
    for (let j = 0; j < GRID_N - 1; j++) {
      const bx = roadCoord(i) + ROAD_W / 2;   // block min corner
      const bz = roadCoord(j) + ROAD_W / 2;
      const bw = BLOCK_PITCH - ROAD_W;        // 38
      if (bx + bw > 210) continue;            // keep the east edge clear
      const roll = rng();
      const distCenter = Math.hypot(bx + bw / 2, bz + bw / 2) / 300;
      if (roll < 0.12) { city.parks.push({ x: bx + bw / 2, z: bz + bw / 2 }); continue; }
      const lots = roll < 0.45 ? 1 : (roll < 0.8 ? 2 : 4);
      for (let l = 0; l < lots; l++) {
        const cols = lots === 1 ? 1 : 2, rows = lots <= 2 ? 1 : 2;
        const lx = bx + 3 + (l % cols) * (bw / cols);
        const lz = bz + 3 + Math.floor(l / cols) * (bw / rows);
        const lw = bw / cols - 6, ld = bw / rows - 6;
        const tall = rng() < (0.55 - distCenter * 0.4);
        const h = tall ? 22 + rng() * 46 : 7 + rng() * 12;
        const mat = new THREE.MeshLambertMaterial({ map: facadeTexes[Math.floor(rng() * facadeTexes.length)] });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(lw, h, ld);
        b.position.set(lx + lw / 2, h / 2, lz + ld / 2);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(lw + 0.6, 0.5, ld + 0.6);
        roof.position.set(lx + lw / 2, h + 0.25, lz + ld / 2);
        scene.add(roof);
        // rooftop AC box on tall towers
        if (tall && rng() < 0.6) {
          const ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x777777 }));
          ac.scale.set(3, 1.6, 3);
          ac.position.set(lx + lw / 2 + (rng() - 0.5) * lw * 0.4, h + 1.3, lz + ld / 2);
          scene.add(ac);
        }
        city.buildings.push({ x0: lx, z0: lz, x1: lx + lw, z1: lz + ld, h });
        buildingCount++;
      }
    }
  }
  G.buildingCount = buildingCount;

  // ---- palm trees along the beach and in parks ----
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondGeo = new THREE.ConeGeometry(3.2, 2.2, 7);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d });
  const palmSpots = [];
  for (let z = -240; z <= 240; z += 26) palmSpots.push([-232, z + (rng() - 0.5) * 8]);
  for (const p of city.parks) for (let k = 0; k < 4; k++)
    palmSpots.push([p.x + (rng() - 0.5) * 26, p.z + (rng() - 0.5) * 26]);
  for (const [px, pz] of palmSpots) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(px, 3.5, pz); trunk.castShadow = true;
    const top = new THREE.Mesh(frondGeo, frondMat);
    top.position.set(px, 8, pz); top.castShadow = true;
    scene.add(trunk); scene.add(top);
  }

  // ---- streetlights at intersections (emissive heads, no extra lights) ----
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c30 });
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 0.9 });
  for (let i = 0; i < GRID_N; i += 2) {
    for (let j = 0; j < GRID_N; j += 2) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(roadCoord(i) + ROAD_W / 2 + 1, 3.5, roadCoord(j) + ROAD_W / 2 + 1);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(roadCoord(i) + ROAD_W / 2 + 1, 7.1, roadCoord(j) + ROAD_W / 2 + 1);
      scene.add(pole); scene.add(head);
    }
  }

  // ---- billboards with original Solmar Bay ads ----
  const boards = [
    { pos: [-160, 26, -190], lines: ['SOLMAR', 'BAY'], bg: '#123a6e', fg: '#ffd23a' },
    { pos: [60, 30, 130], lines: ['PALMS', 'HOTEL'], bg: '#5e1f5e', fg: '#ff9de2' },
    { pos: [150, 24, -60], lines: ['NEON', 'TIDE'], bg: '#0e4d3a', fg: '#7dffd4' },
    { pos: [-40, 28, 190], lines: ['KAIRO', 'COLA'], bg: '#7a1f1f', fg: '#ffe9a8' },
  ];
  for (const b of boards) {
    const tex = makeBillboardTexture(b.lines, b.bg, b.fg);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 11),
      new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 })
    );
    board.position.set(b.pos[0], b.pos[1], b.pos[2]);
    board.rotation.y = rng() * Math.PI;
    scene.add(board);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1, b.pos[1] - 5, 1), poleMat);
    leg.position.set(b.pos[0], (b.pos[1] - 5) / 2, b.pos[2]);
    scene.add(leg);
  }

  // ---- a few crates / props on sidewalks ----
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  for (let k = 0; k < 40; k++) {
    const cx = (rng() * 2 - 1) * 200, cz = (rng() * 2 - 1) * 200;
    if (collidesBuilding(G, cx, cz, 2)) continue;
    const crate = new THREE.Mesh(boxGeo, crateMat);
    const s = 1 + rng() * 1.2;
    crate.scale.set(s, s, s);
    crate.position.set(cx, s / 2, cz);
    crate.rotation.y = rng() * Math.PI;
    crate.castShadow = true;
    scene.add(crate);
  }
}

// Push a circle (x,z,r) out of every building AABB it overlaps. Mutates pos. Returns true on hit.
export function resolveBuildingCollision(G, pos, r) {
  let hit = false;
  for (const b of G.city.buildings) {
    const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: shove out along the smallest penetration axis
        const pl = pos.x - b.x0, pr = b.x1 - pos.x, pt = pos.z - b.z0, pb = b.z1 - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = b.x0 - r; else if (m === pr) pos.x = b.x1 + r;
        else if (m === pt) pos.z = b.z0 - r; else pos.z = b.z1 + r;
      }
    }
  }
  return hit;
}

export function collidesBuilding(G, x, z, r) {
  for (const b of G.city.buildings) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
  }
  return false;
}

// Nearest road centre-line coordinate on the given axis.
export function nearestRoad(G, axis, v) {
  let best = G.city.roads[0].at, bd = Infinity;
  for (const r of G.city.roads) {
    if (r.axis !== axis) continue;
    const d = Math.abs(r.at - v);
    if (d < bd) { bd = d; best = r.at; }
  }
  return best;
}
