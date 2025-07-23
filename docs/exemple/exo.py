# --- PYODIDE:env --- #
fail = True


# --- PYODIDE:code --- #
def est_pair(n):
    # Écrire ci-dessous ce que doit retourner la fonction
    ...


# --- PYODIDE:corr --- #
def est_pair(n):
    return not n % 2


fail = False  # Recharger la page et coller ce code dans l'éditeur pour voir
# ce qu'il se passe quand les tests passent avec succès...


# --- PYODIDE:tests --- #

# Les tests publics sont lancés via le bouton "play"
# (et les tests secrets, avec le bouton de validation) :
print("tests publics: ")

val = est_pair(2)
assert (
    val is True
), f"""est_pair(2): {bool(val)} devrait être True
"""
assert est_pair(3) is False
# (Un message peut-être affiché pour les tests échoués)


# --- PYODIDE:secrets --- #

assert est_pair(42) is True
# if fail:
#     raise ValueError(
#         "est_pair(42) a été appelée depuis la validation, mais l'affichage n'est pas visible dans la console"
#     )

# return not n % 2     # décommenter pour voir l'erreur lors de la validation
