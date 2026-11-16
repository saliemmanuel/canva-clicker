// Configuration du Side Panel dans Chrome
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Canva Automator] Erreur configuration sidePanel:', error));
