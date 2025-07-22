---
title: Notice Mkdocs
# author: GrCOTE7
Summary: Rapide notice de mkdocs
date: '2025-07-23'
draft: false
tags:
  - mon tag 1
---

## _Version actuelle : {{ config.plugins.pyodide_macros.version }}_

## Code

```python
def hello_world():
    print("Hello World!")
```

```bash
echo "Hello world!"
```

```text
Fenced code blocks are like Standard
Markdown’s regular code blocks, except that
they’re not indented and instead rely on
start and end fence lines to delimit the
code block.
```

## Table

| First Header | Second Header | Third Header |
|:-------------|:-------------:|-------------:|
| Left         |    Center     |        Right |
| Content Cell | Content Cell  | Content Cell |


## Install mkdocs

!!! info "Informations: Pour installer le thème"

```bash
pip install pyodide-mkdocs-theme
OU
python -m pyodide_mkdocs_theme --new PROJECT_NAME

Affiche le mkdocs.yml par défaut dans la console

```bash
python -m pyodide_mkdocs_theme --yml
```

??? danger "Attention: Que pour créer le mkdocs.yml, car écrase l'ancien"

    Ce code écrase me mkdocs et fait un fichier yml par defaut pour le theme.

    ```bash
    python -m pyodide_mkdocs_theme --yml --file "mkdocs_.yml"
    ```
    
    ```bash
    mkdocs serve --dev-addr=127.0.0.1:8002
    ```

## Regem erat quoque

Lorem markdownum fuerat tauros, patefecit tecum, atque iussit. Neci et data totoque, ortu saxa annis radice vincat reppulit culpa, pulcherrimus nocte...

<!-- commentaire -->

{{ IDE('sympy/scripts/exo.py', ID=10) }}

:boom:
