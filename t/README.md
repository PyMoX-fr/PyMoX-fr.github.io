# Doc divers

## reset projet GH



```bash
// Reset / Écrase main actuelle

rm -rf .git
git init
git add .
git commit -m "Re ini"

git remote add origin https://github.com/PyMoX-fr/PyMoX-fr.github.io.git

git branch -M main  # ou master, selon convention

git push -f origin main

Créée une br sur un sha (et checkout)
git switch -c feature-old 3a5b9c2

enregistre fct pour del br local & distante
git config --global alias.delbr '!f() { git branch -D "$1" && git push origin --delete "$1"; }; f'

git delbr uuu
```
---

* [ ] Accepter autre mots pour semantic-release: up, chore, docs, etc...
