#!/bin/bash

DEPLOY_INFO_DIR="docs/outils/logs"
DEPLOY_INFO_FILE="deploy-info.md"
DEPLOY_INFO_PATH="$DEPLOY_INFO_DIR/$DEPLOY_INFO_FILE"

mkdir -p "$DEPLOY_INFO_DIR"

DATE_HUMAN="$(TZ='Europe/Paris' date '+%d/%m/%Y')"
TIME_HUMAN="$(TZ='Europe/Paris' date '+%H:%M:%S')"
DATE_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DATE_UNIX="$(date +%s)"
MSG="$(git log -1 --pretty=%B)"
AUTOR="$(git log -1 --pretty=%an)"
# SHA="${{ github.sha }}"

echo "# 🚀 Dernier déploiement (Suite à push manuel)" > "$DEPLOY_INFO_PATH"
echo "" >> "$DEPLOY_INFO_PATH"

echo "| 📅 Date        | 🕰️ Heure (Paris)       | 🌐 ISO 8601 UTC         | 🔢 Timestamp UNIX |" >> "$DEPLOY_INFO_PATH"
echo "|----------------|------------------------|------------------------|--------------------|" >> "$DEPLOY_INFO_PATH"
echo "| **$DATE_HUMAN**  | **$TIME_HUMAN**        | \`$DATE_ISO\`   | \`$DATE_UNIX\`       |" >> "$DEPLOY_INFO_PATH"
echo "" >> "$DEPLOY_INFO_PATH"

echo "### 📋 Informations de déploiement" >> "$DEPLOY_INFO_PATH"
echo "" >> "$DEPLOY_INFO_PATH"
echo "📝 Message Git : **${MSG}**<br>" >> "$DEPLOY_INFO_PATH"
echo "👤 Auteur : ${AUTOR}<br>" >> "$DEPLOY_INFO_PATH"
echo "🔁 SHA Commit : \`${SHA}\`<br>" >> "$DEPLOY_INFO_PATH"
echo "🚀 **Déclencheur** : Push manuel sur la branche \`main\`" >> "$DEPLOY_INFO_PATH"
echo "" >> "$DEPLOY_INFO_PATH"

echo "> ✅ Ce déploiement a été lancé automatiquement suite au push manuel sur \`main\`, sans commit permanent du fichier deploy-info.md dans l'historique Git." >> "$DEPLOY_INFO_PATH"
