# Space Hand Pilot 3D

Jeu de vaisseau spatial en **3D**, jouable dans le navigateur et contrôlé par les **mouvements des mains** devant une webcam.

**Réalisé par [raniaXdaoudi](https://github.com/raniaXdaoudi)**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=three.js&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-4285F4?logo=google&logoColor=white)

## Aperçu

- Rendu **3D** avec Three.js (vaisseau, astéroïdes)
- Contrôle **gestuel** via MediaPipe Hands (2 mains)
- **Fallback clavier** si la caméra est indisponible
- 3 vies, score progressif, difficulté croissante

## Contrôles

| Main | Geste | Action |
|---|---|---|
| **Gauche** | Main ouverte, doigts pointés | Piloter le vaisseau |
| **Clavier** | `←` `→` `↑` `↓` | Fallback |

> Les labels Gauche/Droite à l'écran sont inversés par rapport à la caméra miroir — les mécaniques restent cohérentes.

## Lancer en local

Un serveur HTTP local est requis (la caméra ne fonctionne pas en `file://`).

```bash
git clone https://github.com/raniaXdaoudi/space-hand-pilot-3d.git
cd space-hand-pilot-3d
make run
```

Ou sans Make :

```bash
python3 -m http.server 8000
```

Si le port 8000 est occupé : `make stop` puis `make run`, ou `PORT=8080 make run`.

Puis ouvrir **http://localhost:8000** et autoriser l'accès à la caméra.

## Structure du projet

```
space-hand-pilot-3d/
├── index.html          # Page principale
├── css/style.css       # Interface (HUD, Game Over)
├── js/
│   ├── game.js         # Jeu 3D — Three.js
│   ├── handTracker.js  # Détection mains — MediaPipe
│   └── main.js         # Point d'entrée
├── LICENSE
└── README.md
```

## Technologies

| Librairie | Usage |
|---|---|
| [Three.js](https://threejs.org/) | Rendu 3D dans le navigateur |
| [MediaPipe Hands](https://developers.google.com/mediapipe) | Détection et suivi des mains |
| HTML / CSS / JavaScript | Aucun build, aucun backend |

## Règles du jeu

- Évitez les astéroïdes qui arrivent du haut et de la droite
- Le score augmente avec le temps
- 3 vies — Game Over quand elles sont épuisées

## Auteur

**[raniaXdaoudi](https://github.com/raniaXdaoudi)**

## Licence

MIT — voir [LICENSE](LICENSE).
