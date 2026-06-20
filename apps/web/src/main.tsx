import React from 'react';
import ReactDOM from 'react-dom/client';
import { polyfill as mobileDragDropPolyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';
import { App } from './App';
import './styles/globals.css';
import './lib/theme'; // applique dark/light immédiatement, avant tout rendu
import './lib/fontSize'; // applique la taille root choisie par l'utilisateur

// Active le drag & drop HTML5 sur tactile (TipTap utilise le DnD natif pour les
// blocs Branch / Chat / EditBlock — sans ce polyfill, rien ne se passe sur mobile).
//  - holdToDrag : drag après 250ms de pression — le scroll normal reste possible.
//  - forceApply : indispensable sur Android Chrome qui annonce un support natif
//    du DnD mais n'émet pas réellement de dragstart depuis un touch.
mobileDragDropPolyfill({
  forceApply: true,
  holdToDrag: 250,
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
});

// Le polyfill émule pointermove via touchmove non-passif. Sans ce listener vide
// non-passif sur window, certains navigateurs (Safari iOS) gèlent le drag.
window.addEventListener('touchmove', () => {}, { passive: false });

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
