#!/usr/bin/env bash
# deploy.sh — Backup prod DB puis déploie sur Railway
# Usage : ./scripts/deploy.sh [--no-backup|--skip-backup]
#   --no-backup, --skip-backup : déploie sans faire de backup de la DB

set -euo pipefail

SKIP_BACKUP=false
for arg in "$@"; do
  case "$arg" in
    --no-backup|--skip-backup)
      SKIP_BACKUP=true
      ;;
    -h|--help)
      sed -n '2,4p' "$0"
      exit 0
      ;;
  esac
done

BACKUP_DIR="$HOME/diary-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M")
BACKUP_FILE="$BACKUP_DIR/pre_deploy_${TIMESTAMP}.dump.enc"
PASSPHRASE_FILE="$HOME/.carnet-backup-passphrase"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_ROOT"

# ── 0. Vérifier / créer la passphrase de chiffrement ─────────────────────────
if [ "$SKIP_BACKUP" = false ] && [ ! -f "$PASSPHRASE_FILE" ]; then
  echo "⚠️  Aucune passphrase de backup trouvée."
  echo ""
  echo "   ┌─────────────────────────────────────────────────────────────────┐"
  echo "   │  IMPORTANT : une passphrase va être générée et stockée dans     │"
  echo "   │  $PASSPHRASE_FILE                                  │"
  echo "   │                                                                 │"
  echo "   │  🖨  IMPRIME CE FICHIER ET GARDE-LE EN LIEU SÛR.               │"
  echo "   │  Sans elle, tes backups chiffrés seront IRRÉCUPÉRABLES.        │"
  echo "   └─────────────────────────────────────────────────────────────────┘"
  echo ""
  # Génère une passphrase aléatoire de 32 caractères
  openssl rand -base64 32 > "$PASSPHRASE_FILE"
  chmod 600 "$PASSPHRASE_FILE"
  echo "✅ Passphrase créée : $PASSPHRASE_FILE"
  echo "   👉 Contenu à imprimer :"
  echo ""
  cat "$PASSPHRASE_FILE"
  echo ""
  read -r -p "   As-tu noté / imprimé la passphrase ? [o/N] " NOTED
  if [[ ! "$NOTED" =~ ^[oO]$ ]]; then
    echo "❌ Backup annulé — note la passphrase avant de continuer."
    exit 1
  fi
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Journal Cozy — Deploy            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 0.5. Vérif cohérence schema.prisma ↔ migrations ──────────────────────────
# Empêche de pousser un déploiement où `schema.prisma` a été modifié sans
# générer la migration correspondante (cas typique : on ajoute un champ et on
# oublie `pnpm db:migrate` → la prod plante en boucle sur "column does not
# exist" sans qu'on s'en rende compte avant que les utilisateurs crient).
#
# Méthode : Prisma `migrate diff --from-migrations --to-schema-datamodel`
# nécessite une shadow database. On en spinne une temporaire dans Docker.
echo "🔍 Vérification cohérence schema ↔ migrations..."
SHADOW_CONTAINER="carnet-shadow-$$"
if ! command -v docker >/dev/null 2>&1; then
  echo "⚠️  Docker introuvable — drift check ignoré (pas idéal)."
else
  # Nettoie une shadow DB restée d'un run précédent interrompu : sinon le port
  # 54329 est encore occupé et `docker run` échoue → on doit relancer plusieurs fois.
  docker rm -f $(docker ps -aq --filter "name=carnet-shadow-") >/dev/null 2>&1 || true
  if docker run -d --rm --name "$SHADOW_CONTAINER" \
       -e POSTGRES_PASSWORD=shadow -e POSTGRES_DB=shadow \
       -p 54329:5432 postgres:18-alpine >/dev/null 2>&1; then
    # Filet : stoppe la shadow DB quoi qu'il arrive (Ctrl+C, exit anticipé…).
    trap '[ -n "${SHADOW_CONTAINER:-}" ] && docker rm -f "$SHADOW_CONTAINER" >/dev/null 2>&1 || true' EXIT
  else
    echo "⚠️  Impossible de lancer la shadow DB — drift check ignoré."
    SHADOW_CONTAINER=""
  fi
  if [ -n "$SHADOW_CONTAINER" ]; then
    # Attendre que Postgres accepte les connexions EN TCP. ⚠️ L'image officielle
    # postgres démarre d'abord un serveur temporaire sur SOCKET pendant l'init,
    # puis le REDÉMARRE en TCP : un `pg_isready` sur le socket répond donc « prêt »
    # alors que le port TCP 54329 refuse encore les connexions → Prisma plante en
    # P1001. On sonde le TCP (-h 127.0.0.1) pour attendre le vrai serveur.
    READY=false
    _tries=0
    while [ "$_tries" -lt 30 ]; do
      if docker exec "$SHADOW_CONTAINER" pg_isready -h 127.0.0.1 -p 5432 -U postgres -q 2>/dev/null; then
        READY=true; break
      fi
      sleep 1; _tries=$((_tries + 1))
    done
    if [ "$READY" = false ]; then
      echo "⚠️  Shadow DB pas prête — drift check ignoré."
      docker rm -f "$SHADOW_CONTAINER" >/dev/null 2>&1 || true
    else
      # Filet de sécurité : course résiduelle au tout premier essai → on retente
      # tant que l'erreur est une connexion impossible (P1001).
      DIFF_EXIT=0
      DIFF_OUTPUT=""
      for _ in 1 2 3 4 5; do
        DIFF_OUTPUT=$(
          cd apps/api && pnpm --silent exec prisma migrate diff \
            --from-migrations ./prisma/migrations \
            --to-schema-datamodel ./prisma/schema.prisma \
            --shadow-database-url "postgresql://postgres:shadow@localhost:54329/shadow" \
            --exit-code 2>&1
        ) && DIFF_EXIT=0 || DIFF_EXIT=$?
        if [ "$DIFF_EXIT" -ne 0 ] && printf '%s' "$DIFF_OUTPUT" | grep -q "P1001"; then
          sleep 2; continue
        fi
        break
      done
      docker rm -f "$SHADOW_CONTAINER" >/dev/null 2>&1 || true

      if [ "$DIFF_EXIT" -eq 2 ]; then
        echo "❌ DRIFT détecté : schema.prisma contient des changements sans migration."
        echo ""
        echo "$DIFF_OUTPUT" | sed 's/^/   /'
        echo ""
        echo "   ⤷ Lance : pnpm --filter @carnet/api db:migrate"
        echo "     puis commit la nouvelle migration et relance ce script."
        exit 1
      elif [ "$DIFF_EXIT" -ne 0 ]; then
        echo "⚠️  Drift check a échoué (exit $DIFF_EXIT) — vérifie manuellement avant de continuer."
        echo "$DIFF_OUTPUT" | sed 's/^/   /'
        read -r -p "   Continuer quand même ? [o/N] " FORCE
        if [[ ! "$FORCE" =~ ^[oO]$ ]]; then
          exit 1
        fi
      else
        echo "✅ Schema ↔ migrations cohérents."
        echo ""
      fi
    fi
  fi
fi

if [ "$SKIP_BACKUP" = true ]; then
  echo "⏭  Backup ignoré (--no-backup)"
  echo ""
else
  # ── 1. Récupérer DATABASE_PUBLIC_URL depuis Railway ──────────────────────────
  echo "⏳ Récupération de la DATABASE_PUBLIC_URL..."
  DB_URL=$(railway variables --service Postgres 2>/dev/null \
    | awk '/DATABASE_PUBLIC_URL/,/─────/' \
    | grep "│" \
    | sed 's/.*│//' \
    | tr -d ' ║\n')

  if [ -z "$DB_URL" ]; then
    echo "❌ Impossible de récupérer DATABASE_PUBLIC_URL depuis Railway."
    echo "   Vérifie que tu es connecté : railway login"
    exit 1
  fi

  echo "✅ URL obtenue (${DB_URL:0:40}...)"
  echo ""

  # ── 2. Backup chiffré via Docker (pg_dump | openssl enc) ─────────────────────
  echo "💾 Backup chiffré de la base de données → $BACKUP_FILE"
  docker run --rm \
    -e PGPASSWORD="$(echo "$DB_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')" \
    postgres:18-alpine \
    pg_dump "$DB_URL" --no-owner --no-acl -Fc \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
        -pass file:"$PASSPHRASE_FILE" \
        -out "$BACKUP_FILE"

  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup chiffré créé : $BACKUP_FILE ($SIZE)"
  echo "   Pour déchiffrer : openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass file:$PASSPHRASE_FILE -in $BACKUP_FILE | pg_restore ..."
  echo ""
fi

# ── 3. Confirmation avant déploiement ────────────────────────────────────────
echo "🚀 Prêt à déployer sur Railway (production)."
if [ "$SKIP_BACKUP" = true ]; then
  echo "   ⚠️  Aucun backup n'a été effectué."
fi
read -r -p "   Confirmer le déploiement ? [o/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[oO]$ ]]; then
  if [ "$SKIP_BACKUP" = true ]; then
    echo "❌ Déploiement annulé."
  else
    echo "❌ Déploiement annulé. Le backup est conservé."
  fi
  exit 0
fi

echo ""
echo "🔨 Build local..."
pnpm --filter @carnet/api build

echo ""
echo "📦 Déploiement en cours..."
railway up --detach

echo ""
echo "✅ Déploiement lancé. Surveille : railway logs"
if [ "$SKIP_BACKUP" = false ]; then
  echo "   Backup disponible dans : $BACKUP_DIR"
fi
