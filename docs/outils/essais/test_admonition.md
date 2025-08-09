# Test des admonitions avec classes

## Option 1: Utiliser la syntaxe des attributs après le bloc

!!! warning "Unreleased-block"
    Ceci est une note informative.
{: .unreleased-block}

## Option 2: Utiliser la syntaxe des blocs détaillés (qui fonctionne déjà)

/// details | Unreleased-block
    type: warning
    open: true
    attrs: {class: 'unreleased-block'}
Ceci est un bloc pour les releases.
///

## Option 3: Définir un type personnalisé dans mkdocs.yml

!!! unreleased-block "Unreleased-block"
    Ceci est une note informative avec type personnalisé.

## Option 4: Utiliser la syntaxe attr_list inline

!!! warning "Unreleased-block" class="unreleased-block"
    Ceci est une note informative avec attr_list inline.
