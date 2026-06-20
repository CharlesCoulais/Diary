# Rôles et permissions

Diary fonctionne autour d'un **propriétaire unique** (l'Owner) qui écrit son journal, et d'**invités** (les Guests) qui peuvent le lire — partiellement ou entièrement, selon ce que l'Owner partage.

## Les 3 rôles

### 👑 Owner — le propriétaire
Tu es la seule personne qui écrit dans ce journal. Tu as accès à **tout** :
- Création, édition, suppression de notes
- Toutes les pages (Journal, Timeline, Tâches, Collection, Calendrier, Stats, Fil, Brouillons, Réglages)
- Gestion des invitations Guest
- Réglages avancés (clé API, export, 2FA, sessions actives)

Tu décides aussi de **ce qui est visible** par chaque guest, note par note.

### 👤 Guest — l'invité standard
Un guest standard peut lire uniquement les notes que tu as **explicitement partagées** :
- Les notes marquées « Partagé à tous »
- Les notes partagées spécifiquement à lui

Il **ne voit pas** :
- Tes notes privées (la grande majorité par défaut)
- La Timeline complète, le Calendrier, les Tâches, la Collection, les Stats
- Les brouillons

Il peut **commenter** les notes auxquelles il a accès (sauf si tu as fermé un fil), et il a sa propre vue d'accueil avec un défilement chronologique des notes partagées.

### 🤝 Confidant — l'invité de confiance
C'est un guest avec un niveau d'accès supérieur. Il peut lire **toutes** tes notes, y compris les notes privées — **à l'exception des notes marquées « secret »**, qui restent strictement réservées à toi. Il accède aussi à :
- **Tâches** — peut créer des tâches, mais pas modifier les tiennes
- **Collection** — vue lecture seule de tes lectures, films, séries…
- **Stats** — vue agrégée
- **Calendrier** — pour naviguer dans tes archives

C'est typiquement le rôle pour un partenaire, un thérapeute ou une personne de confiance absolue.

## Comment partager une note

Par défaut, **toute nouvelle note est privée**. Pour la partager, tu utilises le menu de visibilité dans la note :

| Niveau | Qui voit la note |
|--------|------------------|
| 🔒 **Privée** | Toi uniquement (et tes confidants si configuré) |
| 🌐 **Partagée à tous** | Tous tes guests (standard et confidants) |
| 🤝 **Spécifique** | Les guests que tu coches dans la liste |

Tu peux changer la visibilité à tout moment, même après avoir publié.

### Cas particuliers

- **Notes « Pour toi »** (le confident) — bouton 💌. Ça partage la note uniquement avec ton confidant et lui envoie une notification.
- **Notes « Secret »** — bouton 🔐. **Boîte de Pandore** : la note est invisible pour absolument tout le monde sauf toi, **y compris ton confidant**. C'est précisément la soupape qui rend l'accès Confidant supportable : tu peux donner accès à tout par défaut, et garder à part ce que tu ne veux montrer à personne.
- **Capsules temporelles** — note avec une date de déverrouillage future. Personne ne peut la lire avant la date prévue, pas même le confidant.

## Inviter un guest

📍 *Réglages → Guests* (Owner uniquement)

1. Saisis l'email de la personne
2. Choisis son niveau d'accès (`Standard` ou `Confidant`)
3. Envoie l'invitation — un lien valable 7 jours est généré
4. La personne crée son compte (ou se connecte si elle en a déjà un) puis accepte l'invitation

Tu peux à tout moment :
- Changer le niveau d'accès d'un guest (passer de Standard à Confidant ou inversement)
- Lui retirer le droit de commenter
- Le révoquer complètement (il perd l'accès immédiatement)
