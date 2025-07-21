# --- PYODIDE:env --- #
from sympy import *
import sympy.plotting as plotting

def plot(*a, **kw):
    plotting.plot(*a, **kw)
    PyodidePlot.clear_current_figure_title()

fig2=PyodidePlot('cible_2')
fig2.target()     # Cible la figure dans laquelle tracer la figure dans la page

# --- PYODIDE:code --- #
# Les imports suivants ont été faits dans du code caché : 
# from sympy import *

x = symbols('x')
plot(sqrt(x), (x,0,9), ylim=(0,3), aspect_ratio=(1,1), legend=True)
