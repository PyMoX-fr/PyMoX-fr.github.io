#!/bin/bash

# Définir le dépôt GitHub (format: utilisateur/nom-du-dépôt)
REPO="pymox-fr/PyMoX-fr.github.io"

# Nombre maximum de runs à lister (ajuste si nécessaire)
LIMIT=999

# Vérifie si gh est bien connecté
if ! gh auth status > /dev/null 2>&1; then
  echo "❌ Tu n'es pas connecté à GitHub CLI. Lance 'gh auth login' d'abord."
  exit 1
fi

# Liste et supprime les runs
echo "🔍 Récupération des $LIMIT (max) derniers workflow runs pour $REPO..."
gh run list -R "$REPO" --limit "$LIMIT" --json databaseId --jq '.[].databaseId' | while read -r run_id; do
  echo "🗑️ Suppression du run $run_id..."
  yes | gh run delete "$run_id" -R "$REPO"
done

echo "✅ Tous les logs des workflow runs ont été supprimés."

# En CLI: gh auth status
# Sous linux: chmod +x delete-workflows.sh
# gh run list -R "$REPO" --workflow build.yml --limit "$LIMIT" # Pour limiter la liste aux workflows spécifiques.
