??? warning "Pour les versions de `pyodide-mkdocs-theme` antérieures à la `v2.2.0`"

    !!! note "Gestion des plugins de mkdocs-material"

        Pour les versions strictement antérieures à la `2.2.0`, les plugins issus de [mkdocs-material][mkdocs-material]{: target=_blank } devaient être préfixés en leur ajoutant `material/` lors de leur enregistrement dans `mkdocs.yml:plugins` :

                material/blog
                material/group
                material/info
                material/offline
                material/privacy
                material/search
                material/social
                material/tags


        À partir de la version `2.2.0`, c'est l'inverse : ces plugins doivent maintenant être enregistrés sans préfixes ou ils ne fonctionneront plus correctement.

    <br>

    !!! note "Si la notion de dossier `partials` vous parle, vous pourriez être également concernés par ceci :"

        À partir de la même version, PMT utilise 2 nouvelles surcharges de fichiers de material, dans `custom_dir/partials`: `content.html` et `header.html`.
        <br>Voici pour rappel la liste complète des fichiers surchargés :

        {{ partials_overrides_as_list() }}

        Si vous avez surchargé l'un de ces fichiers, il vous faudra aller récupérer [les versions utilisées dans PMT][pmt-partials]{: target=_blank } pour y inclure vos modifications.
