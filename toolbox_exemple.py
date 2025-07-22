"""
Utilities to fake some PMT tools so that a python file from the documentation becomes
runnable in the local environment.


WHAT IT DOES:

    * `auto_run` works exactly as it does in pyodide, except for the variables deletions.
    * All other objects/functions act as sinks, swallowing any kind of access/calls
    without doing anything (hence, not returning any value either).


HOW TO USE IT:

    Just put the following snippet at the very top of the python file you wanna test:

    ```python
    # --- PYODIDE:ignore --- #
    # To put at the very top of the python file to test
    from toolbox import *
    ```


This file and the `pyodide_plot.py` one are also available through one of these PMT's scripts:

    python -m pyodide_mkdocs_theme --toolbox --plot
    python -m pyodide_mkdocs_theme --toolbox --plot -C
    python -m pyodide_mkdocs_theme -tPC
"""

from pyodide_plot import PyodidePlot


mermaid_figure = lambda _: print


def terminal_message(_, *a, **kw):
    print(*a, end="\n" if kw.get("new_line", True) else "")


def auto_run(func):
    func()


auto_run.clean = lambda: None  # sink


@auto_run
def __fake_js_import_and_loaders():
    global pyodide_uploader, pyodide_downloader

    from unittest.mock import Mock
    from functools import wraps

    pyodide_uploader = Mock()
    pyodide_downloader = Mock()
    js = Mock()
    src_import = __import__

    @wraps(src_import)
    def fake_js_import(chain: str, *a, **kw):
        """
        If an import related to the js Pyodide module is done, a Mock object will
        be returned. All other imports work the usual way.
        """
        if chain.startswith("js"):
            return js
        return src_import(chain, *a, **kw)

    if isinstance(__builtins__, dict):
        __builtins__["__import__"] = fake_js_import
    else:
        __builtins__.__import__ = fake_js_import


# Because there is no Pyodide around, triggering the deletion:
del __fake_js_import_and_loaders
