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

Le problème avec votre bloc "unreleased-block" en français vient de la façon dont vous essayez d'appliquer la classe CSS à votre bloc admonition.

### Problème actuel
```markdown
!!! warning "Unreleased-block" {class = 'unreleased-block' }
    Ceci est une note informative.
```

Cette syntaxe ne fonctionne pas correctement avec les admonitions de MkDocs.

### Solutions qui fonctionnent

1. **Utiliser la syntaxe des blocs détaillés** (solution recommandée) :

```markdown
/// details | Unreleased-block
    type: warning
    open: true
    attrs: {class: 'unreleased-block'}
Ceci est une note informative.
///
```

Cette solution fonctionne déjà dans votre code et est la plus propre.

2. **Définir un type personnalisé d'admonition** dans votre CSS :

```markdown
!!! unreleased-block "Unreleased-block"
    Ceci est une note informative.
```

Avec le CSS correspondant qui cible directement ce type :

```css
.md-typeset .unreleased-block>summary:after {
  background-color: var(--unreleased-color)
}

.md-typeset .unreleased-block>summary:before {
  background-color: var(--unreleased-color);
}
```

3. **Utiliser la syntaxe des attributs après le bloc** :

```markdown
!!! warning "Unreleased-block"
    Ceci est une note informative.
{: .unreleased-block}
```

Cette syntaxe applique la classe `.unreleased-block` à l'élément parent du bloc admonition.

### Pour les icônes différentes selon l'état ouvert/fermé

Vous avez déjà implémenté cette fonctionnalité avec :

```css
details.unreleased-block[open] summary::before {
  content: "🟡";
}

details.unreleased-block:not([open]) summary::before {
  content: "⚪";
}
```

Cette partie fonctionne correctement avec la solution des blocs détaillés (option 1).
