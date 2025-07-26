---
title: Avenir
# author: GrCOTE7
Summary: Roadmap de développement du projet PyMoX
date: '2025-07-25'
draft: false
tags:
  - mon tag 1
---

## _Version actuelle : {{ config.plugins.pyodide_macros.version }}_

* {{ config.repo_url }}

!!! danger inline end w40 margin-top-h4

    Considérez bien que tout ceci est en construction...

## Priorités (RoadMap)

* [x] Réservation Nom de Domaine **PyMoX.fr**
* [x] Mise en place des dépôts GitHub de **PyMoX**
* [x] Mise en place du canal Discord de **PyMoX**
* [ ] Mise en place de l'App de **PyMoX** - v 0.0.1
* [ ] Mise en place du site web [**PyMoX.fr**](http://www.PyMoX.fr)- v 0.0.1
* [ ] Mettre en place ce genre de test
<!-- IDE('exemple/exo', EXPORT=1) -->
{{ IDE('chapitre_plusieurs_pages/exemple/exo') }}

## Structure des dossiers et fichiers de base

Cette commande, exécutée dans un terminal, crée un nouveau dossier nommé `PROJECT_NAME` dans le répertoire en cours, et y ajoute les fichiers de base pour démarrer un projet avec le thème :

!!! quote inline end w30 "Fichiers & dossiers créés"

    ```
    ...
    └── PROJECT_NAME
        ├── docs
        │   ├── index.md
        │   └── exo.py
        ├── .gitignore
        ├── main.py
        ├── mkdocs.yml
        └── requirements.txt
    ```

* `mkdocs.yml`, avec une configuration minimale nécessaire pour le thème. Ne pas oublier d'y modifier ensuite les champs `site_name` et `site_url`.
* `requirements.txt`, qui contient toutes les dépendances du projet.
* `.gitignore`, avec des réglages génériques pour un projet de documentation avec python.
* `main.py`, avec la logistique pour modifier certains messages du thème en place. Ce fichier est optionnel et peut être supprimé ou modifié (ajout de macros personnalisées).
* `docs/index.md` et `docs/exo.py`, qui donnent des exemples d'utilisation des macros du thème.
