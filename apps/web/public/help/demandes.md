# Demandes

> 🤝 **Confidant** : poser des demandes.
> 👑 **Owner** : voir toutes les demandes, les traiter ou les refuser.

La page `/demandes` est un **système de tickets léger** entre le Confidant et l'Owner. Le Confidant peut suggérer un sujet d'écriture, demander un éclaircissement sur une note, ou n'importe quel autre prompt. L'Owner traite à son rythme.

<!-- role:confidant -->
## 🤝 Côté Confidant

### Poser une demande
- Bouton **« + Nouvelle demande »**
- **Titre** (court) et **description** (longue, optionnelle)
- Statut initial : `PENDING` (en attente)

### Tes demandes
La liste affiche toutes tes demandes avec leur statut :
- `PENDING` — pas encore prise en compte par l'Owner
- `IN_PROGRESS` — l'Owner s'y est mis
- `DONE` — traitée (potentiellement avec une **note liée** que tu peux ouvrir)
- `REJECTED` — refusée (avec une raison facultative dans `ownerNote`)

Tu peux **supprimer** une demande tant qu'elle est encore en `PENDING`.

### Notification au traitement
Quand l'Owner passe ta demande en `DONE` ou `REJECTED`, tu reçois une notification (cloche + push si activé). Si une note a été liée à la demande, le clic ouvre directement la note. Sinon, ça t'amène sur la page `/demandes`.

Tu peux désactiver cette notif depuis *Réglages → Notifications → Demandes traitées*.
<!-- /role -->

<!-- role:owner -->
## 👑 Côté Owner

### Vue d'ensemble
La page liste **toutes les demandes de tous tes guests**, avec un badge **compteur** dans la bottom nav (nombre en `PENDING`).

### Traiter une demande
Pour chaque demande, tu peux :
- Changer le **statut** (PENDING → IN_PROGRESS → DONE / REJECTED)
- Ajouter une **note de réponse** (`ownerNote`) — pour expliquer un refus ou commenter ta réponse
- **Lier une note** que tu as publiée — picker qui te laisse choisir une de tes entrées récentes (par URL ou ID)
- **Supprimer** une demande (irréversible)

### Quand tu fais passer une demande en `DONE` ou `REJECTED`
Le guest auteur reçoit automatiquement une notification (in-app + push si opt-in). C'est instantané, pas besoin d'action supplémentaire.

> **Note** : la notification ne part qu'au moment du passage **vers** un état terminal. Si tu re-cliques pour confirmer la même demande, pas de re-notif (l'évènement ne se déclenche qu'au transit).
<!-- /role -->

## 💡 Astuces

- Pour un Confident, **les demandes sont un canal séparé des commentaires** : utile pour suggérer un sujet ou poser une question méta, sans polluer le fil d'une note précise.
- La **note de réponse** (`ownerNote`) est aussi visible quand la demande est marquée `DONE` — pratique pour ajouter un contexte ou un message d'accompagnement.
- Si tu **lies une note** à une demande `DONE`, le clic sur la notification ouvre directement la note pour le guest — UX la plus fluide.
- L'Owner peut **refuser sans expliquer** (laisser `ownerNote` vide) — le statut `REJECTED` suffit. Mais une explication courte aide à fermer la boucle pour le guest.
