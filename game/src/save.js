// save.js — localStorage persistence for cash and mission progress.
const SAVE_KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number.isFinite(data.cash) ? Math.max(0, data.cash | 0) : 0,
      missionsDone: Number.isFinite(data.missionsDone) ? Math.max(0, Math.min(3, data.missionsDone | 0)) : 0,
      bestWanted: Number.isFinite(data.bestWanted) ? Math.max(0, Math.min(5, data.bestWanted | 0)) : 0,
      totalEarned: Number.isFinite(data.totalEarned) ? Math.max(0, data.totalEarned | 0) : 0,
    };
  } catch {
    return null;
  }
}

export function saveGame(G) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.round(G.player.cash),
      missionsDone: G.missions.done,
      bestWanted: G.bestWanted,
      totalEarned: Math.round(G.totalEarned),
    }));
  } catch {
    // storage unavailable (private mode etc.) — the game still plays.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
