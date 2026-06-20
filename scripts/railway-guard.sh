#!/usr/bin/env bash
# railway-guard.sh — Empêche le fork de déployer sur la prod de l'app D'ORIGINE.
#
# Railway déploie sur le projet LIÉ au dossier courant (cf. ~/.railway/config.json,
# clé = chemin absolu). Comme ce dépôt est un fork copié depuis l'app d'origine,
# il ne doit JAMAIS cibler le projet Railway de l'original. Ce garde-fou refuse
# tout déploiement si le dossier est lié à ce projet.
#
# Le fork doit être lié à SON PROPRE projet :  railway link  → choisir le projet du fork.
set -euo pipefail

# Projet Railway de l'app d'origine (à NE JAMAIS cibler depuis le fork).
ORIGIN_PROJECT_ID="3205368e-ead8-49f5-ae6d-a36829b9c92d"
ORIGIN_PROJECT_NAME="resilient-adventure"

STATUS="$(railway status 2>/dev/null || true)"
STATUS_JSON="$(railway status --json 2>/dev/null || true)"

if printf '%s\n%s' "$STATUS" "$STATUS_JSON" | grep -qiE "${ORIGIN_PROJECT_ID}|${ORIGIN_PROJECT_NAME}"; then
  echo "❌ STOP : ce dossier est lié au projet Railway de l'app D'ORIGINE (${ORIGIN_PROJECT_NAME})."
  echo "   Le fork ne doit JAMAIS déployer sur cette prod."
  echo ""
  echo "   ⤷ Corrige le lien :  railway link   →  choisis le projet DU FORK"
  echo "                        (surtout pas '${ORIGIN_PROJECT_NAME}')."
  exit 1
fi

if [ -z "$STATUS" ] && [ -z "$STATUS_JSON" ]; then
  echo "⚠️  Aucun projet Railway lié à ce dossier."
  echo "   ⤷ Lance d'abord :  railway link   →  choisis le projet DU FORK."
  exit 1
fi

echo "✅ Cible Railway OK (projet ≠ ${ORIGIN_PROJECT_NAME})."
