const DEFAULTS = {
  category: 'nature',
  targetMinutes: 50,
  delay: 1200,
  addNewPage: true,
  removeAudio: true,
  removeAnimations: true,
  playSound: true,
  skipPro: false
};

const $ = (id) => document.getElementById(id);

const statusEl = $('status');
const progressBar = $('progressBar');
const durationProgress = $('durationProgress');
const percentText = $('percentText');

// Initialisation des réglages depuis chrome.storage
chrome.storage.local.get(DEFAULTS, (s) => {
  $('category').value = s.category || 'nature';
  $('targetMinutes').value = s.targetMinutes || 50;
  $('delay').value = s.delay || 1200;
  $('addNewPage').checked = s.addNewPage !== false;
  $('removeAudio').checked = s.removeAudio !== false;
  $('removeAnimations').checked = s.removeAnimations !== false;
  $('playSound').checked = s.playSound !== false;
  $('skipPro').checked = !!s.skipPro;
  updateTargetLabel();
});

function getFormSettings() {
  return {
    category: ($('category').value || 'nature').trim(),
    targetMinutes: Math.max(1, parseInt($('targetMinutes').value, 10) || 50),
    delay: Math.max(300, parseInt($('delay').value, 10) || 1200),
    addNewPage: $('addNewPage').checked,
    removeAudio: $('removeAudio').checked,
    removeAnimations: $('removeAnimations').checked,
    playSound: $('playSound').checked,
    skipPro: $('skipPro').checked
  };
}

function updateTargetLabel() {
  const mins = Math.max(1, parseInt($('targetMinutes').value, 10) || 50);
  $('start').textContent = `▶ Démarrer (${mins} min)`;
  durationProgress.textContent = `Durée : 0:00 / ${mins}:00`;
}

function save() {
  const s = getFormSettings();
  updateTargetLabel();
  return chrome.storage.local.set(s);
}

['category', 'targetMinutes', 'delay', 'addNewPage', 'removeAudio', 'removeAnimations', 'playSound', 'skipPro']
  .forEach((id) => $(id).addEventListener('change', save));

$('targetMinutes').addEventListener('input', updateTargetLabel);

// Synthèse audio du carillon de victoire (Web Audio API)
function playCompletionSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    // Carillon mélodieux : C5, E5, G5, C6 (arpège ascendant triomphant)
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
    console.warn('Impossible de jouer le son Web Audio:', e);
  }
}

$('testSound').addEventListener('click', (e) => {
  e.preventDefault();
  playCompletionSound();
  statusEl.textContent = '🔊 Carillon de notification joué !';
});

async function send(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    statusEl.textContent = 'Aucun onglet actif détecté.';
    return;
  }
  const settings = getFormSettings();
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type, settings });
    if (type === 'start') {
      statusEl.textContent = '🚀 Démarré ! Suivez le badge violet sur Canva.';
    } else {
      statusEl.textContent = 'Arrêté.';
    }
  } catch (err) {
    statusEl.textContent = 'Erreur : Rechargez la page Canva (F5) et réessayez.';
  }
}

$('start').addEventListener('click', async () => {
  await save();
  send('start');
});

$('stop').addEventListener('click', () => {
  send('stop');
});

// Écoute des mises à jour en direct depuis le content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status_update') {
    if (msg.durationText && msg.targetText) {
      durationProgress.textContent = `Durée : ${msg.durationText} / ${msg.targetText}`;
    }
    const pct = Math.min(100, Math.max(0, msg.percent || 0));
    percentText.textContent = `${pct}%`;
    progressBar.style.width = `${pct}%`;
    if (msg.step) {
      statusEl.textContent = msg.step;
    }
    if (msg.completed) {
      statusEl.textContent = '✔ Terminé avec succès !';
      progressBar.style.width = '100%';
      percentText.textContent = '100%';
    }
  }
  if (msg.type === 'play_sound') {
    playCompletionSound();
  }
});
