# Notifications

> 🌍 Disponibles pour **tous les rôles**.

Diary a deux systèmes de notifications complémentaires :

1. **Notifications in-app** — la cloche en haut à droite, qui rassemble toutes les activités récentes
2. **Notifications push** — les rappels système qui apparaissent même quand l'app est fermée

## 🔔 La cloche (notifications in-app)

Icône de cloche en haut de toutes les pages. Elle affiche un **badge avec le compte** de notifications non lues.

### Types de notifications
- **Nouveau commentaire** sur l'une de tes notes (`COMMENT_NEW`)
- **Réponse** dans un fil existant (`COMMENT_REPLY`)
- **Réouverture** d'un fil clos (`THREAD_REOPENED`)
- **Réaction emoji** sur une note ou un commentaire (`REACTION_NEW`)
- **Mention @** — quelqu'un t'a mentionné·e dans une note ou un commentaire (`MENTION_NEW`). Tu n'es prévenu·e que pour les contenus que tu as le droit de voir (jamais pour une note secrète ou non partagée).
- **Mise à jour de tâche** — statut/priorité (`TASK_UPDATED`). Le guest créateur d'une tâche reçoit aussi la notif quand l'Owner la passe en `Fait` ou `Annulé`.
- **Nouvelle note publiée** (`ENTRY_NEW`) — pour le guest, selon ses préférences (voir plus bas)
- **Ajout tardif sur une note publiée** (`ENTRY_EDIT`) — un bloc edit a été inséré dans une note déjà publiée
- **Demande traitée** (`REQUEST_TREATED`) — l'Owner a marqué une demande du guest comme `Faite` ou `Refusée`

### Filtre par catégorie

Quand tu as plusieurs types de notifs actives, des pills apparaissent en haut du panneau pour filtrer : **Tout · Commentaires · Réactions · Notes · Tâches · Demandes**. Chaque pill affiche un compteur des non-lues. Les pills pour des catégories vides sont masquées (zéro pollution). Sur mobile, swipe horizontal si besoin (un fade sur les bords signale qu'il y a du contenu débordant).

### Le panneau de la cloche

Clic sur la cloche → un panneau s'ouvre avec deux onglets :

- **Notifications** — l'activité récente (max 30 entrées). Compte des non-lues affiché.
- **Archives** — les notifications que tu as archivées

Chaque notification montre :
- Le **type d'événement** (« Alex a commenté », « Tâche mise à jour »…)
- Le **contexte** : titre de la note ou de la tâche concernée
- Pour les commentaires : l'**ancre** (le passage de la note ciblé) et un extrait du commentaire
- Pour les tâches : le **changement** précis (« statut → Fait », « priorité → haute »)
- Une **heure relative** (« 2 min », « 3 h », « 4 sept »)
- Un **point coloré** si non lue

### Actions rapides

- **Clic sur une notification** → ouvre la note et le commentaire concernés (ou la page Tâches pour une tâche)
- **Bouton ✕ (croix)** à droite → archive la notification
- En haut du panneau :
  - **« Tout lire »** — marque toutes les notifications comme lues
  - **« Archiver lues »** — archive d'un coup toutes les notifications déjà lues

### Onglet Archives
Pour récupérer une notification archivée par erreur. Bouton **« ↩ »** pour la désarchiver.

### Refresh automatique
Le panneau se met à jour **toutes les 30 secondes** automatiquement, donc pas besoin de rafraîchir.

## 🔔 Notifications push (système)

Les notifications push arrivent **même quand l'onglet est fermé**, comme une notif WhatsApp ou Mail. Elles sont **opt-in** — tu dois explicitement les activer.

### Activer les push
*Réglages → Notifications → Activer les notifications*

L'app demande la permission au navigateur. **Accepte** pour que les push arrivent sur ton appareil. Si tu refuses, tu peux toujours utiliser la cloche in-app.

### Configurer le rappel quotidien
Tu peux paramétrer une **heure** à laquelle l'app t'envoie un rappel pour écrire (par défaut 9h). Pratique pour intégrer le journal à ta routine.

### Rappel du suivi quotidien
Indépendant du rappel d'écriture, tu peux activer un **rappel pour ton ressenti du jour** (humeur, sommeil, énergie, anxiété, météo) avec sa propre heure. Il est **intelligent** : il ne se déclenche **que si tu n'as encore rien noté** ce jour-là — une fois ton suivi rempli, pas de rappel. Pour entretenir l'habitude, une pastille **🔥 N** s'affiche sur le bloc « Ressenti du jour » dès que tu enchaînes au moins 2 jours de suivi d'affilée.

### Tester
Bouton **« Envoyer un test »** pour vérifier que les push arrivent bien.

### Désactiver
Toggle dans *Réglages → Notifications*. Tu peux aussi révoquer la permission au niveau du navigateur ou du système.

## Notifications discrètes

Pour ne pas révéler le contenu du journal sur ton écran verrouillé, active **Notifications discrètes** dans *Réglages → Notifications*.

Une fois activé :

- **Titre affiché** — la ligne en gras de la notif (ex. « Rappel »).
- **Message affiché** — le texte (ex. « Nouvelle activité »).
- **Icône** — au choix parmi un jeu sobre : cloche, météo, note, agenda, message.

Un **aperçu** te montre le rendu. Le vrai contenu (qui a commenté, le texte du message…) n'est alors **jamais transmis** à l'appareil — il est remplacé côté serveur. Tu ouvres l'app pour voir le détail.

### Toujours, ou selon un horaire

Tu choisis quand le mode discret s'applique :

- **Toujours** — toutes les notifications sont discrètes.
- **Selon un horaire** — tu définis des **plages** (jours de la semaine + heure de début et de fin). En dehors de ces plages, les notifications affichent le vrai contenu.

Pour une plage qui passe minuit, indique une heure de fin **inférieure** à l'heure de début (ex. `17:00` → `08:00` couvre la soirée et la nuit). Une plage peut aussi être cochée **« Toute la journée »**. Un weekend continu se découpe en quelques plages (vendredi soir, samedi/dimanche toute la journée, lundi matin). L'évaluation se fait à **ton heure locale**.

## Mode silencieux

Le **mode silencieux** va plus loin que le mode discret : pendant ses plages horaires, **aucune notification push n'est envoyée du tout**.

- Il se configure comme le mode discret (plages jours + heures, ou toute la journée).
- Il est **prioritaire** : si une plage silencieuse est active, rien n'est envoyé, même si le mode discret l'était aussi.
- La **cloche in-app** continue de se mettre à jour normalement — tu ne rates rien, tu le retrouves simplement au calme en ouvrant l'app.

Idéal pour les nuits, les réunions, ou tout moment où tu ne veux **aucune** sollicitation.

## Notifications importantes

Certains types de notification peuvent être marqués **importants** : ils **ignorent les modes silencieux et discret** et arrivent toujours, en clair.

Dans *Réglages → Notifications*, coche les types concernés (connexion à un nouvel appareil, messages, commentaires, réactions, tâches, demandes, nouvelles notes). Par défaut, seule l'alerte de **connexion à un nouvel appareil** est importante — c'est une information de sécurité critique qui ne doit jamais être retardée ni masquée.

> Le système d'exploitation affiche toujours un petit **libellé avec le nom de l'app** à côté de la notification — ça, l'app ne peut pas le changer. Astuce : renomme le raccourci de l'app sur ton téléphone pour qu'il soit lui aussi discret.

<!-- role:guest -->
## 👤 Préférences guest

Les guests ont des toggles dédiés dans *Réglages → Notifications* pour piloter ce qu'ils reçoivent :

- **Nouvelles notes publiées** (off par défaut) — alerte à la publication d'une note (pas pendant les brouillons). Si activé, une grille de pills te laisse choisir **les types** de notes à suivre (Journal, Livre, Musique…). Les **ajouts tardifs** (blocs edit) sur tes types suivis génèrent aussi une alerte.
- **Tâches traitées** (on par défaut) — quand une tâche que tu as créée passe à `Fait` ou `Annulée`.
- **Demandes traitées** (on par défaut) — quand une demande que tu as faite est traitée ou refusée.
- **Commentaires** (on par défaut) — quand on répond à un de tes commentaires.
- **Réactions** (on par défaut) — quand quelqu'un réagit à un de tes commentaires.
- **Messagerie** (on par défaut) — nouveau message ou réaction dans le chat direct.
- **Nouvelle connexion** (on par défaut) — alerte quand un autre appareil se connecte à ton compte.

Ces préférences s'appliquent **en plus** du toggle global push : si le push est désactivé, tu reçois quand même les notifs dans la cloche in-app.
<!-- /role -->

## 💡 Astuces

- **Cliquer sur une notif te scrolle directement au commentaire** : l'app ouvre la note, le bon fil est déplié, et le commentaire est mis en évidence.
- **Les notifications de tâches** sont silencieuses si tu travailles seul (puisque seul le confidant peut générer ces événements pour toi).
- Si tu reçois trop de notifications, **archive en lot** avec « Archiver lues » plutôt que de cliquer une par une.
- Le bandeau **« Notif push désactivées · Activer → »** apparaît en bas du panneau de la cloche pour t'aider à les activer si tu ne l'as pas encore fait.
- Sur **mobile**, ajouter l'app à l'écran d'accueil (PWA) améliore la fiabilité des push.
