---
description: Repository Information Overview
alwaysApply: true
---

# PyMoX Documentation Information

## Summary
Documentation pour PyMoX-fr, un projet de documentation en français utilisant MkDocs avec un thème personnalisé basé sur Material et Pyodide.

## Structure
- **docs/**: Contenu principal de la documentation
- **includes/overrides/**: Personnalisations du thème MkDocs
- **docs/xtra/**: Ressources supplémentaires (CSS, JavaScript, macros)

## Language & Runtime
**Language**: Markdown, HTML, CSS, JavaScript, Python
**Framework**: MkDocs avec thème personnalisé pyodide-mkdocs-theme
**Configuration**: mkdocs.yml

## Customizations
**CSS**: 
- docs/xtra/stylesheets/essais.css
- docs/xtra/stylesheets/ajustements.css

**JavaScript**:
- docs/xtra/javascripts/removeTrashBtn.js
- docs/xtra/javascripts/copy.js

## Admonition Blocks
Le site utilise des blocs d'avertissement (admonition) personnalisés, notamment un bloc "unreleased-block".

## Solution à votre problème CSS

Le problème avec votre bloc "unreleased-block" en français vient de la façon dont vous définissez l'ID. Dans votre CSS, vous ciblez un élément avec l'ID `#unreleased-block`, mais dans votre markdown, vous utilisez une syntaxe différente.

### Problème actuel
```markdown
!!! unreleased-block "Unreleased-block"
    Ceci est une note informative.
{#: unreleased-block}
```

Le `{#: unreleased-block}` ne fonctionne pas comme prévu car il n'applique pas correctement l'ID à l'élément HTML généré.

### Solutions possibles

1. **Modifier votre markdown** pour utiliser l'attribut ID directement dans le bloc admonition:

```markdown
!!! unreleased-block "Unreleased-block" {: #unreleased-block }
    Ceci est une note informative.
```

2. **Utiliser la syntaxe des blocs détaillés** qui permet d'ajouter des attributs:

```markdown
/// details | Unreleased-block
    type: warning
    open: true
    attrs: {id: 'unreleased-block'}
Ceci est une note informative.
///
```

3. **Modifier votre CSS** pour cibler la classe plutôt que l'ID:

```css
.md-typeset .unreleased-block>summary:after {
  background-color: var(--unreleased-color)
}

.md-typeset .unreleased-block>summary:before {
  background-color: var(--unreleased-color);
}

.md-typeset details.unreleased-block>summary {
  background-color: var(--unreleased-color-fd)
}

.md-typeset details.unreleased-block {
  border-color: var(--unreleased-color)
}
```

La solution 1 ou 2 est recommandée car elle maintient votre CSS actuel intact.
