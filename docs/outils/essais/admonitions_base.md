[Retour Sommaire](sommaire.md)

# Admonitions

???+ abstract "~ Simples"

    !!! note "Note"
        Ceci est une note informative.
        
    !!! unreleased-block "Unreleased-block"
        Ceci est une note informative.
    {#: unreleased-block}
    
    !!! info "Info"
        Voici une information utile.
    
    !!! tip "Astuce (tip)"
        Une astuce pour t’aider à aller plus vite.
    
    !!! warning "Avertissement (warning)"
        Attention à ce comportement inattendu.
    
    !!! success "Succès"
        L’opération s’est déroulée avec succès.
    
    !!! question "Question"
        As-tu pensé à vérifier les dépendances ?
    
    !!! abstract "Résumé (abstract)"
        Ce document explique les bases de MkDocs.
    
    !!! example "Exemple (example)"
        Voici un exemple de configuration.
    
    !!! bug "Bug"
        Ce comportement est un bug connu.
    
    !!! quote "Citation (quote)"
        > “Le code est comme l’humour. Quand tu dois l’expliquer, il n’est pas bon.”
    
    !!! failure "Échec (failure)"
        La compilation a échoué.
    
    !!! error "Erreur (error)"
        Une erreur s’est produite lors du rendu.

    !!! danger "Danger"
        Cela peut provoquer une erreur critique.
    
    !!! danger "Sécurité (danger)"
        Ne jamais exposer tes clés API en clair.

---

??? abstract "~ Dépliables"

    ??? note "Note dépliable"
        Ce bloc peut être ouvert pour lire plus d’infos.

    ??? info "Info dépliable"
        Détails supplémentaires sur l’info.

    ??? tip "Astuce dépliable"
        Astuce avancée pour les utilisateurs expérimentés.

    ??? warning "Avertissement dépliable"
        Risques potentiels à surveiller.

    ??? success "Succès dépliable"
        Bravo ! Tu as réussi cette étape.

    ??? question "Question dépliable"
        Pourquoi utiliser MkDocs plutôt que Sphinx ?

    ??? abstract "Résumé dépliable"
        Aperçu du contenu de cette section.

    ??? example "Exemple dépliable"
        Exemple de fichier `mkdocs.yml`.

    ??? bug "Bug dépliable"
        Ce bug survient sous certaines conditions.

    ??? quote "Citation dépliable"
        > “La simplicité est la sophistication suprême.” — Léonard de Vinci

    ??? failure "Échec dépliable"
        Le test n’a pas passé la validation.

    ??? error "Erreur dépliable"
        Stack trace de l’erreur rencontrée.

    ??? danger "Danger dépliable"
        Ne pas exécuter ce script en production.

    ??? danger "Sécurité dépliable"
        Ce bloc contient des informations sensibles.

---

??? abstract "~ Dépliables ouvertes"

    ???+ note "Note ouverte"
        Toujours visible sans clic.

    ???+ info "Info ouverte"
        Informations importantes à lire.

    ???+ tip "Astuce ouverte"
        Utilise `mkdocs serve` pour un aperçu local.

    ???+ warning "Avertissement ouvert"
        Ne modifie pas ce fichier sans sauvegarde.

    ???+ success "Succès ouvert"
        Le déploiement est terminé.

    ???+ question "Question ouverte"
        Quelle extension utiliser pour les onglets ?

    ???+ abstract "Résumé ouvert"
        Introduction à la documentation technique.

    ???+ example "Exemple ouvert"
        Exemple de structure de dossier :

        ```
        docs/
          index.md
          guide.md
        ```

    ???+ bug "Bug ouvert"
        Le bouton ne répond pas sur mobile.

    ???+ quote "Citation ouverte"
        > “Documentation is a love letter to your future self.”

    ???+ failure "Échec ouvert"
        Le processus a échoué à l’étape 3.

    ???+ error "Erreur ouverte"
        Erreur 404 : page non trouvée.

    ???+ danger "Danger ouvert"
        Ce script supprime des fichiers.

    ???+ danger "Sécurité ouverte"
        Ne jamais exposer tes identifiants dans le code source.

---

??? abstract "~ Blocs personnalisés (details via ///)"

    /// details | Bloc Info
        type: info
        open: true

    Ce bloc est un `<details>` stylisé avec le type `info`.
    ///

    /// details | Bloc Avertissement
        type: warning
        open: false

    Ce bloc est replié par défaut et affiche un avertissement.
    ///

    /// details | Bloc Danger
        type: danger
        open: true

    Attention : ce bloc signale un danger potentiel.
    ///

    /// details | Bloc Citation
        type: quote
        open: true

    > “Un bon code est comme une bonne blague : il n’a pas besoin d’explication.”
    ///

    /// details | Bloc Exemple
        type: example
        open: false

    ```yaml
    site_name: "Ma Documentation"
    theme:
      name: "material"
    ```
    ///

---

??? abstract "~ Onglets (via ===)"

    === "Python"
        ```python
        def hello():
            print("Bonjour MkDocs!")
        ```

    === "JavaScript"
        ```js
        function hello() {
            console.log("Bonjour MkDocs!");
        }
        ```

    === "Bash"
        ```bash
        echo "Bonjour MkDocs!"
        ```

---

???+ abstract "~ Tableau récapitulatif des types disponibles"

    | Type       | Icône / Couleur | Utilisation recommandée                  |
    |------------|-----------------|------------------------------------------|
    | `note`     | 🟦 Bleu clair   | Infos générales ou rappels               |
    | `info`     | 🔵 Bleu         | Informations techniques ou contextuelles |
    | `tip`      | 🟢 Vert clair   | Astuces, bonnes pratiques                |
    | `success`  | ✅ Vert          | Confirmation de réussite                 |
    | `question` | ❓ Bleu-gris     | Questions ou réflexions                  |
    | `warning`  | 🟠 Orange       | Mise en garde, attention                 |
    | `danger`   | 🔴 Rouge        | Risques critiques, sécurité              |
    | `error`    | ❌ Rouge foncé   | Erreurs techniques                       |
    | `failure`  | ⚠️ Rouge foncé  | Échecs de processus                      |
    | `bug`      | 🐞 Rouge        | Signalement de bug                       |
    | `example`  | 📎 Gris         | Exemples de code ou configuration        |
    | `abstract` | 📘 Bleu pâle    | Résumés ou aperçus                       |
    | `quote`    | 💬 Gris clair   | Citations inspirantes ou techniques      |
