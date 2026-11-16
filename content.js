(() => {
  if (window.__canvaVideoAutomator) return;
  window.__canvaVideoAutomator = true;

  const DEFAULTS = {
    category: 'nature',
    targetMinutes: 50,
    maxVideosPerBatch: 48, // Limite stricte Canva de 50 vidéos : 48 offre une marge sûre
    delay: 1200,
    addNewPage: true,
    useMagicRecommendations: true, // Recherche -> Vidéo -> Section "Magic recommendations" (See all)
    autoDownload: true,
    clearTimelineBetweenBatches: true,
    removeAudio: true,
    removeAnimations: true,
    playSound: true,
    skipPro: false
  };

  let running = false;
  let badgeEl = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getSettings = () => new Promise((res) => chrome.storage.local.get(DEFAULTS, res));

  // --- SON DE FIN DE TRAVAUX (Web Audio API) ---
  function playVictorySound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      // Carillon mélodieux triomphal : Do5, Mi5, Sol5, Do6
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
    } catch (err) {
      console.warn('[Canva Automator] Erreur lecture audio Web Audio:', err);
    }
  }

  // --- BADGE FLOTTANT SUR LA PAGE CANVA ---
  function createBadge() {
    if (badgeEl) return badgeEl;
    badgeEl = document.createElement('div');
    badgeEl.id = 'canva-automator-badge';
    badgeEl.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 2147483647;
      background: #18191b;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      padding: 12px 16px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1);
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 290px;
      max-width: 380px;
      pointer-events: auto;
    `;
    badgeEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; color:#b78bf7; font-size:12px; letter-spacing:0.5px;">🎬 CANVA AUTOMATOR</span>
        <button id="canva-automator-stop-btn" style="background:#e74c3c; color:#fff; border:none; border-radius:4px; padding:3px 8px; font-size:11px; font-weight:600; cursor:pointer;">■ Arrêter</button>
      </div>
      <div id="canva-automator-batch-text" style="font-size:11px; color:#00c4cc; font-weight:700;">Lot #1 • 0 / 48 vidéos</div>
      <div id="canva-automator-progress-text" style="font-weight:600; font-size:14px; margin-top:2px;">Durée totale : 0:00 / 50:00 (0%)</div>
      <div style="background:#333; height:6px; border-radius:3px; overflow:hidden;">
        <div id="canva-automator-progress-bar" style="background:linear-gradient(90deg, #7d2ae8, #00c4cc); width:0%; height:100%; transition:width 0.3s;"></div>
      </div>
      <div id="canva-automator-step-text" style="font-size:11px; color:#aaa;">Initialisation...</div>
    `;
    document.body.appendChild(badgeEl);

    badgeEl.querySelector('#canva-automator-stop-btn').addEventListener('click', () => {
      stop();
    });

    return badgeEl;
  }

  function updateBadge({ durationText, targetText, percent, step, isDone, clips, currentBatch, batchClips, maxBatchClips, currentQuery }) {
    createBadge();
    badgeEl.style.display = 'flex';
    const pct = Math.min(100, Math.max(0, Math.round(percent || 0)));

    const progText = badgeEl.querySelector('#canva-automator-progress-text');
    const progBar = badgeEl.querySelector('#canva-automator-progress-bar');
    const stepText = badgeEl.querySelector('#canva-automator-step-text');
    const batchText = badgeEl.querySelector('#canva-automator-batch-text');

    if (batchText) {
      const bNum = currentBatch || 1;
      const bClips = batchClips !== undefined ? batchClips : 0;
      const maxClips = maxBatchClips || 48;
      batchText.textContent = `Lot #${bNum} • ${bClips} / ${maxClips} vidéos (Total : ${clips || 0} clips)`;
    }

    if (progText) progText.textContent = `Durée totale : ${durationText} / ${targetText} (${pct}%)`;
    if (progBar) progBar.style.width = `${pct}%`;
    if (stepText) stepText.textContent = step || '';

    if (isDone) {
      badgeEl.style.background = '#0d3d2e';
      badgeEl.style.boxShadow = '0 8px 24px rgba(0, 196, 140, 0.3), 0 0 0 1px #00c48c';
      if (progText) progText.textContent = `✔ Terminé avec succès (${durationText})`;
      if (progBar) {
        progBar.style.width = '100%';
        progBar.style.background = '#00c48c';
      }
    } else {
      badgeEl.style.background = '#18191b';
      badgeEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)';
    }

    try {
      chrome.runtime.sendMessage({
        type: 'status_update',
        durationText,
        targetText,
        percent: pct,
        step,
        completed: !!isDone,
        clips: clips !== undefined ? clips : 0,
        currentBatch: currentBatch || 1,
        batchClips: batchClips !== undefined ? batchClips : 0,
        maxBatchClips: maxBatchClips || 48,
        currentQuery: currentQuery || ''
      });
    } catch {}
  }

  function removeBadge(delay = 10000) {
    if (delay === 0 && badgeEl) {
      badgeEl.remove();
      badgeEl = null;
      return;
    }
    setTimeout(() => {
      if (badgeEl && !running) {
        badgeEl.style.opacity = '0';
        badgeEl.style.transition = 'opacity 0.6s';
        setTimeout(() => {
          if (badgeEl && !running) {
            badgeEl.remove();
            badgeEl = null;
          }
        }, 600);
      }
    }, delay);
  }

  // --- ÉVÉNEMENTS CLIC & CLAVIER ---
  function fireClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    } catch {}
    const opts = { bubbles: true, cancelable: true, view: window };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
      el.dispatchEvent(new MouseEvent(t, opts));
    });
    return true;
  }

  function dispatchKey(key, code, keyCode) {
    const opts = {
      key,
      code,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    };
    if (document.activeElement) {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', opts));
      document.activeElement.dispatchEvent(new KeyboardEvent('keyup', opts));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  // --- PARSERS DE TEMPS ---
  function parseTimeToSeconds(str) {
    if (!str) return 0;
    str = str.trim().replace(',', '.');

    if (str.includes(':')) {
      const parts = str.split(':').map((p) => parseFloat(p) || 0);
      if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }

    const secMatch = str.match(/([\d.]+)\s*s(?:ec)?/i);
    if (secMatch) return parseFloat(secMatch[1]) || 0;

    const minMatch = str.match(/([\d.]+)\s*(?:min|m)/i);
    if (minMatch) return (parseFloat(minMatch[1]) || 0) * 60;

    return 0;
  }

  function formatSeconds(secs) {
    secs = Math.max(0, Math.floor(secs));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const sStr = s < 10 ? '0' + s : s;
    if (h > 0) {
      const mStr = m < 10 ? '0' + m : m;
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  }

  // --- EXTRACTION DE LA DURÉE DU LOT ACTUEL SUR LA TIMELINE CANVA ---
  function getTimelineDurationInSeconds() {
    // Méthode 1 : Près du bouton lecture (ex: "8:51 ▶ 8:51" ou "0:00 ▶ 20:00")
    const playButtons = [...document.querySelectorAll('button')].filter((b) => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const txt = (b.textContent || '').trim();
      return (
        aria.includes('lecture') ||
        aria.includes('play') ||
        aria.includes('pause') ||
        aria.includes('rejouer') ||
        txt === '▶' ||
        txt === '⏸' ||
        b.querySelector('svg polygon, svg path[d*="M8"]')
      );
    });

    for (const btn of playButtons) {
      let c = btn.parentElement;
      for (let i = 0; i < 4 && c; i++, c = c.parentElement) {
        const text = c.innerText || '';
        const matches = text.match(/\b(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d+)?\b/g);
        if (matches && matches.length >= 1) {
          let maxSec = 0;
          for (const m of matches) {
            const s = parseTimeToSeconds(m);
            if (s > maxSec) maxSec = s;
          }
          if (maxSec > 0) return { seconds: maxSec, text: formatSeconds(maxSec) };
        }
      }
    }

    // Méthode 2 : Séparateur "/" (ex: "0:00 / 20:00")
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    let foundSecs = 0;
    while ((node = walker.nextNode())) {
      const txt = node.nodeValue;
      if (txt && /\d+:\d+/.test(txt) && /[/／]/.test(txt)) {
        const parts = txt.split(/[/／]/);
        if (parts.length === 2) {
          const secs = parseTimeToSeconds(parts[1].trim());
          if (secs > foundSecs) foundSecs = secs;
        }
      }
    }
    if (foundSecs > 0) return { seconds: foundSecs, text: formatSeconds(foundSecs) };

    // Méthode 3 : Somme des durées de chaque page/clip sur la timeline
    const pages = findTimelinePages();
    if (pages.length > 0) {
      let sum = 0;
      for (const p of pages) {
        const aria = p.getAttribute('aria-label') || '';
        const ariaMatch = aria.match(/([\d.,]+)\s*(?:sec|s)/i);
        if (ariaMatch) {
          sum += parseFloat(ariaMatch[1].replace(',', '.')) || 0;
          continue;
        }
        const text = p.innerText || '';
        const textMatch = text.match(/([\d.,]+)\s*s/);
        if (textMatch) {
          sum += parseFloat(textMatch[1].replace(',', '.')) || 0;
        }
      }
      if (sum > 0) {
        return { seconds: sum, text: formatSeconds(sum) };
      }
    }

    // Méthode 4 : Recherche de timestamps dans le bas de l'écran (règle timeline)
    const bottomTimestamps = [...document.querySelectorAll('*')].filter((el) => {
      if (!el.children.length && el.innerText && /^\s*\d{1,2}:\d{2}\s*$/.test(el.innerText)) {
        const rect = el.getBoundingClientRect();
        return rect.top > window.innerHeight * 0.55;
      }
      return false;
    });

    if (bottomTimestamps.length > 0) {
      let maxSec = 0;
      for (const el of bottomTimestamps) {
        const s = parseTimeToSeconds(el.innerText);
        if (s > maxSec) maxSec = s;
      }
      if (maxSec > 0) {
        return { seconds: maxSec, text: formatSeconds(maxSec) };
      }
    }

    return { seconds: 0, text: '0:00' };
  }

  // --- RECHERCHE DES ÉLÉMENTS DE LA TIMELINE ---
  function findTimelineContainer() {
    return (
      document.querySelector('[role="region"][aria-label*="timeline" i]') ||
      document.querySelector('[role="region"][aria-label*="chronologie" i]') ||
      document.querySelector('[aria-label*="timeline" i]') ||
      document.querySelector('[aria-label*="chronologie" i]') ||
      document.querySelector('div[class*="timeline" i]')
    );
  }

  function findTimelinePages() {
    const timeline = findTimelineContainer() || document.body;
    const candidates = [
      ...timeline.querySelectorAll('[role="button"][aria-label*="page" i]'),
      ...timeline.querySelectorAll('[data-testid*="thumbnail" i]'),
      ...timeline.querySelectorAll('[data-page-id]'),
      ...timeline.querySelectorAll('div[tabindex="0"][aria-label*="page" i]'),
      ...timeline.querySelectorAll('[data-testid*="page" i]')
    ];

    const inBottom = candidates.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top > window.innerHeight * 0.45 && r.width >= 15 && r.height >= 15;
    });

    return [...new Set(inBottom.length > 0 ? inBottom : candidates)];
  }

  function findAddPageButton() {
    const allButtons = [...document.querySelectorAll('button, div[role="button"]')];

    // 1. Recherche par libellé ARIA explicite
    const byAria = allButtons.find((el) => {
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return (
        aria.includes('ajouter une page') ||
        aria.includes('add page') ||
        (aria.includes('page') && (aria.includes('ajouter') || aria.includes('add')))
      );
    });
    if (byAria) return byAria;

    // 2. Bouton "+" situé dans la région inférieure (timeline)
    const timeline = findTimelineContainer() || document.body;
    const candidates = [...timeline.querySelectorAll('button, div[role="button"]')];
    const plusBtn = candidates.find((b) => {
      const txt = (b.textContent || '').trim();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const rect = b.getBoundingClientRect();
      const inBottom = rect.top > window.innerHeight * 0.5;
      return (
        inBottom && (
          txt === '+' ||
          aria.includes('ajouter') ||
          aria.includes('add') ||
          b.querySelector('svg path[d*="M11"], svg path[d*="M12"]')
        )
      );
    });
    if (plusBtn) return plusBtn;

    return null;
  }

  // --- DÉTECTION DE LA BANNIÈRE DE LIMITE DE 50 VIDÉOS DE CANVA ---
  function isCanva50LimitExceeded() {
    const text = (document.body.innerText || '').toLowerCase();
    return (
      text.includes('limit of 50 videos') ||
      text.includes('limite de 50 vidéos') ||
      text.includes('exceeds the limit of 50') ||
      text.includes('dépasse la limite de 50')
    );
  }

  // --- ACTIVATION DU FILTRE « VIDÉOS » DANS LES RÉSULTATS ---
  async function ensureVideosFilterActive() {
    const panel =
      document.querySelector('aside[data-surface="object-panel"]') ||
      document.querySelector('[role="tabpanel"]') ||
      document.querySelector('aside') ||
      document.body;

    for (let attempt = 0; attempt < 8; attempt++) {
      const candidates = [...panel.querySelectorAll('button, [role="tab"], div[role="tab"], div[role="button"], a, span')];

      const videoTab = candidates.find((el) => {
        if (el.closest('[data-result-key]') || el.closest('[role="group"]')) return false;

        const txt = (el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();

        return (
          txt === 'videos' ||
          txt === 'vidéos' ||
          txt === 'video' ||
          txt === 'vidéo' ||
          aria === 'videos' ||
          aria === 'vidéos' ||
          aria === 'video' ||
          aria === 'vidéo'
        );
      });

      if (videoTab) {
        const clickable = videoTab.closest('button, [role="tab"], div[role="button"]') || videoTab;
        const isSelected =
          clickable.getAttribute('aria-selected') === 'true' ||
          clickable.getAttribute('data-selected') === 'true' ||
          clickable.classList.contains('active') ||
          clickable.classList.contains('selected');

        if (!isSelected) {
          console.log('[Canva Automator] Activation du filtre « Vidéos »...');
          fireClick(clickable);
          await sleep(1200);
        }
        return true;
      }

      await sleep(300);
    }

    return false;
  }

  // --- NAVIGATION / RECHERCHE DANS LE VOLET LATÉRAL ---
  function findElementsSearchInput() {
    return (
      document.querySelector('input[placeholder*="elements" i]') ||
      document.querySelector('input[aria-label*="elements" i]') ||
      document.querySelector('input[placeholder*="éléments" i]') ||
      document.querySelector('input[aria-label*="éléments" i]') ||
      document.querySelector('aside input[type="search"]') ||
      document.querySelector('aside input[type="text"]') ||
      document.querySelector('input[type="search"]')
    );
  }

  async function ensureCategorySearch(categoryName) {
    categoryName = (categoryName || 'nature').trim();

    // 1. Ouvre l'onglet "Elements" dans la barre latérale gauche
    const tabs = [...document.querySelectorAll('button[role="tab"], button, div[role="tab"], div[role="button"]')];
    const elementsTab = tabs.find((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const childAria = (el.querySelector('[aria-label]') ? el.querySelector('[aria-label]').getAttribute('aria-label') : '').toLowerCase();
      return (
        txt === 'elements' || txt === 'éléments' ||
        aria.includes('element') || aria.includes('élément') ||
        childAria.includes('element') || childAria.includes('élément')
      );
    });

    if (elementsTab && elementsTab.getAttribute('aria-selected') !== 'true') {
      fireClick(elementsTab);
      await sleep(700);
    }

    // 2. Recherche le champ de saisie dans le panneau latéral
    const searchInput = findElementsSearchInput();

    if (searchInput) {
      fireClick(searchInput);
      searchInput.focus();
      await sleep(150);

      const clearBtn = searchInput.parentElement?.querySelector('button[aria-label*="clear" i], button[aria-label*="effacer" i]');
      if (clearBtn) {
        fireClick(clearBtn);
        await sleep(200);
      }

      // Réinitialiser le tracker interne de React
      if (searchInput._valueTracker) {
        searchInput._valueTracker.setValue('');
      }

      // Setter natif du prototype HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(searchInput, categoryName);
      } else {
        searchInput.value = categoryName;
      }

      // Envoi de la séquence complète d'événements React
      searchInput.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertText',
        data: categoryName
      }));
      searchInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      // Simulation de la touche Entrée
      ['keydown', 'keypress', 'keyup'].forEach((t) => {
        searchInput.dispatchEvent(new KeyboardEvent(t, {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      });

      // Soumission du formulaire si présent
      const form = searchInput.closest('form');
      if (form) {
        try { form.requestSubmit(); } catch {}
        form.dispatchEvent(new Event('submit', { bubbles: true }));
      }

      await sleep(1500);
      await ensureVideosFilterActive();
      await sleep(1000);
    }

    return true;
  }

  // --- EXPLORATION & ACTIVATION DE LA SECTION « MAGIC RECOMMENDATIONS » ---
  function findMagicRecommendationsHeader() {
    const panel =
      document.querySelector('aside[data-surface="object-panel"]') ||
      document.querySelector('[role="tabpanel"]') ||
      document.querySelector('aside') ||
      document.body;

    const candidates = [...panel.querySelectorAll('h1, h2, h3, h4, span, div, p')].filter((el) => {
      if (el.children.length > 3) return false;
      const txt = (el.textContent || '').trim().toLowerCase();
      return (
        txt.includes('magic recommendation') ||
        txt.includes('recommandations magiques') ||
        txt.includes('magic recommendations') ||
        txt.includes('recommandation magique') ||
        txt.includes('more like this') ||
        txt.includes('contenus similaires')
      );
    });

    return candidates[0] || null;
  }

  function findSeeAllButton(headerEl) {
    const panel =
      document.querySelector('aside[data-surface="object-panel"]') ||
      document.querySelector('[role="tabpanel"]') ||
      document.querySelector('aside') ||
      document.body;

    if (headerEl) {
      let container = headerEl.parentElement;
      for (let depth = 0; depth < 4 && container; depth++, container = container.parentElement) {
        const btns = [...container.querySelectorAll('button, a, div[role="button"], span')];
        const match = btns.find((el) => {
          const txt = (el.textContent || '').trim().toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          return (
            txt === 'see all' ||
            txt === 'afficher tout' ||
            txt === 'voir tout' ||
            aria.includes('see all') ||
            aria.includes('afficher tout') ||
            aria.includes('voir tout')
          );
        });
        if (match) return match.closest('button, a, div[role="button"]') || match;
      }
    }

    const allButtons = [...panel.querySelectorAll('button, a, div[role="button"]')];
    return allButtons.find((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return (
        txt === 'see all' ||
        txt === 'afficher tout' ||
        txt === 'voir tout' ||
        aria.includes('see all') ||
        aria.includes('afficher tout')
      );
    }) || null;
  }

  async function activateMagicRecommendationsFlow(s, batchNumber = 1) {
    console.log('[Canva Automator] Activation de la section « Magic recommendations »...');

    // 1. Recherche initiale "nature" et filtre "Vidéos"
    await ensureCategorySearch(s.category || 'nature');
    await sleep(1500);

    // 2. Vérifier si "Magic recommendations" et son bouton "See all" sont déjà visibles directement
    let header = findMagicRecommendationsHeader();
    let seeAll = findSeeAllButton(header);

    if (seeAll) {
      console.log('[Canva Automator] Bouton « See all » trouvé directement sur Magic recommendations ! Clic...');
      fireClick(seeAll);
      await sleep(1800);
      return { clickedFirstVideo: false };
    }

    // 3. Si "Magic recommendations" n'est pas encore affiché :
    // Sélectionner / insérer une première vidéo nature pour déclencher les recommandations magiques IA de Canva
    console.log('[Canva Automator] Sélection d\'une vidéo nature pour faire apparaître « Magic recommendations »...');
    const items = findVideoItems(s.skipPro);
    if (items.length > 0) {
      const first = items[0];
      const cardEl = first.closest('[data-result-key]') || first.closest('[role="group"]') || first;
      const clipDuration = getItemDurationSeconds(cardEl);

      fireClick(first);
      await sleep(1800);

      // Re-vérifier si "Magic recommendations" est apparu suite à cette sélection
      for (let attempt = 0; attempt < 6; attempt++) {
        header = findMagicRecommendationsHeader();
        seeAll = findSeeAllButton(header);
        if (seeAll) {
          console.log('[Canva Automator] « Magic recommendations » est apparu ! Clic sur « See all »...');
          fireClick(seeAll);
          await sleep(1800);
          return { clickedFirstVideo: true, clipDuration, item: first };
        }
        await sleep(500);
      }

      return { clickedFirstVideo: true, clipDuration, item: first };
    }

    return { clickedFirstVideo: false };
  }

  // --- FILTRE STRICT : UNIQUEMENT LES VRAIES VIDÉOS NATURE (AVEC BADGE DE DURÉE) ---
  function isStockVideoItem(card) {
    if (!card) return false;

    // 1. Recherche du badge de durée visible (ex: "16.0s", "10.5s", "56.0s", "1:57", "1:08", "45.0s", "21.1s")
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const val = (node.nodeValue || '').trim();
      if (/^\d+(?:\.\d+)?\s*s$/i.test(val) || /^\d{1,2}:\d{2}$/.test(val)) {
        return true;
      }
    }

    // 2. Présence du bouton d'aperçu spécifique aux vidéos Canva ("play preview")
    const playPreview = card.querySelector('button[aria-label*="play preview" i], button[aria-label*="aperçu" i]');
    if (playPreview) return true;

    // 3. Libellé aria explicite indiquant la durée
    const aria = (card.getAttribute('aria-label') || '').toLowerCase();
    if (/\b\d+(?:\.\d+)?\s*(?:sec|secondes?|s\b)/i.test(aria) && (aria.includes('vidéo') || aria.includes('video') || aria.includes('clip'))) {
      return true;
    }

    return false;
  }

  // --- DÉTECTION DE LA COURONNE PRO ---
  function isProItem(card) {
    if (!card) return false;
    if (card.querySelector('svg path[d*="M7.51"], svg path[d*="M11 11.75"]')) return true;
    if (card.querySelector('svg[aria-label*="pro" i], svg[aria-label*="crown" i]')) return true;
    const aria = (card.getAttribute('aria-label') || '').toLowerCase();
    return aria.includes('pro') || aria.includes('crown') || aria.includes('couronne');
  }

  // --- EXTRACTION DE LA DURÉE EN SECONDES DEPUIS LE BADGE DU CLIP ---
  function getItemDurationSeconds(card) {
    if (!card) return 15;
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const val = (node.nodeValue || '').trim();
      const secMatch = val.match(/^(\d+(?:\.\d+)?)\s*s$/i);
      if (secMatch) return parseFloat(secMatch[1]) || 0;
      const minSecMatch = val.match(/^(\d{1,2}):(\d{2})$/);
      if (minSecMatch) return parseInt(minSecMatch[1], 10) * 60 + parseInt(minSecMatch[2], 10);
    }
    return 15;
  }

  // --- TROUVER UNIQUEMENT LES VIGNETTES DE VIDÉOS NATURE VALIDES ---
  function findVideoItems(skipPro = false) {
    const panel =
      document.querySelector('aside[data-surface="object-panel"]') ||
      document.querySelector('[role="tabpanel"]') ||
      document.querySelector('aside') ||
      document.body;

    const candidateCards = [
      ...panel.querySelectorAll('[data-result-key]'),
      ...panel.querySelectorAll('div[role="group"]'),
      ...panel.querySelectorAll('[data-testid*="media-item"]')
    ];

    const validItems = [];
    const seenCards = new Set();

    for (const card of candidateCards) {
      if (seenCards.has(card)) continue;
      seenCards.add(card);

      if (!isStockVideoItem(card)) continue;
      if (skipPro && isProItem(card)) continue;

      const clickable =
        card.querySelector('div[role="button"][draggable="true"]') ||
        card.querySelector('div[role="button"]') ||
        card.querySelector('div[draggable="true"]') ||
        card;

      validItems.push(clickable);
    }

    return validItems;
  }

  function keyOf(el) {
    const card = el.closest('[data-result-key]');
    if (card) {
      const rKey = card.getAttribute('data-result-key');
      if (rKey) return rKey;
    }

    const group = el.closest('[role="group"]');
    const aria = (group ? group.getAttribute('aria-label') : '') || el.getAttribute('aria-label') || '';
    const img = (group || el).querySelector('img');
    const src = img ? img.src : '';
    return aria + '|' + src;
  }

  // --- DÉFILEMENT POUR CHARGER LES PAGES SUIVANTES ---
  async function triggerInfiniteScroll() {
    const sidePanels = [
      document.querySelector('aside[data-surface="object-panel"]'),
      document.querySelector('[role="tabpanel"]'),
      document.querySelector('aside'),
      document.querySelector('[data-testid*="side-panel"]')
    ].filter(Boolean);

    for (const panel of sidePanels) {
      const scrollables = [panel, ...panel.querySelectorAll('*')];
      for (const el of scrollables) {
        if (el.scrollHeight > el.clientHeight + 15) {
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
          el.dispatchEvent(new WheelEvent('wheel', { deltaY: 2500, bubbles: true, cancelable: true, view: window }));
        }
      }
      panel.dispatchEvent(new WheelEvent('wheel', { deltaY: 2500, bubbles: true, cancelable: true, view: window }));
    }

    const cards = [
      ...document.querySelectorAll('aside [data-result-key]'),
      ...document.querySelectorAll('aside div[role="group"]')
    ];
    if (cards.length > 0) {
      const last = cards[cards.length - 1];
      try {
        last.scrollIntoView({ block: 'end', behavior: 'instant' });
      } catch {}
    }
  }

  // --- SUPPRESSION DE TOUTES LES PISTES AUDIO ---
  async function removeAllAudioTracks(batchNum = 1) {
    console.log(`[Canva Automator] Nettoyage des pistes audio du lot #${batchNum}...`);
    const audioSelectors = [
      '[aria-label*="audio" i]',
      '[aria-label*="musique" i]',
      '[aria-label*="music" i]',
      '[aria-label*="piste sonore" i]',
      '[aria-label*="piste audio" i]',
      '[data-testid*="audio" i]'
    ].join(', ');

    let attempts = 0;
    while (attempts < 8) {
      const timeline = findTimelineContainer() || document.body;
      const audioTracks = [...timeline.querySelectorAll(audioSelectors)].filter((el) => {
        const role = el.getAttribute('role') || '';
        const tag = el.tagName.toLowerCase();
        return tag !== 'button' || role === 'button' || role === 'region' || role === 'group';
      });

      if (!audioTracks.length) break;

      for (const track of audioTracks) {
        fireClick(track);
        await sleep(250);
        dispatchKey('Delete', 'Delete', 46);
        dispatchKey('Backspace', 'Backspace', 8);
        await sleep(250);

        const deleteBtn = document.querySelector('button[aria-label*="supprimer" i], button[aria-label*="delete" i], button[aria-label*="corbeille" i]');
        if (deleteBtn) {
          fireClick(deleteBtn);
          await sleep(250);
        }
      }
      attempts++;
      await sleep(350);
    }
  }

  // --- SUPPRESSION DE TOUTES LES ANIMATIONS ---
  async function removeAllAnimations(batchNum = 1) {
    console.log(`[Canva Automator] Nettoyage des animations du lot #${batchNum}...`);
    const pages = findTimelinePages();
    if (pages.length > 0) {
      fireClick(pages[0]);
      await sleep(300);
    }

    const toolbarButtons = [...document.querySelectorAll('button, div[role="button"]')];
    const animateBtn = toolbarButtons.find((b) => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const txt = (b.textContent || '').trim().toLowerCase();
      return (
        aria.includes('animer') ||
        aria.includes('animate') ||
        aria.includes('animation') ||
        txt === 'animer' ||
        txt === 'animate'
      );
    });

    if (animateBtn) {
      fireClick(animateBtn);
      await sleep(700);

      const animPanelOptions = [...document.querySelectorAll('button, div[role="button"]')];
      const removeBtn = animPanelOptions.find((el) => {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const txt = (el.textContent || '').trim().toLowerCase();
        return (
          aria.includes('supprimer toutes les animations') ||
          aria.includes('supprimer l’animation') ||
          aria.includes('supprimer l\'animation') ||
          aria.includes('remove all animations') ||
          aria.includes('remove animation') ||
          txt.includes('supprimer toutes les animations') ||
          txt.includes('supprimer les animations') ||
          txt.includes('remove all animations')
        );
      });

      if (removeBtn) {
        fireClick(removeBtn);
        await sleep(400);
      } else {
        const noneBtn = animPanelOptions.find((el) => {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const txt = (el.textContent || '').trim().toLowerCase();
          return aria === 'aucun' || aria === 'aucune' || aria === 'none' || txt === 'aucun' || txt === 'aucune' || txt === 'none';
        });
        if (noneBtn) {
          fireClick(noneBtn);
          await sleep(400);
        }
      }

      const applyAllBtn = [...document.querySelectorAll('button')].find((el) => {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const txt = (el.textContent || '').trim().toLowerCase();
        return (
          aria.includes('appliquer à toutes les pages') ||
          aria.includes('apply to all pages') ||
          txt.includes('appliquer à toutes les pages') ||
          txt.includes('apply to all pages')
        );
      });
      if (applyAllBtn) {
        fireClick(applyAllBtn);
        await sleep(400);
      }

      dispatchKey('Escape', 'Escape', 27);
      await sleep(300);
    }
  }

  // --- DÉCLENCHEMENT DU TÉLÉCHARGEMENT AUTOMATIQUE DANS CANVA ---
  function findShareButton() {
    const allButtons = [...document.querySelectorAll('button, div[role="button"], a[role="button"]')];

    const byTextOrAria = allButtons.find((b) => {
      const txt = (b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return (
        txt === 'share' ||
        txt === 'partager' ||
        aria === 'all publish options' ||
        aria === 'share' ||
        aria === 'partager' ||
        aria.includes('toutes les options de publication') ||
        aria.includes('share and publish') ||
        aria.includes('partager et publier')
      );
    });
    if (byTextOrAria) return byTextOrAria;

    const inHeader = allButtons.find((b) => {
      const r = b.getBoundingClientRect();
      if (r.top > 120 || r.width === 0 || r.height === 0) return false;
      const txt = (b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return (
        txt.includes('share') ||
        txt.includes('partag') ||
        aria.includes('share') ||
        aria.includes('partag') ||
        aria.includes('publish')
      );
    });
    if (inHeader) return inHeader;

    return null;
  }

  function findDownloadMenuItem() {
    const candidates = [...document.querySelectorAll('button, div[role="menuitem"], div[role="button"], a, span')];
    return candidates.find((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();

      if (txt.includes('app') || aria.includes('app')) return false;

      return (
        txt === 'download' ||
        txt === 'télécharger' ||
        aria === 'download' ||
        aria === 'télécharger' ||
        txt.startsWith('download') ||
        txt.startsWith('télécharger') ||
        aria.startsWith('download') ||
        aria.startsWith('télécharger')
      );
    });
  }

  function findFinalDownloadButton() {
    const byTestId = document.querySelector('button[data-testid*="download" i]');
    if (byTestId && !byTestId.disabled) return byTestId;

    const buttons = [...document.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !b.disabled;
    });

    return buttons.find((b) => {
      const txt = (b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if (txt.includes('app') || aria.includes('app')) return false;
      return (
        txt === 'download' ||
        txt === 'télécharger' ||
        txt.includes('télécharger un brouillon') ||
        txt.includes('download a free') ||
        aria === 'download' ||
        aria === 'télécharger'
      );
    }) || null;
  }

  async function triggerCanvaDownload(batchNumber = 1) {
    console.log(`[Canva Automator] Début du téléchargement automatique pour le lot #${batchNumber}...`);

    dispatchKey('Escape', 'Escape', 27);
    await sleep(400);

    const shareBtn = findShareButton();
    if (!shareBtn) {
      console.warn('[Canva Automator] Bouton Partager introuvable !');
      return false;
    }

    fireClick(shareBtn);
    await sleep(1200);

    let downloadMenuItem = null;
    for (let i = 0; i < 8; i++) {
      downloadMenuItem = findDownloadMenuItem();
      if (downloadMenuItem) break;
      await sleep(350);
    }

    if (!downloadMenuItem) {
      console.warn('[Canva Automator] Option Télécharger introuvable dans le menu Partager.');
      dispatchKey('Escape', 'Escape', 27);
      return false;
    }

    fireClick(downloadMenuItem);
    await sleep(1500);

    let finalBtn = null;
    for (let i = 0; i < 10; i++) {
      finalBtn = findFinalDownloadButton();
      if (finalBtn) break;
      await sleep(400);
    }

    if (!finalBtn) {
      console.warn('[Canva Automator] Bouton final Télécharger introuvable.');
      dispatchKey('Escape', 'Escape', 27);
      return false;
    }

    fireClick(finalBtn);
    await sleep(2000);

    let waitSeconds = 0;
    const maxWaitSeconds = 90;
    while (waitSeconds < maxWaitSeconds && running) {
      const isPreparing = [...document.querySelectorAll('*')].some((el) => {
        const txt = (el.textContent || '').toLowerCase();
        return (
          txt.includes('préparation de votre design') ||
          txt.includes('preparing your design') ||
          txt.includes('téléchargement en cours') ||
          txt.includes('downloading') ||
          el.getAttribute('role') === 'progressbar'
        );
      });

      if (!isPreparing && waitSeconds >= 6) {
        break;
      }

      await sleep(2000);
      waitSeconds += 2;
    }

    console.log(`[Canva Automator] Téléchargement du lot #${batchNumber} terminé.`);
    await sleep(1000);

    dispatchKey('Escape', 'Escape', 27);
    await sleep(500);

    return true;
  }

  // --- NETTOYAGE COMPLET DE LA TIMELINE POUR LE LOT SUIVANT ---
  async function clearTimeline() {
    console.log('[Canva Automator] Nettoyage complet de la timeline...');

    dispatchKey('Escape', 'Escape', 27);
    await sleep(400);

    let maxPagesToDelete = 60;
    while (maxPagesToDelete > 0 && running) {
      const pages = findTimelinePages();
      if (pages.length <= 1) break;

      const lastPage = pages[pages.length - 1];
      fireClick(lastPage);
      await sleep(160);

      dispatchKey('Delete', 'Delete', 46);
      dispatchKey('Backspace', 'Backspace', 8);
      await sleep(160);

      const trashBtn = document.querySelector('button[aria-label*="delete page" i], button[aria-label*="supprimer la page" i], button[aria-label*="delete" i], button[aria-label*="supprimer" i]');
      if (trashBtn) {
        const r = trashBtn.getBoundingClientRect();
        if (r.top > window.innerHeight * 0.4) {
          fireClick(trashBtn);
          await sleep(150);
        }
      }

      maxPagesToDelete--;
    }

    const pagesLeft = findTimelinePages();
    if (pagesLeft.length > 0) {
      fireClick(pagesLeft[0]);
      await sleep(200);
      dispatchKey('Delete', 'Delete', 46);
      dispatchKey('Backspace', 'Backspace', 8);
      await sleep(200);
    }

    const canvas = document.querySelector('main, [role="main"], [data-testid*="canvas"]') || document.body;
    fireClick(canvas);
    await sleep(150);
    dispatchKey('Delete', 'Delete', 46);
    dispatchKey('Backspace', 'Backspace', 8);
    await sleep(350);

    console.log('[Canva Automator] Timeline réinitialisée avec succès.');
  }

  // --- BOUCLE PRINCIPALE D'EXÉCUTION MULTI-LOTS ---
  async function run() {
    if (running) return;
    const s = await getSettings();
    running = true;

    const targetMinutes = Math.max(1, s.targetMinutes || 50);
    const targetSeconds = targetMinutes * 60; // 50 min = 3000 secondes
    const targetText = formatSeconds(targetSeconds);

    const maxVideosPerBatch = Math.min(48, Math.max(5, s.maxVideosPerBatch || 48));

    createBadge();
    let totalAccumulatedSeconds = 0;
    let totalClipsAdded = 0;
    let batchNumber = 1;

    updateBadge({
      durationText: formatSeconds(totalAccumulatedSeconds),
      targetText,
      percent: (totalAccumulatedSeconds / targetSeconds) * 100,
      step: `Démarrage du Lot #${batchNumber} (Recherche « ${s.category || 'nature'} »)...`,
      clips: totalClipsAdded,
      currentBatch: batchNumber,
      batchClips: 0,
      maxBatchClips: maxVideosPerBatch,
      currentQuery: s.category || 'nature'
    });

    // --- BOUCLE EXTERNE : SÉRIES / LOTS SUCCESSIFS JUSQU'À ATTEINDRE 50 MIN ---
    while (running && totalAccumulatedSeconds < targetSeconds) {
      let batchClips = 0;
      let batchSeconds = 0;
      let lastDetectedSeconds = 0;
      const batchDone = new Set();
      let emptyRounds = 0;

      console.log(`[Canva Automator] === DÉBUT DU LOT #${batchNumber} ===`);

      // Étape clé : Saisie du mot-clé, sélection vidéo et ouverture de « Magic recommendations » (See all)
      if (s.useMagicRecommendations !== false) {
        updateBadge({
          durationText: formatSeconds(totalAccumulatedSeconds + batchSeconds),
          targetText,
          percent: ((totalAccumulatedSeconds + batchSeconds) / targetSeconds) * 100,
          step: `Lot #${batchNumber} : Activation des « Magic recommendations »...`,
          clips: totalClipsAdded,
          currentBatch: batchNumber,
          batchClips,
          maxBatchClips: maxVideosPerBatch,
          currentQuery: s.category || 'nature'
        });

        const magicResult = await activateMagicRecommendationsFlow(s, batchNumber);
        if (magicResult && magicResult.clickedFirstVideo) {
          batchClips++;
          totalClipsAdded++;
          batchSeconds += magicResult.clipDuration || 15;
          if (magicResult.item) batchDone.add(keyOf(magicResult.item));
        }
      } else {
        await ensureCategorySearch(s.category || 'nature');
        await sleep(1500);
      }

      // BOUCLE INTERNE : AJOUT DES VIDÉOS DU LOT DEPUIS MAGIC RECOMMENDATIONS (JUSQU'À 48 CLIPS)
      while (running) {
        // 1. Condition d'arrêt du lot : 48 vidéos atteintes
        if (batchClips >= maxVideosPerBatch) {
          console.log(`[Canva Automator] Limite sécurisée du lot atteinte (${batchClips}/${maxVideosPerBatch} clips). Fin du lot.`);
          break;
        }

        // 2. Détection de la bannière Canva 50 vidéos (sécurité d'arrêt immédiat)
        if (isCanva50LimitExceeded()) {
          console.warn('[Canva Automator] Alerte de restriction Canva détectée ! Finalisation immédiate du lot.');
          break;
        }

        // 3. Condition d'arrêt globale : l'objectif des 50 min est atteint
        const currentTotalSec = totalAccumulatedSeconds + batchSeconds;
        if (currentTotalSec >= targetSeconds) {
          console.log(`[Canva Automator] Objectif global atteint : ${formatSeconds(currentTotalSec)} >= ${targetText}!`);
          break;
        }

        // Lecture de la durée actuelle sur la timeline Canva
        const detectedDur = getTimelineDurationInSeconds();
        if (detectedDur.seconds > lastDetectedSeconds) {
          lastDetectedSeconds = detectedDur.seconds;
          if (detectedDur.seconds > batchSeconds) {
            batchSeconds = detectedDur.seconds;
          }
        }

        const effectiveTotalSec = totalAccumulatedSeconds + batchSeconds;
        const effectiveTotalText = formatSeconds(effectiveTotalSec);
        const pct = Math.min(100, (effectiveTotalSec / targetSeconds) * 100);

        updateBadge({
          durationText: effectiveTotalText,
          targetText,
          percent: pct,
          step: `Lot #${batchNumber} : clip ${batchClips}/${maxVideosPerBatch} (${formatSeconds(batchSeconds)} dans ce lot) | Total : ${effectiveTotalText} / ${targetText}`,
          clips: totalClipsAdded,
          currentBatch: batchNumber,
          batchClips,
          maxBatchClips: maxVideosPerBatch,
          currentQuery: 'Magic recommendations'
        });

        // Recherche du prochain clip vidéo nature valide (avec badge de durée)
        const items = findVideoItems(s.skipPro);
        const next = items.find((el) => !batchDone.has(keyOf(el)));

        if (!next) {
          emptyRounds++;
          updateBadge({
            durationText: effectiveTotalText,
            targetText,
            percent: pct,
            step: `Lot #${batchNumber} : Défilement pour plus de recommandations (${emptyRounds}/4)...`,
            clips: totalClipsAdded,
            currentBatch: batchNumber,
            batchClips,
            maxBatchClips: maxVideosPerBatch,
            currentQuery: 'Magic recommendations'
          });

          await triggerInfiniteScroll();
          await sleep(1400);

          if (emptyRounds >= 4) {
            console.log('[Canva Automator] Section recommandations complétée pour ce lot.');
            break;
          }

          continue;
        }

        emptyRounds = 0;
        batchDone.add(keyOf(next));

        // Si "Ajouter une nouvelle page" est activé et qu'on a déjà le premier clip de ce lot
        if (s.addNewPage && batchClips > 0) {
          const addBtn = findAddPageButton();
          if (addBtn) {
            fireClick(addBtn);
            await sleep(550);
          }
        }

        const cardEl = next.closest('[data-result-key]') || next.closest('[role="group"]') || next;
        const clipDuration = getItemDurationSeconds(cardEl);

        fireClick(next);
        batchClips++;
        totalClipsAdded++;
        batchSeconds += clipDuration;

        await sleep(s.delay || 1200);

        const afterDur = getTimelineDurationInSeconds();
        if (afterDur.seconds > 0) {
          batchSeconds = Math.max(batchSeconds, afterDur.seconds);
          lastDetectedSeconds = afterDur.seconds;
        }

        if (!running) break;
      }

      if (!running) break;

      // --- PHASE DE FINALISATION DU LOT EN COURS ---
      // 1. Suppression des pistes audio du lot
      if (s.removeAudio) {
        updateBadge({
          durationText: formatSeconds(totalAccumulatedSeconds + batchSeconds),
          targetText,
          percent: Math.min(100, ((totalAccumulatedSeconds + batchSeconds) / targetSeconds) * 100),
          step: `Lot #${batchNumber} : Suppression des pistes audio...`,
          clips: totalClipsAdded,
          currentBatch: batchNumber,
          batchClips,
          maxBatchClips: maxVideosPerBatch,
          currentQuery: 'Magic recommendations'
        });
        await removeAllAudioTracks(batchNumber);
        await sleep(400);
      }

      // 2. Suppression des animations du lot
      if (s.removeAnimations) {
        updateBadge({
          durationText: formatSeconds(totalAccumulatedSeconds + batchSeconds),
          targetText,
          percent: Math.min(100, ((totalAccumulatedSeconds + batchSeconds) / targetSeconds) * 100),
          step: `Lot #${batchNumber} : Suppression des animations...`,
          clips: totalClipsAdded,
          currentBatch: batchNumber,
          batchClips,
          maxBatchClips: maxVideosPerBatch,
          currentQuery: 'Magic recommendations'
        });
        await removeAllAnimations(batchNumber);
        await sleep(400);
      }

      // 3. Téléchargement automatique du lot
      if (s.autoDownload !== false) {
        updateBadge({
          durationText: formatSeconds(totalAccumulatedSeconds + batchSeconds),
          targetText,
          percent: Math.min(100, ((totalAccumulatedSeconds + batchSeconds) / targetSeconds) * 100),
          step: `Lot #${batchNumber} : Téléchargement automatique (${batchClips} vidéos, ${formatSeconds(batchSeconds)})...`,
          clips: totalClipsAdded,
          currentBatch: batchNumber,
          batchClips,
          maxBatchClips: maxVideosPerBatch,
          currentQuery: 'Magic recommendations'
        });

        await triggerCanvaDownload(batchNumber);
        await sleep(2500);
      }

      totalAccumulatedSeconds += batchSeconds;

      // 4. Si l'objectif global n'est pas encore atteint : nettoyer la timeline et lancer le lot suivant
      if (totalAccumulatedSeconds < targetSeconds && running) {
        if (s.clearTimelineBetweenBatches !== false) {
          updateBadge({
            durationText: formatSeconds(totalAccumulatedSeconds),
            targetText,
            percent: (totalAccumulatedSeconds / targetSeconds) * 100,
            step: `Lot #${batchNumber} téléchargé ! Nettoyage de la timeline pour le Lot #${batchNumber + 1}...`,
            clips: totalClipsAdded,
            currentBatch: batchNumber,
            batchClips: 0,
            maxBatchClips: maxVideosPerBatch,
            currentQuery: 'Magic recommendations'
          });

          await clearTimeline();
          await sleep(2000);
        }

        batchNumber++;
        await sleep(1500);
      }
    }

    if (!running) {
      updateBadge({
        durationText: formatSeconds(totalAccumulatedSeconds),
        targetText,
        percent: 0,
        step: 'Arrêté par l’utilisateur.',
        clips: totalClipsAdded,
        currentBatch: batchNumber,
        batchClips: 0,
        maxBatchClips: maxVideosPerBatch,
        currentQuery: 'Arrêté'
      });
      removeBadge(4000);
      return;
    }

    // --- FIN TRIOMPHALE DE TOUS LES TRAVAUX ---
    const finalDisplay = formatSeconds(totalAccumulatedSeconds);
    running = false;

    if (s.playSound) {
      playVictorySound();
    }

    updateBadge({
      durationText: finalDisplay,
      targetText,
      percent: 100,
      step: `✔ 50 min atteintes avec succès ! ${batchNumber} parties téléchargées (${totalClipsAdded} vidéos au total).`,
      isDone: true,
      clips: totalClipsAdded,
      currentBatch: batchNumber,
      batchClips: 0,
      maxBatchClips: maxVideosPerBatch,
      currentQuery: 'Terminé'
    });

    removeBadge(25000);
  }

  function stop() {
    running = false;
    updateBadge({
      durationText: '0:00',
      targetText: '50:00',
      percent: 0,
      step: 'Arrêté.',
      clips: 0,
      currentBatch: 1,
      batchClips: 0,
      maxBatchClips: 48
    });
    removeBadge(3000);
  }

  // --- COMMUNICATION AVEC LE SIDEPANEL & LE POPUP ---
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'start') {
      run();
      reply({ ok: true, running: true });
    } else if (msg.type === 'stop') {
      stop();
      reply({ ok: true, running: false });
    } else if (msg.type === 'status') {
      reply({ running, duration: getTimelineDurationInSeconds() });
    }
    return true;
  }
);
})();
