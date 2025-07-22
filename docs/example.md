---
title: Page Exemple
# author: GrCOTE7
Summary: Juste un exemple de page about
date: '2023-04-18'
draft: false
tags:
  - mon tag 1
  - mon tag 2
---

###### _Version actuelle : {{ config.plugins.pyodide_macros.version }}_

## Hanc per

Lorem markdownum fuerat tauros, patefecit tecum, atque iussit. Neci et data
totoque, ortu saxa annis radice vincat reppulit culpa, pulcherrimus nocte...

| First Header | Second Header | Third Header |
|:-------------|:-------------:|-------------:|
| Left         |    Center     |        Right |
| Content Cell | Content Cell  | Content Cell |

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

## mkdocs

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

## Regem erat quoque

Lorem markdownum fuerat tauros, patefecit tecum, atque iussit. Neci et data totoque, ortu saxa annis radice vincat reppulit culpa, pulcherrimus nocte...

<!-- commentaire -->

{{ IDE('sympy/scripts/exo.py', ID=1) }}

:boom:
