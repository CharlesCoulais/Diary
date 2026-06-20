import { useEffect, useRef } from 'react';

/**
 * Intercepte le bouton "retour" du téléphone (Android nav bar, geste iOS) pour
 * fermer une modale/sheet **au lieu de naviguer en arrière** dans l'app.
 *
 * Pattern : on pousse une entrée history fictive à l'ouverture. Le back navigateur
 * la consomme et déclenche `popstate` → on ferme la modale. À la fermeture par
 * clic, on consomme nous-mêmes l'entrée via `history.back()`.
 *
 * MODALES EMPILÉES : chaque modale stocke sa **profondeur** (`__modalDepth`) dans
 * `history.state`. Une modale ne se ferme sur `popstate` que si la profondeur
 * courante est repassée **sous** la sienne — son entrée a réellement été dépilée.
 * Fermer une modale enfant (profondeur supérieure) laisse `depth >= myDepth` : la
 * modale parente l'ignore et reste ouverte. Sans ça, le `history.back()` interne
 * d'une modale enfant fermait aussi le panneau parent.
 *
 * IMPORTANT : `onClose` est lu via un ref pour que l'effet ne re-tourne PAS quand
 * l'appelant passe une arrow function inline (`() => setOpen(false)`).
 */
export function useBackButtonClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return;

    let consumedByPopState = false;
    const readDepth = () =>
      (window.history.state as { __modalDepth?: number } | null)?.__modalDepth ?? 0;
    const myDepth = readDepth() + 1;
    window.history.pushState({ __modalDepth: myDepth }, '');

    const onPopState = () => {
      // Notre entrée est encore en place (depth >= myDepth) → le popstate
      // concerne une modale enfant empilée au-dessus, pas nous.
      if (readDepth() >= myDepth) return;
      consumedByPopState = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (consumedByPopState) return;
      // history.back() UNIQUEMENT si notre entrée est encore au sommet :
      //  - un `navigate()` après onClose a poussé un état sans `__modalDepth`
      //    → readDepth() !== myDepth → on ne back pas (sinon on annulerait la nav).
      //  - un remount StrictMode a re-poussé → idem.
      // Différé via setTimeout pour laisser finir un éventuel navigate synchrone.
      setTimeout(() => {
        if (readDepth() === myDepth) window.history.back();
      }, 0);
    };
  }, [isOpen]); // ⚠️ pas `onClose` ici — voir commentaire au-dessus.
}
