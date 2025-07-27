#!/bin/bash

echo "🔄 Mise à jour des sous-modules vers les derniers commits distants..."
git submodule update --remote --merge
echo "✅ Tous les sous-modules sont à jour."
