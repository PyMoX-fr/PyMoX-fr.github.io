# --- PYODIDE:env --- #
import flet as ft

# --- PYODIDE:code --- #
# Ceci n'est qu'un humble exemple de code minimaliste...
# Amuse-toi ad'libitum à le modifier 😊 !

print(
    (
        lambda n: f"Les {n} premiers multiples de :\n"
        + "\n".join(
            f"- {x} : " + " ".join(f"{i:>3}" for i in range(1, x * n + 1) if i % x == 0)
            for x in (2, 3) # Add ici les nombres dont tu veux les multiples (ex.: ', 5')
        )
    )(10) # Remplace n par le nombre de multiple que tu veux obtenir
)
