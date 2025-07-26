# Définir le chemin attendu
$expectedPath = "docs\assets\macros\oneCitation.py"

# Construire le chemin complet depuis le dossier actuel
$fullPath = Join-Path (Get-Location) $expectedPath

# Vérifier si le fichier existe
if (Test-Path $fullPath) {
    Write-Host "SUCCESS: Le fichier 'oneCitation.py' est bien situé à l'endroit attendu." -ForegroundColor Green
} else {
    Write-Host "ERREUR: Le fichier 'oneCitation.py' est introuvable dans 'docs/assets/macros/'." -ForegroundColor Red
    Write-Host "ASTUCE: Vérifie que tu l'as bien placé ici : $fullPath" -ForegroundColor Yellow
}
