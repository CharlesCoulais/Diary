# Sécurité — Code PIN et 2FA

> 🌍 Disponible pour **tous les rôles**.

Diary contient des informations très personnelles. Plusieurs couches de sécurité sont disponibles pour protéger ton journal sur ton appareil et au moment de la connexion.

## 🔢 Code PIN — verrouillage de l'app

Le PIN est une **protection locale** : il verrouille l'accès à l'app sur ton appareil après une période d'inactivité, ou si tu mets l'onglet en arrière-plan.

### À quoi ça sert
- Empêcher quelqu'un qui prend ton téléphone d'accéder à tes notes
- Couper rapidement l'accès si tu prêtes ton ordinateur
- Verrouiller automatiquement quand tu changes d'app

### Configurer ton PIN
À ta première connexion, l'app **te demande obligatoirement** de créer un PIN. Tu choisis 4 chiffres, tu les confirmes, c'est fait.

Tu peux ensuite le **modifier** ou le **supprimer** depuis *Réglages → Code PIN*.

### Quand l'app se verrouille
- Après une période d'inactivité (~15 minutes par défaut)
- Quand tu mets l'onglet en arrière-plan / fermes la fenêtre
- **À la demande** : icône cadenas 🔒 dans l'en-tête de la page d'accueil, ou bouton « Verrouiller maintenant » dans *Réglages → Code PIN*

### Le déverrouillage
Un écran avec un numpad apparaît. Tu tapes ton PIN — il valide automatiquement dès le 4ᵉ chiffre.

### Déverrouillage biométrique (Face ID / Touch ID / empreinte)
Si ton appareil le supporte, tu peux activer le déverrouillage **biométrique** depuis *Réglages → Code PIN* (un code PIN doit d'abord être configuré). Sur l'écran de verrouillage, un bouton « Déverrouiller par biométrie » apparaît alors : Face ID, Touch ID ou l'empreinte lèvent le verrou à la place du PIN.

- C'est **local à cet appareil** et au navigateur courant — ça ne suit pas sur un autre appareil.
- Le **code PIN reste toujours disponible en secours** (biométrie indisponible, échouée, ou nouvel appareil).
- Même niveau de protection que le PIN : c'est un **confort**, pas un chiffrement du contenu. Si tu supprimes le PIN, la biométrie est désactivée avec lui.

### Synchronisation entre appareils
Le hash de ton PIN est stocké côté serveur. Concrètement :
- Si tu te connectes depuis un nouvel appareil, tu **dois reconfigurer** un PIN local sur ce nouvel appareil
- Si tu changes ton PIN, c'est uniquement sur l'appareil courant (chaque appareil a son propre verrou)

### Pourquoi 4 chiffres et pas un mot de passe complet ?
Le PIN est une **protection de surface** — il n'a pas vocation à résister à une attaque ciblée, mais à éviter les accès accidentels et les regards indiscrets. Pour une protection de fond, utilise plutôt le 2FA et un mot de passe fort sur ton compte.

## 🔐 Authentification à 2 facteurs (2FA)

Disponible dans *Réglages → Authentification à 2 facteurs*. C'est une **protection au niveau du login** : même si quelqu'un connaît ton mot de passe, il ne pourra pas se connecter sans avoir aussi accès à ton appareil de confiance.

### Comment ça marche
1. Active le 2FA dans les réglages
2. Scanne le QR code avec une app d'authentification (Authy, Google Authenticator, 1Password, etc.)
3. Saisis le code à 6 chiffres pour confirmer la configuration
4. Désormais, à chaque connexion, on te demandera ce code en plus de ton mot de passe

## 💻 Sessions actives

Dans *Réglages → Appareils connectés*, **tous les utilisateurs** (Owner et Guests) peuvent voir la liste de **toutes les sessions ouvertes** sur leur compte. Pratique pour :

- Vérifier où tu es connecté (ordinateur boulot, téléphone perso, etc.)
- Révoquer une session compromise ou oubliée
- Identifier une connexion suspecte

Le 2FA est aussi disponible pour tous les rôles.

## 💡 Bonnes pratiques

- **Active le PIN partout** : c'est la friction la plus utile au quotidien.
- **Active le 2FA** si ton journal contient des choses sensibles. C'est 30 secondes à configurer et ça change tout.
- **Révoque les sessions inactives** régulièrement, surtout si tu te connectes depuis des appareils que tu ne possèdes plus.
- **Ne partage jamais ton mot de passe ou ton PIN**, même avec ton confidant. Ton confidant a son propre compte avec son propre niveau d'accès.
- Si tu **oublies ton PIN** : déconnecte-toi (il sera réinitialisé). À la prochaine connexion, tu devras en configurer un nouveau.
