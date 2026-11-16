const DEFAULTS = {
  category: 'nature',
  targetMinutes: 50,
  maxVideosPerBatch: 48,
  delay: 1200,
  addNewPage: true,
  useMagicRecommendations: true,
  autoDownload: true,
  clearTimelineBetweenBatches: true,
  removeAudio: true,
  removeAnimations: true,
  playSound: true,
  skipPro: false
};

const $ = (id) => document.getElementById(id);

const statusPill = $('statusPill');
const metricDuration = $('metricDuration');
const metricPercent = $('metricPercent');
const metricBatch = $('metricBatch');
const metricClips = $('metricClips');
const progressBar = $('progressBar');
const percentText = $('percentText');
const currentStep = $('currentStep');
const logBox = $('logBox');

function log(text, type = 'info') {
  const line = document.createElement('div');
  line.className = 'log-line';
  const now = new Date().toTimeString().split(' ')[0];
  const timeSpan = `<span class="log-time">[${now}]</span>`;

  let contentSpan = `<span>${text}</span>`;
  if (type === 'success') contentSpan = `<span class="log-success">${text}</span>`;
  if (type === 'highlight') contentSpan = `<span class="log-highlight">${text}</span>`;

  line.innerHTML = `${timeSpan}${contentSpan}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

$('clearLog').addEventListener('click', () => {
  logBox.innerHTML = '';
  log('Journal réinitialisé.');
});

// Initialisation des options
chrome.storage.local.get(DEFAULTS, (s) => {
  $('category').value = s.category || 'nature';
  $('targetMinutes').value = s.targetMinutes || 50;
  $('maxVideosPerBatch').value = Math.min(48, Math.max(5, s.maxVideosPerBatch || 48));
  $('delay').value = s.delay || 1200;
  $('addNewPage').checked = s.addNewPage !== false;
  $('useMagicRecommendations').checked = s.useMagicRecommendations !== false;
  $('autoDownload').checked = s.autoDownload !== false;
  $('clearTimelineBetweenBatches').checked = s.clearTimelineBetweenBatches !== false;
  $('removeAudio').checked = s.removeAudio !== false;
  $('removeAnimations').checked = s.removeAnimations !== false;
  $('playSound').checked = s.playSound !== false;
  $('skipPro').checked = !!s.skipPro;
  updateLabels();
  queryActiveTabStatus();
});

function getFormSettings() {
  return {
    category: ($('category').value || 'nature').trim(),
    targetMinutes: Math.max(1, parseInt($('targetMinutes').value, 10) || 50),
    maxVideosPerBatch: Math.min(48, Math.max(5, parseInt($('maxVideosPerBatch').value, 10) || 48)),
    delay: Math.max(300, parseInt($('delay').value, 10) || 1200),
    addNewPage: $('addNewPage').checked,
    useMagicRecommendations: $('useMagicRecommendations').checked,
    autoDownload: $('autoDownload').checked,
    clearTimelineBetweenBatches: $('clearTimelineBetweenBatches').checked,
    removeAudio: $('removeAudio').checked,
    removeAnimations: $('removeAnimations').checked,
    playSound: $('playSound').checked,
    skipPro: $('skipPro').checked
  };
}

function updateLabels() {
  const mins = Math.max(1, parseInt($('targetMinutes').value, 10) || 50);
  $('start').textContent = `▶ Démarrer (${mins} min)`;
  metricDuration.textContent = `0:00 / ${mins}:00`;
}

function save() {
  const s = getFormSettings();
  updateLabels();
  return chrome.storage.local.set(s);
}

[
  'category',
  'targetMinutes',
  'maxVideosPerBatch',
  'delay',
  'addNewPage',
  'useMagicRecommendations',
  'autoDownload',
  'clearTimelineBetweenBatches',
  'removeAudio',
  'removeAnimations',
  'playSound',
  'skipPro'
].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', save);
});

$('targetMinutes').addEventListener('input', updateLabels);

// Synthèse sonore Web Audio
function playCompletionSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.35);
    });
  } catch (e) {
    console.warn('Erreur audio:', e);
  }
}

$('testSound').addEventListener('click', (e) => {
  e.preventDefault();
  playCompletionSound();
  log('🔊 Carillon sonore de test joué.', 'highlight');
});

async function getActiveCanvaTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(type) {
  const tab = await getActiveCanvaTab();
  if (!tab || !tab.id) {
    log('Erreur : aucun onglet actif trouvé.', 'highlight');
    return;
  }
  const settings = getFormSettings();
  try {
    await chrome.tabs.sendMessage(tab.id, { type, settings });
    if (type === 'start') {
      statusPill.textContent = 'En cours';
      statusPill.className = 'status-pill running';
      log(`🚀 Automatisation lancée (Objectif: ${settings.targetMinutes} min, max ${settings.maxVideosPerBatch} clips/série)...`, 'success');
    } else {
      statusPill.textContent = 'Arrêté';
      statusPill.className = 'status-pill';
      log('⏹ Automatisation arrêtée.', 'highlight');
    }
  } catch (err) {
    log('⚠ Impossible de communiquer avec Canva. Rechargez la page Canva (F5) et réessayez.', 'highlight');
  }
}

$('start').addEventListener('click', async () => {
  await save();
  send('start');
});

$('stop').addEventListener('click', () => {
  send('stop');
});

async function queryActiveTabStatus() {
  const tab = await getActiveCanvaTab();
  if (tab && tab.id) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
      if (res && res.running) {
        statusPill.textContent = 'En cours';
        statusPill.className = 'status-pill running';
      }
    } catch {}
  }
}

// Réception des mises à jour en direct depuis content.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status_update') {
    if (msg.durationText && msg.targetText) {
      metricDuration.textContent = `${msg.durationText} / ${msg.targetText}`;
    }
    const pct = Math.min(100, Math.max(0, Math.round(msg.percent || 0)));
    metricPercent.textContent = `${pct}%`;
    percentText.textContent = `${pct}%`;
    progressBar.style.width = `${pct}%`;

    if (metricBatch) {
      const bNum = msg.currentBatch || 1;
      const bClips = msg.batchClips !== undefined ? msg.batchClips : 0;
      const maxClips = msg.maxBatchClips || 48;
      metricBatch.textContent = `Lot #${bNum} (${bClips}/${maxClips})`;
    }

    if (msg.clips !== undefined) {
      metricClips.textContent = `${msg.clips} clips`;
    }

    if (msg.step) {
      currentStep.textContent = msg.step;
      log(msg.step);
    }

    if (msg.completed) {
      statusPill.textContent = 'Terminé ✔';
      statusPill.className = 'status-pill done';
      progressBar.style.width = '100%';
      percentText.textContent = '100%';
      metricPercent.textContent = '100%';
      log(`✔ Objectif de 50 min atteint avec succès ! (Durée finale: ${msg.durationText})`, 'success');
    } else {
      statusPill.textContent = 'En cours';
      statusPill.className = 'status-pill running';
    }
  }
  if (msg.type === 'play_sound') {
    playCompletionSound();
  }
});
