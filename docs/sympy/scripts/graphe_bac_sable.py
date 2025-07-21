# --- PYODIDE:env --- #
from sympy import *
import sympy.plotting as plotting

def plot(*a, **kw):
    plotting.plot(*a, **kw)
    PyodidePlot.clear_current_figure_title()

fig_bac_sable = PyodidePlot('bac_sable')  
fig_bac_sable.target()     # Cible la figure dans laquelle tracer la figure dans la page

# --- PYODIDE:code --- #
# Les imports suivants ont été faits dans du code caché : 
# from sympy import *

x = symbols('x')
# Modifier la ligne ci-dessous qui sert d'exemple
plot(exp(x), x, ln(x), (x,-5,5), ylim=(-5,5), legend=True)
