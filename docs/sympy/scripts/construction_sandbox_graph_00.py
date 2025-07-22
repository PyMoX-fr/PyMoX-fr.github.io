# --- PYODIDE:env --- #
from unittest import result
import flet as ft

# --- PYODIDE:code --- #
# Ceci est basique, mais ne t'emêche pas de t'amuser ad'libitum en le modifiant 😊 !

def multiples(n):
    """Les 10 premiers multiples de n
    """
    ms = []
    for i in range(11):
        ms.append(f"{i*n:>3}")
    return f'- {n}:', *ms


vs = 2, 3  # Par exemple, ajoute ici juste ', 5'
# print("Multiples de :")
print('Multiples de :')
for v in vs:
    print(*multiples(v))
