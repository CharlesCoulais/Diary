# Calendrier

> 👑 **Owner uniquement.**

Vue mensuelle de ton journal avec un **bandeau d'intelligence** en haut et une **feuille du jour** au clic. Sert à la fois à visualiser tes habitudes et à explorer un jour précis sans quitter la page.

## Le bandeau d'intelligence

Sous le titre du mois, une rangée de chips compactes affiche :

- **🔥 Streak** — nombre de jours consécutifs avec au moins une note (basé sur tout ton journal, pas juste le mois). En accent quand actif.
- **📅 Jours écrits / Total** — % de remplissage du mois affiché
- **✏️ Notes** — nombre total + ~ par jour écrit
- **Mood dominant** — emoji du mood le plus utilisé ce mois (issu des notes ET du daily tracker)
- **😴 Sommeil moyen** — moyenne des heures de sommeil renseignées

Chaque chip a un tooltip au survol pour le détail. Les chips inutiles (pas de mood, pas de sommeil) sont masquées.

## La grille

- 7 colonnes (lundi à dimanche)
- **Aujourd'hui** : anneau coloré + fond accentué
- **Jour avec notes** : jusqu'à 3 points colorés (un par type), plus un compteur **+N** si le jour a plus de 3 types distincts
- **Jour futur** : grisé et non cliquable
- **Jour vide** : numéro grisé sans points

## La feuille du jour (DaySheet)

**Clic sur un jour** → un panneau s'ouvre avec :

1. Un **recap du ressenti du jour** ([daily tracker](journal.md)) si renseigné — cliquable pour ouvrir Home à cette date et l'éditer
2. La **liste des notes du jour**, triées par heure : type coloré + heure + mood + badges + headline + preview de 2 lignes
3. Bouton **« Ouvrir cette journée → »** qui navigue vers Home/Aujourd'hui à cette date

Si le jour n'a ni notes ni daily log, le sheet ne s'ouvre pas.

## Naviguer entre les mois

- **Flèche gauche** — mois précédent (illimité dans le passé)
- **Flèche droite** — mois suivant. **Désactivée si tu es déjà au mois courant** : impossible d'aller dans le futur.
- **Bouton « Aujourd'hui »** — apparaît seulement quand tu n'es pas sur le mois courant. Te ramène d'un clic.

## La légende

Sous la grille, une légende montre la **couleur associée à chaque type** de note (Livre, Film, Série, etc.) — sauf le type Journal qui est implicite.

## 💡 Astuces

- **Clic sur un jour** → ouvre la feuille du jour pour exploration rapide. Bouton « Ouvrir » pour passer en édition.
- La grille **n'affiche pas les capsules temporelles non débloquées** — leurs jours apparaissent comme vides tant que la date d'ouverture n'est pas atteinte.
- Le calendrier est utile pour **repérer les périodes où tu n'as rien écrit** (semaines complètement vides) et combler les trous si tu veux.
- Le bandeau et le DaySheet sont alimentés par les **mêmes données Dexie locales** que les autres pages — pas d'aller-retour réseau au chargement.
