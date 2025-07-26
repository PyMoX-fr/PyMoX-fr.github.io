# --- PYODIDE:env --- #
from sympy import *
import sympy.plotting as plotting

def plot(*a, **kw):
    plotting.plot(*a, **kw)
    PyodidePlot.clear_current_figure_title()

fig1=PyodidePlot('cible_1')
fig1.target()     # Cible la figure dans laquelle tracer la figure dans la page

# --- PYODIDE:code --- #
# Les imports suivants ont été faits dans du code caché : 
# from sympy import *

x = symbols('x')
plot(x**2, (x,-5,5), ylim=(-1,5), legend=True)
