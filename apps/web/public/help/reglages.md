# Réglages

> 🌍 **Tous les rôles** ont leur propre page Réglages.

Les réglages diffèrent significativement entre Owner et Guest. Cette page récapitule **chaque section** disponible et qui peut y accéder.

<!-- role:owner -->
## 👑 Réglages Owner

Toutes les sections, dans l'ordre où elles apparaissent :

### 👤 Profil
- **Photo** de profil (JPG/PNG/WebP/GIF, max 8 Mo).
- **Nom d'affichage** (1 à 80 caractères) — visible dans les commentaires, le Fil, la messagerie et le header. Auto-sauvegardé à la perte de focus. Laisse vide pour retomber sur la première partie de ton email.

### 🔢 Code PIN
Configurer, modifier ou supprimer ton PIN de verrouillage. Voir la page [Sécurité](securite.md) pour les détails.

### 🔔 Notifications
- Activer/désactiver les notifications push (rappels d'écriture, nouveaux commentaires)
- Configurer l'heure du rappel quotidien
- Tester l'envoi d'une notif

Voir la page [Notifications](notifications.md).

### 🔡 Taille du texte
Quatre préréglages (**Compact / Normal / Confort / Grand**) qui scalent **toute l'interface** en même temps. Stocké par appareil — utile pour remonter un téléphone un peu serré sans toucher au desktop.

### 🎨 Affichage par défaut (Owner)
- **Masquer les brouillons** par défaut sur la page Journal
- **Types de notes à afficher** par défaut (laisse vide pour tout afficher)
- **Mode compact** : choisis indépendamment pour **Aujourd'hui** et **Journal**
- **Tri par défaut** des notes (Journal seulement) : Heure récente / ancienne, ou Modification récente / ancienne. Réappliqué à chaque ouverture du Journal. *Aujourd'hui garde son propre tri persisté.*

### 🏷 Tags
Gère globalement tes tags sans repasser sur chaque note :
- **Créer** un nouveau tag depuis les Réglages (utile pour préparer une nomenclature).
- **Renommer** : le nouveau nom s'applique d'un coup à toutes les notes concernées.
- **Fusionner** deux tags pour résorber des doublons (typos, casse différente).
- **Supprimer** un tag (les notes restent, juste détaguées).
- **Nettoyer les tags inutilisés** d'un clic quand le bandeau apparaît au-dessus de la liste.

### ✓ Affichage par défaut (Tâches)
- Filtre de statut par défaut
- Filtre de priorité par défaut
- Masquer les tâches terminées par défaut

### 💻 Appareils connectés
Liste des sessions actives sur ton compte. Pratique pour voir où tu es connecté et révoquer une session si nécessaire. Disponible pour tous les rôles.

### 🔐 Authentification à 2 facteurs
Active une seconde couche de sécurité au login.

### 📦 Exporter mon journal
Télécharge **toutes tes données** dans un format archive. Utile pour des sauvegardes hors-ligne ou pour migrer vers une autre instance.

### 🔑 Clé API
Génère un token Bearer pour accéder à l'API REST de production. Utile pour les intégrations / scripts personnels.

### ℹ️ Application
Numéro de version, date de build, état de sync.

### 👥 Guests
Liste de tes guests :
- **Guests actifs** avec leur niveau d'accès (Standard / Confidant)
- **Invitations en attente**
- Pour chaque guest : changer le niveau d'accès, retirer le droit de commenter, ou révoquer l'accès
- Bouton pour **inviter un nouveau guest** par email
<!-- /role -->

---

## 👤🤝 Réglages Guest (et Confidant)

Page plus simple. Sections disponibles :

### 👤 Profil
Mêmes options que côté Owner : **photo** + **nom d'affichage** (visible dans les commentaires et la messagerie).

### 🔡 Taille du texte
Mêmes quatre préréglages que côté Owner (stockés par appareil).

### 🔢 Code PIN
Identique à l'Owner. Tu peux configurer un PIN pour verrouiller l'app sur ton appareil.

### 🔔 Notifications
- Activer les notifications push
- Configurer le rappel quotidien
- **Toggle « Nouvelles notes publiées »** + sélection des types à suivre (off par défaut)
- **Toggle « Tâches traitées »** — quand l'Owner traite/annule une tâche que tu as créée (on par défaut)
- **Toggle « Demandes traitées »** — quand une demande sur `/demandes` est résolue (on par défaut)

Voir [Notifications](notifications.md) pour le détail des types.

### 🎨 Affichage par défaut
- **Masquer les brouillons** (sans effet, mais le toggle existe pour cohérence)
- **Non lus uniquement** — par défaut, n'afficher que les notes non lues
- **Types de notes** par défaut
- **Tri par défaut** (Journal seulement) : Heure récente / ancienne, ou Modification récente / ancienne. Réappliqué à chaque ouverture du Journal du confident.

<!-- role:confidant -->
#### Options exclusives Confidant
- **Pour moi uniquement** — par défaut, n'afficher que les notes adressées à toi
- **Avec ajouts uniquement** — par défaut, n'afficher que les notes que l'Owner a éditées récemment
<!-- /role -->

### 💻 Appareils connectés
Liste de tes sessions actives. Tu peux révoquer un appareil que tu n'utilises plus ou qui te semble suspect.

### 🔐 Authentification à 2 facteurs
Identique à l'Owner.

### 👤 Compte
Bouton **« Se déconnecter »**.

---

## 💡 Astuces

- **Le code PIN est local à ton appareil** : si tu te connectes depuis un autre navigateur, tu n'auras pas de PIN à entrer (mais le hash est synchronisé pour t'aider à le récupérer si tu revenais).
- Les **affichages par défaut** sont sauvegardés en local — chaque appareil peut avoir ses propres préférences.
- Le bouton **« Se déconnecter »** côté Guest te ramène à la page de login. Tes données restent intactes côté serveur.
- Pour les **changements de niveau d'accès Guest** (Standard ↔ Confidant), c'est l'Owner qui agit dans sa propre section Guests. Tu (le Guest) ne peux pas demander un upgrade depuis l'app.
