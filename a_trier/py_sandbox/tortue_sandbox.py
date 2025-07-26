# --------- PYODIDE:env --------- #
from js import document

_prefixes_possibles = ["turtle", "tt"]
if "restart" in globals():
    restart()
else:
    for pref in _prefixes_possibles:
        if pref in globals():
            p = eval(pref)
            p.restart()
            break


def m_a_j():
    cible = "figure1"
    if "done" in globals():
        done()
        document.getElementById(cible).innerHTML = Screen().html
    else:
        for pref in _prefixes_possibles:
            if pref in globals():
                p = eval(pref)
                p.done()
                document.getElementById(cible).innerHTML = p.Screen().html
                break


# --------- PYODIDE:code --------- #
from turtle import *

# Modifier les lignes ci-dessous qui servent d'exemple
for i in range(3):
    forward(50)
    left(120)

# --------- PYODIDE:post_term --------- #
if any(pref in globals() for pref in _prefixes_possibles) and "m_a_j" in globals():
    m_a_j()


# --- PYODIDE:post --- #
if "post_async" in globals():
    await post_async()

if "Screen" in globals():
    if Screen().html is None:
        forward(0)
    m_a_j()
elif "turtle" in globals():
    if turtle.Screen().html is None:
        turtle.forward(0)
    m_a_j()
