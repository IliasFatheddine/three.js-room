# Blery’s Trial R3F Room

A first-person 3D room built with three.js.

## Open it
Double-click `index.html`. It needs an internet connection the first time, because three.js and the fonts load from online servers.

## Folders
- `index.html` – page structure and the title-screen / popup text
- `css/style.css` – all styling
- `js/compat.js` – small compatibility helper and model-data loader
- `js/main.js` – the scene: room, controls, bottle, box, sounds, popup
- `js/cursor.js` – hand-cursor press effect
- `assets/img/` – seal button, parchment and the two hand cursors
- `assets/models/` – the three 3D models (room, bottle, box)

## Settings you may want to change (in `js/main.js`)
- `let VOL=.24;` sound volume (0 to 1)
- `let LOOK=.22;` mouse look sensitivity (0 to 1)
