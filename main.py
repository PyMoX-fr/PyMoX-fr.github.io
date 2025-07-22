
from pyodide_mkdocs_theme.pyodide_macros import (
    PyodideMacrosPlugin,
    Msg, MsgPlural, TestsToken, Tip,
)


def define_env(env:PyodideMacrosPlugin):
    """ The customization has to be done at macro definition time.
        You could paste the code inside this function into your own main.py (or the
        equivalent package if you use a package instead of a single file). If you don't
        use personal macros so far, copy the full code into a `main.py` file at the root
        of your project (note: NOT in the docs_dir!).

        NOTE: you can also completely remove this file if you don't want to use personal
              macros or customize the messages in the built documentation.

        * Change whatever string you want.
        * Remove the entries you don't want to modify
        * Do not change the keyboard shortcuts for the Tip objects: the values are for
          informational purpose only.
        * See the documentation for more details about which string is used for what
          purpose, and any constraints on the arguments:
          https://frederic-zinelli.gitlab.io/pyodide-mkdocs-theme/custom/messages/#messages-details

        ---

        The signatures for the various objects defined below are the following:

        ```python
        Msg(msg:str)

        MsgPlural(msg:str, plural:str="")

        Tip(width_in_em:int, msg:str, kbd:str=None)

        TestsToken(token_str:str)
        ```
    """

    env.lang.overload({

    # Editors:
        "tests":      TestsToken("\n# Tests\n"),
        "comments":   Tip(17, "(Dés-)Active le code après la ligne <code>{tests}</code> "
                             "(insensible à la casse)", "Ctrl+I"),
        "split_screen": Tip(23, 'Entrer ou sortir du mode "deux colonnes"<br>(<kbd>Alt+:</kbd> '
                               '; <kbd>Ctrl</kbd> pour inverser les colonnes)'),
        "split_mode_placeholder": Msg("Éditeur dans l'autre colonne"),
        "full_screen": Tip(10, 'Entrer ou sortir du mode "plein écran"', "Esc"),


    # Terminals
        "feedback":      Tip(19, "Tronquer ou non le feedback dans les terminaux (sortie standard"
                                " & stacktrace / relancer le code pour appliquer)"),
        "wrap_term":     Tip(19, "Si activé, le texte copié dans le terminal est joint sur une "
                                "seule ligne avant d'être copié dans le presse-papier"),


    # Runtime feedback
        "run_script":    Msg("Script lancé...", format='info'),
        "install_start": Msg("Installation de paquets python. Ceci peut prendre un certain temps...", format='info'),
        "install_done":  Msg("Installations terminées !", format='info'),
        "refresh":       Msg("Une version plus récente du code existe.\nVeuillez copier vos "
                            "éventuelles modifications puis réinitialiser l'IDE.", format='warning'),


        "validation":    Msg("Validation - ", format='info'),
        "editor_code":   Msg("Éditeur", format='info'),
        "public_tests":  Msg("Tests publics", format='info'),
        "secret_tests":  Msg("Tests secrets", format='info'),
        "success_msg":   Msg("OK", format='success'),
        "success_msg_no_tests": Msg("Terminé sans erreur.", format='info'),
        "unforgettable": Msg("N'oubliez pas de faire une validation !", format='warning'),


    # Terminals: validation success/failure messages
        "success_head":  Msg("Bravo !", format='success'),
        "success_head_extra":  Msg("Vous avez réussi tous les tests !"),
        "success_tail":  Msg("Pensez à lire"),
        "fail_head":     Msg("Dommage !", format='warning'),
        "reveal_corr":   Msg("le corrigé"),
        "reveal_join":   Msg("et"),
        "reveal_rem":    Msg("les commentaires"),
        "fail_tail":     MsgPlural("est maintenant disponible", "sont maintenant disponibles"),


    # Corr / rems admonition:
        "title_corr":    Msg('Solution'),
        "title_rem":     Msg('Remarques'),
        "corr":          Msg('🐍 Proposition de correction'),
        "rem":           Msg('Remarques'),


    # Buttons, IDEs buttons & counter:
        "py_btn":        Tip(9, "Exécuter le code"),
        "play":          Tip(9, "Exécuter le code", "Ctrl+S"),
        "check":         Tip(9, "Valider<br><kbd>Ctrl</kbd>+<kbd>Enter</kbd><br>(Clic droit pour l'historique)"),
        "download":      Tip(0, "Télécharger"),
        "upload":        Tip(0, "Téléverser"),
        "restart":       Tip(0, "Réinitialiser l'éditeur"),
        "restart_confirm": Tip(0, "ATTENTION: réinitialiser l'éditeur fera perdre les anciens codes, status de validation et historiques."),
        "save":          Tip(0, "Sauvegarder dans le navigateur"),
        "zip":           Tip(14, "Archiver les codes des IDEs exportables de la page"),
        "corr_btn":      Tip(0, "Tester la correction (serve)"),
        "show":          Tip(0, "Afficher corr & REMs"),
        "attempts_left": Msg("Évaluations restantes"),


    # Testing
        "tests_done":    Msg("Tests terminés", 'info'),
        "test_ides":     Tip(7, "Lance tous les tests..."),
        "test_stop":     Tip(6, "Arrête les tests"),
        "test_1_ide":    Tip(7, "Lance ce test"),
        "load_ide":      Tip(10, "Configure l'IDE avec ces données"),



    # QCMS
        "qcm_title":     MsgPlural("Question"),
        "qcm_mask_tip":  Tip(11, "Les réponses resteront cachées..."),
        "qcm_check_tip": Tip(11, "Vérifier les réponses"),
        "qcm_redo_tip":  Tip(9,  "Recommencer"),


    # Others
        "tip_trash": Tip(15, "Supprimer du navigateur les codes enregistrés pour {site_name}"),


        "figure_admo_title": Msg("Votre figure"),
        "figure_text":       Msg("Votre tracé sera ici"),
        "p5_start":          Tip(0, "Démarre l'animation"),
        "p5_stop":           Tip(0, "Arrête l'animation"),
        "p5_step":           Tip(0, "Avance d'une image"),


        "picker_failure": Msg(
            "Veuillez cliquer sur la page entre deux utilisations des raccourcis clavier ou "
            "utiliser un bouton, afin de pouvoir téléverser un fichier."
        ),

        "zip_ask_for_names": Msg("Veuillez préciser votre/vos noms (chaîne vide interdite) :")
    })
