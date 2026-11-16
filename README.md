# 🎬 Canva Video Automator (Chrome Extension - Side Panel)

Extension Google Chrome (Manifest V3) sous forme de **volet latéral (Side Panel)** conçue pour automatiser la création de vidéos longues (ex: 50 minutes de paysages/nature) dans l'éditeur de vidéo **Canva**.

---

## 🌟 Fonctionnalités Principales

1. **Recherche et Filtrage Intelligent** :
   - Accès automatique à l'onglet *Éléments*.
   - Saisie du mot-clé souhaité (*nature*, *paysage*, etc.) compatible avec les inputs contrôlés par React.
   - Activation automatique du filtre **Vidéos**.
   - Détection et sélection exclusive des vraies vidéos avec badge de durée (`16.0s`, `56.0s`, `1:57`, etc.).
   - Option pour ignorer automatiquement les éléments Canva Pro (👑).

2. **Gestion de la Restriction Canva (50 vidéos max)** :
   - Canva restreint les pages/projets à 50 vidéos maximum.
   - L'extension fonctionne par **séries/lots automatiques** de 48 vidéos (marge de sécurité).
   - Une fois la limite de 48 vidéos atteinte :
     - Suppression automatique des pistes audio.
     - Suppression automatique des animations de transition.
     - Déclenchement automatique de l'export / téléchargement MP4 via le menu *Partager*.
     - Nettoyage et vidage de la timeline pour repartir d'une page blanche.
     - Enchaînement automatique de la série suivante jusqu'à atteindre l'objectif global (ex: 50 min).

3. **Interface Side Panel (Volet Latéral Natif)** :
   - S'ouvre dans le panneau latéral de Chrome à droite de Canva.
   - Suivi en direct : durée cumulée globale (`X:XX / 50:00`), progression en %, numéro de lot actif (`Lot #1 (12/48)`), nombre de clips ajoutés.
   - Journal d'activité terminal en temps réel.
   - Badge flottant synchronisé sur la page Canva.
   - Boutons *Démarrer* et *Arrêter* à tout moment.

4. **Carillon de Fin de Travaux (Web Audio API)** :
   - Émission d'un carillon sonore triomphal (Do5, Mi5, Sol5, Do6) sans fichier externe dès que l'objectif total des 50 minutes est atteint.

---

## 📂 Structure du Projet

```
canva-video-automator/
├── manifest.json       # Configuration Manifest V3 (Side Panel, permissions, content_scripts)
├── background.js       # Service worker gérant l'ouverture du volet latéral au clic
├── content.js          # Script injecté dans Canva (DOM automation, filtres, export, timeline)
├── sidepanel.html      # Interface utilisateur du Side Panel
├── sidepanel.js        # Logique et communication du Side Panel avec content.js
├── popup.html          # Interface de secours en popup classique
├── popup.js            # Script du popup de secours
├── .gitignore          # Fichiers ignorés par Git
└── README.md           # Documentation du projet
```

---

## 🚀 Installation & Utilisation

1. **Charger l'extension dans Chrome** :
   - Ouvrez Google Chrome et accédez à `chrome://extensions/`.
   - Activez le **Mode développeur** (en haut à droite).
   - Cliquez sur **Charger l'extension non empaquetée** (*Load unpacked*).
   - Sélectionnez le dossier du projet : `canva-clicker (2)`.

2. **Lancer l'automatisation dans Canva** :
   - Ouvrez votre projet vidéo sur [Canva](https://www.canva.com/).
   - Ouvrez le panneau latéral (Side Panel) de l'extension depuis la barre d'outils Chrome.
   - Configurez vos préférences (durée cible : 50 min, mot-clé : nature, ignorer Pro, etc.).
   - Cliquez sur **▶ Démarrer (50 min)**.

---

## 🛡️ Licence
Projet sous licence MIT.
