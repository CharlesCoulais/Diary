# Stats

> 👑 **Owner** : stats complètes calculées en local sur tout ton journal.
> 🤝 **Confidant** : stats agrégées sur les notes auxquelles tu as accès.
> 👤 Guest standard : pas d'accès.

Tableau de bord de ton activité d'écriture. Tu y trouves tes streaks, ton heatmap annuel, la répartition de tes types de notes, tes humeurs et tes tags les plus utilisés.

## Ce que tu trouves sur la page

### 🔥 Streaks (séries)

En haut, ton **streak courant** affiché en grand :

- Nombre de jours consécutifs où tu as écrit
- Tolérance d'**un jour de pause** (si tu n'as pas écrit aujourd'hui mais que tu as écrit hier, ton streak n'est pas perdu)
- Affiche aussi ton **meilleur streak** historique
- Messages contextuels :
  - « Écris aujourd'hui pour maintenir ton streak ! » si tu n'as rien écrit aujourd'hui mais que ta série tient encore
  - « X jours d'affilée 🎉 » si tu es actif aujourd'hui
  - « Aucune entrée hier ni aujourd'hui — recommence le streak ! » si tu as cassé ta série

### 📊 Compteurs principaux

- **Entrées** : nombre total de notes
- **Jours écrits** : nombre de jours uniques avec au moins une note

### 🔥 Heatmap d'activité (52 semaines)

Une grille style « GitHub contribution graph » :

- 52 colonnes (les 52 dernières semaines) × 7 lignes (lundi → dimanche)
- Chaque case = un jour, coloré selon le nombre de notes ce jour-là :
  - Vide / clair : 0 notes
  - Légèrement coloré : 1 note
  - Moyen : 2 notes
  - Plein : 3+ notes
- **Aujourd'hui** est entouré d'un anneau coloré
- **Survol d'une case** : infobulle « lun. 5 mai · 2 entrées »
- Une **légende** en bas montre l'échelle des couleurs (« Moins » → « Plus »)
- L'écran scrolle automatiquement vers les semaines récentes au chargement

Les **étiquettes de mois** apparaissent au-dessus de la première semaine de chaque mois pour te repérer rapidement dans le temps.

### 📚 Répartition par type de note

Une barre par type (Journal, Livre, Film, Série…) avec :

- L'icône et le label du type
- Une **barre de progression colorée** proportionnelle à la part du type
- Le compte exact de notes

### 😊 Humeurs (Mood Cloud)

Tag cloud de tes emojis d'humeur. Plus tu utilises un emoji, plus il est gros. Survol pour voir le compte exact.

Empty state : « Aucune humeur enregistrée. » si tu n'as jamais ajouté de mood.

### 🏷️ Top Tags

Les 5 tags que tu utilises le plus, avec le compte. Empty state si tu n'as pas de tags.

## 🤝 Différences pour le Confidant

Le confidant voit les stats **agrégées sur les notes qu'il peut lire** (donc toutes, dans son cas). Les chiffres peuvent différer légèrement de ceux de l'Owner si certaines notes ont été créées et supprimées dans la même session.

## 💡 Astuces

- **Ne te focalise pas sur les streaks** s'ils te stressent. Le journal n'est pas un objectif sportif — la tolérance d'un jour est là justement pour ça.
- Le **heatmap est très utile** pour identifier des patterns : périodes d'écriture intense, vides en vacances, jours de la semaine où tu écris le plus.
- Si tu **utilises beaucoup de types** (Livre, Film, etc.), la répartition par type te montre clairement où tu mets le plus d'énergie.
- Le mood cloud est une **photographie émotionnelle** : revisite-le de temps en temps, c'est intéressant de voir comment ton humeur globale évolue.
