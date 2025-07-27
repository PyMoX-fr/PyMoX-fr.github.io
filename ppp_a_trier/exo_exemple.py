# --- PYODIDE:ignore --- #
"""
Les sections `ignore` sont... ignorées. Vous pouvez les utiliser pour laisser
des commentaires dans vos fichiers, ou y archiver du code python qui ne sera
pas utilisé pour le site construit.
---------------------------------------------------------------------------

La section `env` (ci-dessous) est exécutée avant le code utilisateur.
Son contenu n'est pas visible de l'utilisateur mais tout ce qui y est défini
est ensuite disponible dans l'environnement.
Si le code de la section ENV lève une erreur, rien d'autre ne sera exécuté.
"""
# --- PYODIDE:env --- #


class Stack:
    """(Interface à décrire dans l'énoncé)"""

    def __init__(self):
        self.__stk = []

    def push(self, v):
        self.__stk.append(v)

    def pop(self):
        return self.__stk.pop()

    def is_empty(self):
        return not self.__stk


# --- PYODIDE:ignore --- #
"""
La section `code` est l'état initial du code fourni à l'utilisateur dans
l'éditeur, à l'exclusion des tests publics (voir section `tests`).
"""
# --- PYODIDE:code --- #


def est_pair(n): ...


# --- PYODIDE:ignore --- #
"""
La section `corr` contient le code qui sera affiché dans la correction, sous l'IDE.
"""
# --- PYODIDE:corr --- #


def est_pair(n):
    return not n % 2


# --- PYODIDE:ignore --- #
"""
La section `tests` contient les tests publics qui seront affichés sous le code
utilisateur, dans l'éditeur.
"""
# --- PYODIDE:tests --- #

assert est_pair(3) is False
assert est_pair(24) is True


# --- PYODIDE:ignore --- #
"""
La section `secrets` contient les tests secrets pour les validations. Ces tests ne sont
pas visibles par l'utilisateur.

ATTENTION :
    Il est impératif d'utiliser des messages dans les assertions des tests secrets,
    sinon l'utilisateur ne peut pas déboguer son code car `print` est désactivé
    durant ces tests ! (sauf si... => Voir les options de configuration)
    À vous de choisir le niveau d'information que vous voulez fournir dans le message.

Par ailleurs, il est conseillé d'utiliser une fonction pour éviter que des variables
des tests ne se retrouvent dans l'environnement global.
"""
# --- PYODIDE:secrets --- #


def tests():
    for n in range(100):
        val = est_pair(n)
        exp = n % 2 == 0

        msg = f"est_pair({n})"  # Minimum vital
        msg = f"est_pair({n}): valeur renvoyée {val}"  # Conseillé
        msg = f"est_pair({n}): {val} devrait être {exp}"  # La totale

        assert val == exp, msg


tests()  # Ne pas oublier d'appeler la fonction de tests... ! x)
del tests  # Si vous ne voulez pas laisser de traces...


# --- PYODIDE:post --- #
# La section post contient du code de "nettoyage", à appliquer systématiquement
# après que le code et les tests aient été lancés.
# Ce contenu est exécuté même si une erreur a été levée précédemment, SAUF si
# cette erreur provient de la section ENV.
