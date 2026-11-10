# NEON RUSH 3D

A 3D endless runner set in a neon cyberpunk city, built with Three.js and vanilla JavaScript. No build step, no backend, no paid APIs.

## Run locally

Open a terminal in this folder and start any static server, for example:

    npx serve .
    # or
    python3 -m http.server 8000

Then visit the printed URL. Opening `index.html` directly may block the ES module import in some browsers, so use a server.

## Deploy to GitHub and Vercel

1. Push this folder to a GitHub repository. `index.html` must sit in the repository root.
2. In Vercel, import the repository and set:
   - Framework Preset: Other
   - Build Command: None
   - Output Directory: `.`
   - Install Command: None

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move left / right | Left / Right or A / D | Swipe left / right or tap the arrow buttons |
| Jump | Space / Up / W | Swipe up or tap the jump button |
| Slide | Down / S | Swipe down or tap the slide button |
| Boost (when full) | B or BOOST button | BOOST button |
| Pause | Esc / P | Pause button |

## Gameplay

- Three lanes, automatic forward running, and speed that increases the longer you survive.
- Obstacles: neon barriers (jump), road blocks (change lane), overhead energy bars (slide under), laser gates (jump or change lane), and pulsing energy walls.
- Collect neon coins. Each coin adds to the boost meter; a full meter lets you trigger a speed boost.
- Best distance, total coins, selected runner color, and sound setting are saved to localStorage.

## Project structure

    neon-rush-3d/
    ├── index.html   Screens and HUD markup
    ├── style.css    Glassmorphism UI, responsive layout
    ├── game.js      Three.js scene, runner, obstacles, audio, save system
    ├── README.md
    └── assets/
        ├── textures/   (reserved; textures are generated procedurally)
        ├── models/     (reserved; models are built from primitives)
        ├── audio/      (reserved; sound is synthesized with Web Audio)
        └── icons/      favicon.svg

The game currently generates all visuals and sound in code, so the asset folders are placeholders for future art and audio files.

## Notes

- Three.js is loaded from the jsDelivr CDN (version 0.160.0 pinned in `index.html`).
- If WebGL is unavailable, the game shows a message instead of a broken screen.
- Sound requires a user interaction before browsers allow playback; the first tap or key press unlocks it.
