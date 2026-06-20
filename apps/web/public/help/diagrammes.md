# Diagrammes 📊 👑

Tu peux insérer des **diagrammes** dans n'importe quelle note : organigrammes, schémas de séquence, frises (gantt), camemberts, mindmaps… Le diagramme se dessine automatiquement à partir d'une description en texte, dans la syntaxe [Mermaid](https://mermaid.js.org/).

> **Note** : seul l'owner peut insérer un diagramme (côté écriture). Les confidents les voient dessinés à la lecture, comme le reste du contenu d'une note.

## Insérer un diagramme

1. Place le curseur là où tu veux le diagramme dans la note
2. Clique sur l'icône diagramme dans la barre d'outils de l'éditeur
3. Un bloc apparaît, déjà en mode édition

Tu peux aussi placer le diagramme **à l'intérieur d'une branche ou d'un ajout** : mets le curseur dedans avant d'insérer, et le diagramme s'imbrique au bon endroit.

## Écrire le diagramme

Dans la zone de texte, décris ton schéma en syntaxe Mermaid. Un **aperçu en direct** s'affiche en dessous pendant que tu tapes. Quand ça te convient, clique sur **Enregistrer**.

Exemple — un organigramme simple :

```
graph TD
  A[Idée] --> B{Faisable ?}
  B -->|Oui| C[On fait]
  B -->|Non| D[On oublie]
```

Quelques types de diagrammes courants :

- `graph TD` / `flowchart LR` — organigrammes (de haut en bas, de gauche à droite…)
- `sequenceDiagram` — échanges entre acteurs
- `gantt` — planning / frise temporelle
- `pie` — camembert
- `mindmap` — carte mentale

La syntaxe complète est documentée sur [mermaid.js.org](https://mermaid.js.org/intro/).

## Plier / déplier

Comme les branches, conversations et ajouts tardifs, un diagramme est **repliable** : clique sur son en-tête (« Diagramme ») pour le replier ou le déplier, en écriture comme en lecture. Pratique pour les notes qui en contiennent plusieurs.

## Agrandir, zoomer et naviguer (lecture)

En lecture, un diagramme peut vite devenir petit. Clique dessus (ou sur le bouton **⤢** dans son en-tête) pour l'ouvrir en **plein écran** :

- **Zoomer / dézoomer** : molette de la souris, pincement à deux doigts, ou les boutons **+** / **−**.
- **Se déplacer** : glisse avec la souris ou le doigt.
- **Réinitialiser** : double-clic, ou le bouton *Réinitialiser*.
- **Fermer** : la croix en haut à droite, la touche Échap, ou un clic en dehors du diagramme.

Pratique pour les grands schémas (mindmaps, flowcharts touffus).

## Modifier ou supprimer

- **✎** dans l'en-tête du bloc rouvre l'éditeur
- **Supprimer** retire le diagramme
- La poignée (⠿) permet de déplacer le bloc dans la note

## Aperçu dans les listes

- En **mode compact**, une note qui ne contient qu'un diagramme s'affiche avec la mention *Diagramme* (comme *Photo*, *Vidéo* ou *Playlist*).
- En **mode normal**, la mention *Diagramme* apparaît discrètement dans l'aperçu de la carte.

## Bon à savoir

- Le rendu suit automatiquement le **thème clair/sombre**.
- Si la syntaxe contient une erreur, le bloc affiche un message clair (« Diagramme Mermaid invalide ») au lieu de planter — corrige et ré-enregistre.
- À l'**export PDF**, le diagramme n'est pas dessiné : sa source apparaît sous forme de bloc de code (lisible).
- Le moteur de rendu est chargé à la demande, au premier diagramme affiché.
