# Tâches

> 👑 **Owner** : accès complet.
> 🤝 **Confidant** : peut lire et créer des tâches (titre + catégorie), mais pas modifier celles de l'Owner.
> 👤 Guest standard : pas d'accès.

Système de gestion de tâches intégré au journal. Chaque tâche a un **titre**, un **statut**, une **priorité**, éventuellement une **catégorie**, un **type**, des **notes** et une **date d'échéance**.

## Créer une tâche

Champ de saisie en haut de la page. Tape un titre, valide → la tâche est créée avec le statut « À faire ».

Pour préciser plus de détails à la création, ouvre le bouton **« ⋯ Plus d'options »** : tu peux y définir le statut initial, le type, la catégorie, la priorité et des notes.

## Statuts disponibles

8 statuts au total. Les libellés exacts varient mais le cycle naturel est :

| Statut | Quand l'utiliser |
|--------|-----------------|
| **À faire** (Ouvert) | Statut par défaut |
| **Planifiée** | Tâche programmée pour plus tard |
| **En cours** | Tu travailles dessus |
| **Local** | Faite localement, pas encore poussée (utile pour le dev) |
| **Test** | À tester / valider |
| **Déployé** | Mise en prod (dev) |
| **Fait** | Terminé |
| **Annulée** | Pas faite, abandonnée |

Le **point coloré à gauche** de la tâche change selon le statut : vert pour fait, orange pour en cours, gris pour ouvert, etc. **Cliquer dessus fait avancer la tâche au statut suivant** (raccourci pratique pour les changements rapides).

## Priorités

4 niveaux : 🔴 Haute, 🟠 Moyenne, 🟡 Basse, ou aucune. La priorité s'affiche en badge à côté du titre.

## Dates d'échéance — les bandeaux contextuels

Si une tâche a une date d'échéance et qu'elle est encore active (pas faite ni annulée), un badge contextuel apparaît :

- ⚠ **En retard** (rouge, gras) — date passée
- ⏰ **Aujourd'hui** (orange, gras) — c'est pour aujourd'hui
- **Demain** — pour le lendemain
- *Date* — pour les autres dates à venir

**Astuce cachée** : ces badges sont **cliquables**. Cliquer sur « En retard » ou « Aujourd'hui » filtre instantanément la liste pour ne montrer que les tâches concernées. Re-cliquer pour retirer le filtre.

## Filtrer la liste

En haut de la page, plusieurs menus déroulants :

- **Statut** — Tout / Ouvert / Planifié / etc. (avec le compte par statut)
- **Type** — Tous / Sans type / + tous les types existants
- **Priorité** — Toutes / Haute / Moyenne / Basse / Aucune
- **Auteur** — Mes tâches / Confident (pour distinguer les tâches créées par toi ou par ton confident)
- **Toggle « Masquer terminées »** — cache les statuts Fait, Migré, Annulée

Tous les filtres sont cumulables. Chaque en-tête de catégorie affiche un **compteur** du nombre de tâches correspondant aux filtres actifs.

## Organisation par catégorie

Les tâches sont automatiquement **regroupées par catégorie** dans la page (« Travail », « Maison », « Idées »…). Les tâches sans catégorie apparaissent dans un groupe sans titre.

## Drag & drop

Tu peux **réorganiser les tâches à l'intérieur d'une même catégorie** en les attrapant par la poignée ⠿ qui apparaît au survol. L'ordre est sauvegardé.

## Mode sélection multiple

Bouton **« Sélectionner »** en haut. Active des cases à cocher. Tu peux ensuite :

- Changer le statut de plusieurs tâches d'un coup
- Changer le type
- Supprimer en lot

## Modifier une tâche

Clic sur une tâche → ouvre une modal d'édition avec tous les champs. Esc ou ✕ pour fermer.

## 🤝 Côté Confidant

Le confidant a accès à une page Tâches complète avec le même design que l'Owner :

- **Tâches de l'Owner** : visibles en lecture seule. Cliquer sur une tâche ouvre le panneau de droite (desktop) pour voir tous les détails — statut, priorité, notes, échéance — mais aucune modification n'est possible.
- **Ses propres tâches** : il peut les créer, les modifier et changer leur statut librement. Elles s'affichent avec le tag « (moi) » à côté du titre.
- **Filtres** : le filtre « Auteur » permet de basculer entre « Mes tâches » et « Propriétaire ».
- Pas de drag & drop, pas de mode sélection multiple, pas de suppression.

## 💡 Astuces

- **Cliquer sur le point de statut** est le moyen le plus rapide de marquer une tâche faite.
- **Cliquer sur un badge de date** (Aujourd'hui / En retard) filtre la liste instantanément.
- Les **tâches terminées** s'affichent en barré et estompées — elles restent dans la liste tant que tu n'actives pas « Masquer terminées ».
- La **synchronisation** est automatique. Le petit ↻ tournant en haut indique qu'une mise à jour est en train d'être poussée.
- Tu peux noter des **détails longs** dans le champ « Notes » de chaque tâche (visible dans la modal d'édition).
