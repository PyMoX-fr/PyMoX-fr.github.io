/*
pyodide-mkdocs-theme
Copyleft GNU GPLv3 🄯 2024 Frédéric Zinelli

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.
If not, see <https://www.gnu.org/licenses/>.
*/


import { jsLogger } from 'jsLogger'
import { escapeSquareBrackets } from 'functools'





export const pyodideFeatureCode=(()=>{

    const PYODIDE_SNIPPETS = {


    /**Creates the PyodideConsole, which is the runtime tool behind any "terminal", and setup
     * the JS routines so that Runners can interact with it.
     *
     * https://pyodide.org/en/stable/usage/api/python-api/console.html#pyodide.console.PyodideConsole
     *
     *
     * Routines are stored in `globalThis.pyFuncs`, which is also `PyodideSectionsRunner.pyFuncs`.
     * The global version will be deleted after use, unless `CONFIG._devMode` is true.
     * The available routines are:
     *
     *      - `redirect_cmd(cmd:string)` to run commands written by a user in the terminal.
     *
     *      - `complete(cmd:string)` to ask for an array of all the possible auto-completion
     *         suggestions for the given command (currently typed in the terminal by a user).
     *
     *      - `clear_console()` to cancel the PyodideConsole current buffer, if ever needed
     *        (for example: an incomplete command triggering an error about imports => the previous
     *         parts of the command need to be cancelled).
     *
     * Archive note: in earlier implementations of pyodideStart, `__builtins__` was behaving here like
     * a dict instead of an object because pyodide.runPython(...) was run using a dedicated namespace
     *  object (second argument).
     * */
    pyodideStart: `
def _hack_start_pyodide():
    import js
    import __main__
    from pyodide.console import PyodideConsole, repr_shorten
    from pyodide.ffi import to_js


    # Globals initializations:
    __builtins__._ = None
    __builtins__.__USER_CMD__ = __builtins__.__USER_CODE__ = ""

    # Store some original python functions:
    for name in 'input print help'.split():
        src_func = getattr(__builtins__, name)
        setattr(__builtins__, f"__{ name }_src__", src_func)


    py_console = PyodideConsole(__main__.__dict__)


    async def redirect_cmd(cmd):

        fut = py_console.push(cmd)
        state = fut.syntax_check

        if state != 'incomplete':
            res = await fut             # Raising is desired if error
            if res is not None:
                __builtins__._ = res
                if js.config().cutFeedback:
                    res = repr_shorten(res)
                print(res)

        return state

    def complete(cmd:str):
        # Avoids some crashes on autocompletion requests on previous results of the autocompletion...
        cmd = cmd.rstrip('(')
        out = py_console.complete(cmd)
        return to_js(out[0])

    def clear_console():
        py_console.buffer = []


    # Proxies created once only per page, so don't care about destroying them:
    js.pyFuncs.redirect_cmd = to_js(redirect_cmd)
    js.pyFuncs.clear_console = to_js(clear_console)
    js.pyFuncs.complete = to_js(complete)

_hack_start_pyodide()
del _hack_start_pyodide     # (no auto_run tool yet)
`,

    autoRun: `
def _hack_auto_run():
    import inspect

    G = globals()

    class AutoRunner:
        run = set()
        coros = []

        def __call__(self, func):
            self.run.add(func.__name__)
            if inspect.iscoroutinefunction(func):
                self.coros.append(func)
            else:
                func()

        def clean(self):
            for k in self.run:
                if k in G: del G[k]
            self.run.clear()

        def __repr__(self):
            return "AutoRunner()"

        async def loop_async(self):
            coros = self.coros[:]
            self.coros.clear()
            for func in coros: await func()


    # Keep uncleaned elements:
    runner = AutoRunner()
    if hasattr(__builtins__, 'auto_run'):
        runner.run |= __builtins__.auto_run.run
    __builtins__.auto_run = runner


    def as_builtin(name_or_func):
        """
        Automatically add the decorated function in the builtins module. Usage:

        \`\`\`python
        @as_builtin
        def func(...): pass     # declare __builtins__.func

        @as_builtin("actual_name")
        def func(...): pass     # declare __builtins__.actual_name = func
        \`\`\`
        """

        if not isinstance(name_or_func, str):
            return as_builtin(name_or_func.__name__)(name_or_func)
        return lambda func: setattr(__builtins__, name_or_func, func) or func


    __builtins__.as_builtin = as_builtin


    @as_builtin
    def wraps_builtin(
        *args,
        source=None,
        store=True,
        name="",
    ):
        """
        Build a singleton object that mimics as much as possible an original builtin,
        defining repr, str, dir, __name__ and __qualname__ behaviors of the builtin function.
        Can also be used with user defined functions, to get a custom \`repr\` value which
        doesn't show some horrible \`<function _hack_xxx.<locals>.some_func>\` to the user
        when printed in the terminal.

        \`type\` and \`help\` give slightly different behaviors:
            * \`type(func)\` is showing the BuiltinWrapperXxx name
            * \`help(func)\` is showing the original docstring of func if defined, or the builtin's
               help message, wrapped inside the BuiltinWrapperXxx class layout

        @source:        The function to "mimic". Generally a builtin, but might be any function
                        that needs to have custom str and repr behaviors.
        @store=True:    If True, added to __builtins__ with builtin.__name__ as property name.
        """

        def wrapper(func):

            builtin_src = f"__{ func.__name__ }_src__"
            is_builtin  = hasattr(__builtins__, builtin_src)

            if is_builtin:
                src       = source or getattr(__builtins__, f"__{ func.__name__ }_src__")
                func_name = name or getattr(src, '__name__', func.__name__)
            else:
                src       = source or func
                func_name = name or getattr(src, '__name__', func.__name__)


            class BuiltinWrapper:

                def __init__(self):
                    self.func = func
                    self.__name__ = self.__qualname__ = func_name

                    # Keep any already defined docstring:
                    self.__class__.__doc__ = func.__doc__ or source and source.__doc__

                def __call__(self, *a,**kw):  return self.func(*a,**kw)
                def __dir__(self):            return dir(src)
                def __repr__(self):
                    if is_builtin and func_name!='help':
                        return repr(src)
                    return f"<function {func_name}>"

            kls_name = "BuiltinWrapper" + func_name.capitalize()
            BuiltinWrapper.__name__ = BuiltinWrapper.__qualname__ = kls_name

            wrapped = BuiltinWrapper()
            if store:
                as_builtin(func_name)(wrapped)
            return wrapped


        if len(args)>1 or args and (not callable(args[0]) or source or name):
            raise ValueError(
                "Invalid call for @wraps_builtin: shouldn't be used with positional arguments,"
                " unless it's the function to wrap."
            )
        return wrapper(args[0]) if args else wrapper

_hack_auto_run()
del _hack_auto_run
`,


    autoRunCleaner: `__builtins__.auto_run.clean()`,


    version: `
def version(get_version=False):
    """ Print (also returns) the current version number of pyodide-mkdocs-theme. """
    out = "pyodide-mkdocs-theme v${ CONFIG.version }"
    print(out)
    if get_version:
        return out
`,


    localStorageRelays: `
@auto_run
def _hack_local_storage_routines():
    import js

    for prop in 'get set del'.split():
        routine = getattr(js, prop+'Storage')
        as_builtin(prop+'_storage')(routine)

    @as_builtin
    def keys_storage():
        return js.keysStorage().to_py()
`,


    ioStuff: `
@auto_run
def _hack_io_stuff():

    import js, re
    from pydoc import render_doc
    from typing import Any

    @wraps_builtin
    def input(question:str="", beginning:str=""):
        question = question or ""           # Original is using None so, just in case...
        result = js.prompt(f"{ beginning }{ question }")
        print(f"{ question }{ result }")    # Must ensure string conversion of result
        return result


    @wraps_builtin
    def help(object_or_function):
        """
        Replace the original help function, which doesn't work as expected within pyodide.
        """

        class_name = getattr(type(object_or_function), '__name__', '')
        prefix     = 'BuiltinWrapper'
        if class_name.startswith(prefix):
            func_name = class_name[len(prefix):].lower()
            if func_name == 'help':
                object_or_function = object_or_function.func
            else:
                src_name = f"__{ func_name }_src__"
                object_or_function    = getattr(__builtins__, src_name, None) or object_or_function.func

        name = getattr(object_or_function, '__name__', None)
        if name is None or name not in PMT_TOOLS:
            doc = render_doc(object_or_function)
        else:
            doc = object_or_function.__doc__
        print(re.sub(r"\x08.", "", doc))


    PMT_TOOLS = ['p5', 'vis', 'vis_network']      # GENERATED


    @wraps_builtin
    def terminal_message(key, *msg:Any, format:str=None, sep:str=' ', end:str=None, new_line:bool=True, **__):
        """
        Display the given message directly into the terminal, without using the python stdout.
        This allows to give informations to the user even if the stdout is deactivated during
        a validation.

        @key:      Value to pass to allow the use of the function when the stdout is deactivated.
        @*msg:     Any number of elements to display in the terminal.
        @format:   One of the predefined formatting options for the terminal:
                   "error", "warning", "info", "italic", "stress", "success", "none" (default)
        @sep=' ':  Equivalent to \`print(..., sep=...)\`
        @end=None: Close to \`print(..., end=...)\`. If not used, the @new_line argument will apply.
                   Otherwise, @new_line will be False, and @end will control the end of the
                   displayed message.
        @new_line: _Legacy behavior_: this argument is now useless and can be replaced with the
                   use of \`end\`. If False, no new line character is added after the @msg content.
        @returns:  None
        """

        # NOTE: arguments are used as sinks when using terminal_message as a replacement for print
        msg = sep.join(map(str, msg))
        if end is not None:
            new_line = False
            msg += end
        try:
            js.config().termMessage(key, msg, format or 'none', False, new_line)
        except Exception as e:
            msg = str(e)
            target = 'Error: '      # Error might be Error, or PythonError
            i = msg.find(target)
            if i<0: i = -len(target)
            stripped_js_err = msg[ i+len(target): ]
            raise Exception(stripped_js_err) from None
`,


    copyFromServer: `
@auto_run
def _hack_copy_from_server():

    @as_builtin
    async def copy_from_server(
        src: str,
        dest: str = ".",
        name: str = "",
    ):
        from pyodide.http import pyfetch
        from pathlib import Path
        from urllib.error import URLError



        response = await pyfetch(src)
        if not response.ok:
            raise URLError(f"Failed request for { src }.")

        content  = await response.bytes()
        target   = Path(dest) / (name or Path(src).name)
            # Note: Path(src).name works to extract the name file on urls, but the path
            #       is actually invalid as an url: "http://xx" givers "http:/xx".
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
`,


    exclusionsTools: `
@auto_run
def _hack_exclusions_tools():

    type = __builtins__.type      # avoid restrictions troubles

    @wraps_builtin
    def __move_forward__(x):
        treasure = __builtins__.__builtins___
        if type(x) is str and x in treasure:
            return treasure[x][0]

    @as_builtin
    class ExclusionError(Exception):
        @staticmethod
        def throw(that:str, head=None):
            if head is None:
                head = "don't use "
            raise ExclusionError(f"${ CONFIG.MSG.exclusionMarker }: { head }{ that }")
`,


    refresher: `
@auto_run
def _hack_scope_cleaner():

    # Avoid restrictions troubles:
    set = __builtins__.set
    globals = __builtins__.globals

    @wraps_builtin
    def clear_scope(keep=()):
        """
        Remove any new function or variable from the global scope, keeping only:

        - Variables and functions that were defined after the start of the environment.
        - Elements present in the @keep argument (Iterable).
        """
        keeper = set(keep) | {
            '__name__', '__doc__', '__package__', '__loader__', '__spec__',
            '__annotations__', '__builtins__', '_pyodide_core', 'version'
        }
        g_dct = globals()
        for k in set(g_dct) - keeper:
            del g_dct[k]
`,

    clearScope: `clear_scope()`,


    wantedImports: `
@auto_run
def _hack_find_imports():
    from pyodide.code import find_imports
    __builtins__.imported_modules = find_imports({FORMAT_TOKEN})

__builtins__.imported_modules
`,


    alreadyImported: `
@auto_run
def _hack_imported():
    import sys
    __builtins__.loaded_modules = " ".join(sys.modules.keys())

__builtins__.loaded_modules
`,


    upDownLoader: `
@auto_run
def _hack_uploader_downloader():

    import js
    from pyodide.ffi import create_proxy
    from typing import Callable, Any, Literal
    from argparse import Namespace

    class ReadAs(Namespace):
        txt = 'readAsText'
        bytes = 'readAsArrayBuffer'
        img = 'readAsDataURL'

        @classmethod
        def get_props(cls):
            return ', '.join(
                repr(p) for p in dir[cls] if not p.startswith('_') and p != 'get_props'
            )

    def wrapping(
        cbk: Callable[[str],Any],
        *,
        read_as: Literal["txt","bytes","img"] = 'txt',
        with_name:bool = False,
        multi:bool = False,
    ):
        read_method = getattr(ReadAs, read_as, None)
        if not read_method:
            raise ValueError(
                f"Invalid read_as argument: {read_as!r}. Available options are: {ReadAs.get_props()}"
            )

        def wrapper(content:str, filename:str, is_last:bool):

            if read_method == ReadAs.bytes:
                content = bytes(js.Uint8Array.new(content))

            args = (content, filename) if with_name else (content,)
            out.append(cbk(*args))

            if is_last:
                proxy_cbk.destroy()

        proxy_cbk = create_proxy(wrapper)    # Does NOT work when using pyodide.ffi.create_once_callable
        out = []

        return (proxy_cbk, read_method, multi), lambda: out


    @as_builtin
    async def pyodide_uploader_async(
        cbk: Callable[[str],Any],
        *,
        read_as: Literal["txt","bytes","img"] = 'txt',
        with_name:bool = False,
        multi:bool = False,
    ) -> Any :
        '''
        Async uploader, to import files into pyodide environment. The files are available right
        after the function call.

        @cbk: receive the content of a file (as str, bytes or DataURL, depending on @read_as), and
        possibly the filename (if @with_name is True). It can return an output of any kind.

        @read_as: set the input type of the @cbk first argument:
        - "txt": sends str
        - "bytes": sends bytes
        - "img"; sends the content of an image file as a DataURL, that can be directly inserted
        into an img tag.

        @with_name=False: if True, @cbk must accept an extra argument, which will be the name of
        the uploaded file.

        @multi=False: if True, several files can be uploaded at once. In that case, @cbk returns
        a tuple of the output for each file.

        @returns: the output of @cbk, as a tuple if @multi is True.
        '''

        js_args, out_getter = wrapping(cbk, read_as=read_as, with_name=with_name, multi=multi)
        await js.uploaderAsync(*js_args)
        out = out_getter()
        if multi:
            return tuple(out)
        return out.pop() if out else None



    @as_builtin
    def pyodide_uploader(
        cbk: Callable[[str],None],
        *,
        read_as: Literal["txt","bytes","img"] = 'txt',
        with_name:bool = False,
        multi:bool = False,
    ) -> None :
        '''
        Sync version of the uploader, to import files into pyodide environment. The files are
        available only after the PMT sections have all been completed (meaning, after the post
        section).

        @cbk: receive the content of a file (as str, bytes or DataURL, depending on @read_as), and
        possibly the filename (if @with_name is True). Any action related to handling the files
        content must be done from within this callback.

        @read_as: set the input type of the @cbk first argument:
        - "txt": sends str
        - "bytes": sends bytes
        - "img"; sends the content of an image file as a DataURL, that can be directly inserted
        into an img tag.

        @with_name=False: if True, @cbk must accept an extra argument, which will be the name of
        the uploaded file.

        @multi=False: if True, several files can be uploaded at once. In that case, @cbk returns
        a tuple of the output for each file.

        @returns: Nothing.
        '''
        js_args, _ = wrapping(cbk, read_as=read_as, with_name=with_name, multi=multi)
        js.uploader(*js_args)



    @as_builtin
    def pyodide_downloader(
        content:str|bytes|list[int],
        filename:str,
        type="text/plain"
    ) -> None :
        '''
        Send content from pyodide to the user's download directory.

        @content: the content to send to the user (str, bytes, list[int], bytearray).

        @filename: the name of the downloaded file.

        @type_mime: type of the downloaded file. See:
        https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
        '''
        if not isinstance(content, str):
            content = js.Uint8Array.new(content)
        js.downloader(content, filename, type)
`,


    // GENERATED (modify the root project file instead and/or ./python_devops/_js_codes_updates.py)
    pyodidePlot: `
@auto_run
def _hack_plot():
    # THIS IS A PLOT TOKEN

    import matplotlib
    import matplotlib.pyplot as plt
    from typing import Callable, Sequence



    class PyodidePlot:
        """
        Helper class, to draw figures from pyodide runtime, into a specified html element.
        If no argument is provided, the default \`div_id\` is used (arguments configuration of
        the plugin).

        \`\`\`python
        import matplotlib.pyplot as plt
        PyodidePlot().target()

        plt.plot(xs, ys, ...)
        plt.title("...")
        plt.show()
        \`\`\`

        ---

        In case you want to target more than one figure in the same page, pass the html id of the
        div tag to target to the \`PyodidePlot\` constructor:

        \`\`\`python
        fig1 = PyodidePlot("figure_id1")
        fig2 = PyodidePlot("figure_id2")

        fig1.target()       # Draw in "figure_id1"
        plt.plot(...)

        fig2.target()       # Draw in "figure_id2"
        plt.plot(...)
        \`\`\`

        ---
        """

        def __init__(self, div_id:str=''):
            self.div_id = div_id or js.config().argsFigureDivId

        def __getattr__(self, prop:str):
            return getattr(plt, prop)


        def target(self, keep_fig=False):
            """
            Close any previously created figure, then setup the current run to draw in
            the div tag targeted by the current instance.
            If keep_fig is set to True, the automatic \`Figure N\` will be kept, above the
            next drawn figure.
            """
            for _ in plt.get_fignums():
                plt.close()
            div = js.document.getElementById(self.div_id)
            if not div:
                raise ValueError("Couldn't find the target object: #"+self.div_id)
            js.document.pyodideMplTarget = div
            div.textContent = ""
            if not keep_fig:
                self.clear_current_figure_title()
            return plt

        refresh = target        # backward compatibility



        def plot_func(
            self,
            func:Callable,
            rng:Sequence,
            fmt:str=None,
            title:str=None,
            *,
            show:bool=True,
            keep_figure_num: bool = False,
            **kw
        ):
            """
            Draw an automatic graph for the given function on the given range, then "show"
            automatically the resulting graph in the correct figure element in the page.

            Arguments:
                func:  Callable, func(x) -> y
                rng:   Sequence of xs
                fmt:   Curve formatting (just like \`pyplot.plot\`)
                title: If given, will be added as title of the graph.
                show:  Call \`pyplot.show()\` only if \`True\`. This allows to customize the graph
                       before applying show manually.
                keep_figure_num: if False (by default), the \`Figure N\` above the drawing is
                       automatically removed.

            """
            self.target(keep_figure_num)

            xs = list(rng)
            ys = [*map(func, rng)]
            args = (xs,ys) if fmt is None else (xs,ys,fmt)
            out = plt.plot(*args, **kw)

            if title:
                plt.title(title)
            if show:
                plt.show()
            return out



        def plot(self, *args, keep_figure_num:bool=False, **kw):
            """
            Generic interface, strictly equivalent to \`pyplot.plot\`, except the \`PyodidePlot\`
            instance will automatically apply the drawing to the desired html element it is
            related to.

            _Use specifically this method to "plot"_ ! You then can rely on \`pyplot\` to finalize
            the figure as you prefer.
            """
            self.target(keep_figure_num)
            out = plt.plot(*args, **kw)
            return out


        @classmethod
        def clear_current_figure_title(cls):
            """ Remove the automatic title added through matplotlib.pyplot. """
            plt.gcf().canvas.manager.set_window_title('')


        @classmethod
        def interactive_backend(cls):
            """ Use interactive html5 backend to draw figures """
            matplotlib.use("module://matplotlib_pyodide.html5_canvas_backend")

        @classmethod
        def wasm_backend(cls):
            """ Use wasm backend rendering to draw static figures """
            matplotlib.use("module://matplotlib_pyodide.wasm_backend")

        @classmethod
        def matplotlib_backend(cls):
            """ Use interactive html5 backend to draw figures """
            cls.interactive_backend()

        @classmethod
        def sympy_backend(cls):
            """ Use wasm backend rendering to draw static figures """
            cls.wasm_backend()


    import js
    PyodidePlot.matplotlib_backend()

# THIS IS A PLOT TOKEN
    __builtins__.PyodidePlot = PyodidePlot      # don't use the decorator because auto-updated code
`,


    mermaidDrawer: `
@auto_run
def _hack_mermaid():
    import js

    @as_builtin
    def mermaid_figure(div_id:str=None):
        """
        Create a Callable[[str],None] that will draw the given mermaid code into the wanted figure div.
        """
        div_id = div_id or js.config().argsFigureDivId

        def to_mermaid(code:str, debug=False):
            if debug: print(code)
            code = f'<pre class="mermaid">{ code }</pre>'
            js.document.getElementById(div_id).innerHTML = code
            js.config().calledMermaid = True

        return to_mermaid

    try:
        if js.config().needMermaid:
            js.mermaid

        else:
            @as_builtin
            def mermaid_figure(*_,**__):
                raise ValueError(
                     "The function mermaid_figure cannot be used because there is no mermaid "
                    +"registration in the page.\\nDon't forget to mark the markdown page "
                    +"by using the argument 'MERMAID=True' in one of the macros (IDE, IDEv, "
                    +"terminal or py_btn)"
                )
    except:
        raise ValueError(
            "Cannot create mermaid logistic: the js mermaid object doesn't exist."
            +"\\nDon't forget to mark the markdown page by using the argument "
            +"'MERMAID=True' in one of the macros (IDE, IDEv, terminal or py_btn)"
        )
`,


    setupStdIO: `
@auto_run
def _hack_stdout_up():
    import sys, io, js

    @wraps_builtin
    def print(*a,**kw):     # Note: wraps doesn't seem to work... Dunno why...)

        # First, blindly print to the actual stdout (in case the author is using it)
        __print_src__(*a,**kw)

        # Then print to the one used to get proper formatting (according to the generic
        # behavior of python print function), then extract the formatted content to
        # transfer to the terminal and empty per_call_stdout:

        kw['file'] = per_call_stdout
        __print_src__(*a,**kw)
        properly_formatted = per_call_stdout.getvalue()
        per_call_stdout.truncate(0)
        per_call_stdout.seek(0)

        js.config().termMessage(None, properly_formatted, 'none', True)


    # Different object allowing to spot what to print exactly, for one single call to print:
    __builtins__.per_call_std_out = per_call_stdout = io.StringIO()

    # Keep a StringIO object there (this also allows to enforce a flush of the stdout content
    # in between runs/sections, on user's side, and redactors wanting to test against the user
    # stdout will also use this:
    __builtins__.src_stdout = sys.stdout
    sys.stdout = io.StringIO()
`,


    getFullStdIO:`
@__builtins__.auto_run
def _hack_stdout_down():
    import sys

    # Store to send the result to JS layer at the end:
    __builtins__._stdout_value = sys.stdout.getvalue()

    sys.stdout.close()
    sys.stdout = __builtins__.src_stdout
    del __builtins__.src_stdout

    __builtins__.per_call_std_out.close()
    __builtins__.print = __builtins__.__print_src__

__builtins__._stdout_value
`,
    }

    return (option, repl=null)=>{
        LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - Pyodide feature:', option)
        let code = PYODIDE_SNIPPETS[option]
        if(code===undefined) throw new Error(`Unknown snippet: ${option}`)
        if(repl!==null){
            code = code.split("{FORMAT_TOKEN}").join(JSON.stringify(repl))
            /* WARNING!! DO NOT use string.replace here, because if ever the repl contains some
               specific RegExp characters (like... `$`), those will cause a mess in the replacement
               (even if they are escaped first). */
        }
        return code+"\n"
    }
})()








/*
------------------------------------------------------------------
          Manage python stdout redirection in terminal
------------------------------------------------------------------
*/


export const pyodideFeatureRunCode=(name, repl=null)=>{
    const code = pyodideFeatureCode(name, repl)
    return pyodide.runPython(code)
}


/**Use a StringIO stdout, so that the full content can be extracted later.
 * */
export const setupStdIO =_=>{       // WARNING: some arguments may be passed in silently here or there
    pyodideFeatureRunCode('autoRun')
    pyodideFeatureRunCode('setupStdIO')
}

export const getFullStdIO =_=>{
    const stdout = pyodideFeatureRunCode('getFullStdIO') || ''
    return escapeSquareBrackets(stdout)
}

export const clearPyodideScope=()=>{
    pyodideFeatureRunCode('autoRun')
    pyodideFeatureRunCode('refresher')
    pyodideFeatureRunCode('clearScope')
}