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
import {
  escapePyodideCodeForJsTemplates,
  toSnake,
  youAreInTroubles,
} from 'functools'
import {
  getFullStdIO,
  pyodideFeatureRunCode,
  setupStdIO,
} from '0-generic-python-snippets-pyodide'
import { generateErrorLog } from '1-error_logs-pyodide'
import { installPythonPackages } from '1-packagesInstaller-install-pyodide'



const UNKNOWN = "<unknown>"




/**Build a "context" object, holding the various state information for the current
 * "sub-action/step" in the current overall user action (RuntimeManager).
 * (creates a bare object, without methods)
 * */
class Ctx {

  /**Build a "context" object, holding the various state information for the current
   * "sub-action/step" in the current overall user action (RuntimeManager).
   * (creates a bare object, without methods).
   *
   * @ctx:  May be an object or a simple string (for environment sections).
   *        In this case, the default values are rebuilt accordingly.
   */
  static build(ctx, runtime){

    let section = ctx && ctx.section || UNKNOWN

    if(!ctx){
      ctx = {}                          // No argument

    }else if(typeof(ctx)=='string'){    // Environment section name only
      section = ctx                     // Override the default value ('<unknown>')
      ctx = {
        archiveSuccess:       true,     // always, with environment codes
        code:                 runtime.runner[`${ section }Content`].trim(),
        keepRunningOnAssert:  section.startsWith('env'),
        method:               this.genericEnvSectionRunnerAsync,
      }
    }

    // Merge all the data in appropriate order...:
    ctx = {
      success: true,                // false on errors only, not if just "skipped"
      archiveSuccess: false,        // If true, the section will be registered as ran successfully (if it is so). To use on the last action of the section.

      err: null,                    // Error instance
      stdErr: "",                   // Error as string (msg to output, already formatted for terminal)
      isAssertErr:false,
      keepRunningOnAssert: false,   // If true, consider the section ran successfully on AssertionError (this is env related)
      gotBigFail: false,            // YOU ARE IN TROUBLES

      isEnvSection: true,           // Any of env, env_term, ... => "not user code or cmd"
      autoImport: true,             // If true, apply automatically install/imports logistic
      code: ".",                    // If empty string, the Runner method won't ever be called (non empty default is ok, because some Runner won't need to pass `code` to the ctx to know what to do (or the code needed is not known yet: Features)
      method: ()=>null,             // Runner method to... run when everything is ready
      logConfig: {},                // Config for generateErrorLog
      asyncSecrets: false,

      applyExclusionsIfAny: false,  // Apply exclusions specifically on this run (if any). Note: `!isEnvSection` is not specific enough!
      kwsExclusions: undefined,     // Define if some exclusions logic has to be applied or not on the way
      methodsExclusions: undefined, // Define if some exclusions logic has to be applied or not on the way
      runtimeExclusions: undefined, // Define if some exclusions logic has to be applied or not on the way
      runtimeExclusionSetupSuccessful: false,  // Flag to decide to apply or not exclusions logistic teardown

      qualname: `${ section || '?' }_${ ctx.method.name }`, // "qualified name" = section + method to run in the current action (debugging purpose)
      ...ctx,
      section,                      // As in "PYODIDE:{section}", or "unknown" instead. Visible in the stacktrace on errors.
                                    // Always AFTER unpacking @ctx, because section either is consistent, or has been correctly updated.
    }

    // Manage exclusions flags, once all sources have been merged:
    const needExclusions  = !ctx.isEnvSection && ctx.applyExclusionsIfAny
    ctx.kwsExclusions     ??= needExclusions && runtime.excludedKws.length>0
    ctx.methodsExclusions ??= needExclusions && runtime.excludedMethods.length>0
    ctx.runtimeExclusions ??= needExclusions && (
      runtime.pypiWhite && runtime.pypiWhite.length>0
      || runtime.excluded.length>0
      || runtime.recLimit > 0
    )

    return ctx
  }


  static genericEnvSectionRunnerAsync = async (ctx)=>{
    if(!ctx.code) return;
    await pyodide.runPythonAsync( ctx.code, {filename:`<${ toSnake(ctx.section) }>`} )
  }
}









/**Manage the environment when in need to execute some code in pyodide.
 *
 * Holds all the logic to manage all the possible outcomes:
 * Used as "throw away" data structure, once the full user action is done: this allows
 * to mutate "everything you need", being sure it wont affect the original data in the
 * `PythonSectionsRunner` instance.
 * */
export class RuntimeManager {


  get excluded()        { return this.runner.excluded }
  get excludedMethods() { return this.runner.excludedMethods }
  get excludedKws()     { return this.runner.excludedKws }
  get recLimit()        { return this.runner.recLimit }
  get whiteList()       { return this.runner.whiteList }
  get pypiWhite()       { return this.runner.pypiWhite }



  constructor(runner){
    this.runner = runner    // PyodideSectionsRunner, or one of its parent class/object

    // --- Python logistic related (may be mutated on the way) ---
    this.autoLogAssert   = null     // default for the PUBLIC tests...
    this.purgeStackTrace = null     // default for the PUBLIC tests...
    this.withStdOut      = null     // default for the PUBLIC tests...
    this.refreshStateWith()         // Apply actual defaults (avoiding defaults duplication)

    // --- Runtime logistic related (may be mutated on the way) ---
    this.stdErr       = ""          // First encountered error message
    this.isAssertErr  = false       // Is the error an assertion error
    this.gotBigFail   = false       // If true, new errors won't replace the current one
    this.finalMsg     = ""          // Potential extra message to display at the very end, if truthy.
                                    //  (will be printed even if this.stopped is true)

    this.ran = {start: true}        // Keep track of the successfully run env sections (or raising assertion errors)
    this.dependencies = {
      env:      'start',
      envTerm:  'env',
      code:     'env',              // (actually not used as a condition for now)
      cmd:      'envTerm',          // (actually not used as a condition for now)
      postTerm: 'envTerm',
      post:     'env',
    }
  }

  get stopped(){ return Boolean(this.stdErr) }


  /**Update the state of the current RuntimeManager with the given data, and use
   * default values for missing fields.
   * */
  refreshStateWith(update={}){
    update = {
      autoLogAssert:   true,
      purgeStackTrace: false,
      withStdOut:      true,
      ...update
    }
    for(const prop in update){
      this[prop] = update[prop]
    }
  }


  /**Update the sections dependency graph, to modify the conditions to run or not a section.
   * */
  changeDependency(source, target){
    if(this.dependencies[source]===undefined){
      throw new Error("Invalid source dependency: " + source)
    }
    this.dependencies[source] = target
  }

  cleanup(){
    return this.runner = this.runCodeAsync = null   // Facilitate GC...(?)
  }



  stillRunnable(ctx){
    let outcome = ctx.isEnvSection
                  ? this.ran[ this.dependencies[ctx.section] ]
                  : !this.stopped
    outcome &&= !this.gotBigFail
    return outcome
  }




  /**Run one Runner method (async), surrounding it with all necessary logics, like:
   *
   *    - setup+teardown stdout
   *    - setup+teardown exclusions
   *    - give feedback
   *    - try/catch where appropriate (handling properly the exclusions removal case)
   *
   * This method should never actually throw, except in "BigFail" cases.
   * Note: NOT this.stdErr, which is more global, while the current run could involve `post`
   *       actions that should potentially occur even if an error has already occur previously
   *       in the current user's action.
   *
   * It uses a ctx object, which holds the local executions data, and will merge the data
   * when appropriate in the RunnerManager (which holds runtime information for the current
   * user's action).
   *
   * Inside this "runWithCtx" call, subsequent methods calls are skipped if an error has been
   * registered in the @ctx object, unless the method is specified as "should `always` happen"
   * */
  async runWithCtx(srcCtx){
    const ctx    = Ctx.build(srcCtx, this)
    const toSkip = !this.stillRunnable(ctx)

    if(toSkip){
      LOGGER_CONFIG.ACTIVATE && jsLogger('[Runtime] - SKIPPED', ctx.qualname)
      return ctx
    }

    LOGGER_CONFIG.ACTIVATE && jsLogger('[Runtime] - running ', ctx.qualname)
    // No need for error extra handling: big fails handled in lockedRunnerWithBigFailWarningFactory

    this.runner.allowPrint = this.withStdOut
    const astExclusions    = ctx.kwsExclusions || ctx.methodsExclusions
    const handleAsyncRuns  = ctx.isEnvSection  || ctx.asyncSecrets

                              await this._runCaught(ctx, setupStdIO, {shouldNeverFail:true})
    if(astExclusions)         await this._runCaught(ctx, this.setupAstExclusions)
    if(ctx.autoImport)        await this._runCaught(ctx, this.installOrImportModules) // BEFORE runtime exclusions! ('cause using `import`)
    if(ctx.runtimeExclusions) await this._runCaught(ctx, this.setupRuntimeExclusions, {shouldNeverFail:true})
    if(!ctx.isEnvSection)     await this._runCaught(ctx, this.clearAutoRun, {shouldNeverFail:true})
                              await this._runCaught(ctx, this.applyRunnerMethod)
    if(handleAsyncRuns)       await this._runCaught(ctx, this.manageDecoratedAsyncRuns, {always:true})
    if(ctx.runtimeExclusions) await this._runCaught(ctx, this.removeExclusions, {always:true})
                              await this._runCaught(ctx, this.teardownManager,  {always:true, shouldNeverFail:true})

    this.runner.allowPrint = true
    this.runner.giveFeedback(ctx.stdErr)

    if(ctx.archiveSuccess){
      this.ran[ctx.section] = ctx.success
    }
    LOGGER_CONFIG.ACTIVATE && jsLogger('[Runtime] - done', ctx.qualname)
    return ctx
  }



  /**Generic "task" runner, handling the overall logic to run or not routines, update the global
   * states, log errors if desired, depending on the runtime and ctx configurations.
   * */
  async _runCaught(ctx, method, conf={}){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[Runtime] - Enter _runCaught ', ctx.qualname, method.name)

    if(ctx.err && !conf.always) return;

    try{
      await method.call(this, ctx)

    }catch(e){
      ctx.err = e
      if(conf.shouldNeverFail){
        // Here, teardownManager could have fail, so handle the error manually:
        ctx.success     = false
        ctx.isAssertErr = this.isAssertErr = false
        ctx.stdErr      = this.stdErr      = youAreInTroubles(e)
        ctx.gotBigFail  = this.gotBigFail  = true
      }
    }
  }


  async setupAstExclusions(ctx){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - running - setup keywords exclusions')
    if(ctx.code){
      astExclusions(ctx.code, this.excludedKws, this.excludedMethods)
    }
  }


  async setupRuntimeExclusions(ctx){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - running - setup runtime exclusions')
    setupExclusions(this.excluded, this.recLimit)
    ctx.runtimeExclusionSetupSuccessful = true
  }


  async clearAutoRun(ctx){
    pyodideFeatureRunCode('autoRunCleaner')
  }


  async installOrImportModules(ctx){
    await installPythonPackages(this, ctx)
  }


  /**Run the desired Runner method, once all the setup has been managed.
   * If it succeeds (aka, the method doesn't throw any error), the ctx is marked as successful.
   *
   * The Runner method is supposed to take this kind of signature:
   *
   *      method.call(runner, ctx, runtime)
   *
   * The two last arguments are always passed but may be ignored on the actual method signature,
   * if they do not make use of them.
   * */
  async applyRunnerMethod(ctx){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - running method runner -', ctx.qualname)
    await ctx.method.call(this.runner, ctx, this) // always send extras args (in case useful)
    ctx.success = true
  }


  async manageDecoratedAsyncRuns(ctx){
    if(this.stopped || ctx.err){
      await pyodide.runPythonAsync("__builtins__.auto_run.coros.clear()")
    }else{
      await pyodide.runPythonAsync("await __builtins__.auto_run.loop_async()")
    }
  }


  async removeExclusions(ctx){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - running - removing exclusions')
    if(ctx.runtimeExclusionSetupSuccessful){
      restoreOriginalFunctions(this.excluded)
    }
  }


  async teardownManager(ctx){
    getFullStdIO()

    if(!ctx.err) return;    // nothing to do if no error during the current run.

    this.finalMsg = ""      // Never show a default finalMsg if an error occurred.

    generateErrorLog(ctx)

    // If ever multiple errors happen, an assertion error will always be the very
    // first one, so always keep if any (avoid the need to condition the update)
    if(!this.gotBigFail){
      this.isAssertErr ||= ctx.isAssertErr
      this.stdErr        = ctx.stdErr
      this.gotBigFail    = ctx.gotBigFail
    }
    ctx.success = ctx.keepRunningOnAssert && ctx.isAssertErr
  }
}

















/*
------------------------------------------------------------------
                      Manage code exclusions
------------------------------------------------------------------
*/


/**Put in place code exclusions. Are handled:
 *   - builtin function calls
 *   - imports
 *   - method calls (done through a simple string check in the code, in
 *     runPythonCodeWithOptionsIfNoStdErr)
 *
 *
 * ## RATIONALS:
 *
 * To forbid the use of some functions or packages, replace them in the global scope by "functions"
 * that look "more or less the same", but will raise an error when called, or when used in the
 * wrong way (imports).
 *
 *
 * ## PROBLEMS & CONTEXT:
 *
 * 1. Pyodide itself uses various functions to run python code:
 *      - eval is used in pyodide.runPython
 *      - reversed and/or min and/or max may be used when building a stacktrace when an error is
 *        thrown in python
 * 2. This forbids to replace the __builtins__ versions of those functions (see about imports)...
 * 3. ...but the __main__ script is run separately of pyodide actual "python runtime".
 *
 *
 * ## SOLUTION FOR BUILTINS FUNCTIONS:
 *
 * - Redeclare forbidden things in the global scope, through `globals()`, using an object that
 *   will systematically throw an ExclusionError when it's called.
 * - Since those are in the global scope, they are visible through `dir()`, so add some make up
 *   to them, using a class that redefines its __qualname__ and __repr__, so that they are less
 *   obvious as "anti-cheats" (it will still remain obvious for those who know enough. But if they
 *   can find about that, they probably could solve the problem the right way anyway...).
 * - Pyodide runtime won't see those globals, so it is not affected in any way, only the user's
 *   and tester's codes are.
 * - The (hidden) function `__move_forward__('builtin_name')` (see documentation) can be used in
 *   the tests to get back the original builtin. If used, it must be done inside a closure, so
 *   that the original builtin doesn't override the "Raiser" in the global scope (see below).
 * - Since the hacked versions are available to the user in the global runtime, they could just
 *   delete them to get back the access to the original builtins. To limit this risk, an extra
 *   check is done after the user's code and tests has been run, verifying that the hacked
 *   functions are still defined in the global scope, and that they still are the original
 *   Raiser objects.
 *
 *
 * ## SOLUTION FOR IMPORTS
 *
 * The problem with `import` is that they actually go directly through `__builtins__.__import__`.
 * So in that case, there is no other choice than hacking directly the builtin, and then put it
 * back in place when not useful anymore.
 *
 *
 * ## RECURSION LIMIT
 *
 * The sys module function is directly hacked, then put back in place: meaning, the function
 * setrecursionlimit is also replaced at user's runtime with a Raiser object.
 *
 * */
const setupExclusions =(excluded, recLimit)=>{
  // Store None in the __builtins___ dict for things that aren't builtin functions, aka, names
  // of forbidden module.

  /** WARNING!
   *  Keep in mind that the code of the Raiser instances will run "in context".
   *  This means it will be subject to existing exclusions, so it must never use a function that
   *  could be forbidden. Possibly...
   *  For this reason, copies of all the builtins used in the Raiser code are stored locally, to
   *  be sure the Raiser won't use Raiser instances... XD
   * */
  const code = `
  @__builtins__.auto_run
  def _hack_exclusions_setup():

      class Raiser:
          __name__ = __qualname__ = 'function'

          def __init__(self, key):  self.key = key

          def __repr__(self): return f"<built-in function {self.key}>"

          def __call__(self, *a, **kw):
              key = self.key

              head = a and base_isinstance(a[0],base_str) and a[0].split(".")[0]

              is_forbidden = (
                  key != '__import__' or
                  key == '__import__' and head in dct
              )
              if is_forbidden:
                  that = key if key!='__import__' else head
                  ExclusionError.throw(that)

              # if reaching this point, the call is a valid import, so apply it:
              return base_import(*a,**kw)


      # Store the originals used here to avoid troubles with exclusions at runtime:
      base_import = __import__
      base_str = str
      base_isinstance = isinstance


      dct = __builtins__.__builtins___ = {}
      raiser_import = Raiser('__import__')
      dct['__import__'] = [base_import, raiser_import]
      __builtins__.__import__ = raiser_import


      glob_dct = globals()
      exclusions = ${ JSON.stringify(excluded) }
      for key in exclusions:
          stuff = getattr(__builtins__, key, None)
          dct[key] = [stuff, None]
          # => the dict will store [None,None] for module names

      if ${ recLimit } != -1:
          import sys
          sys.setrecursionlimit(${ recLimit })
          dct['setrecursionlimit'] = [sys.setrecursionlimit, None]

      for key,lst in dct.items():
          stuff = lst[0]
          if callable(stuff) and key!='__import__':       # import has already been handled
              # Store the reference of the raiser in lst, to check against it later:
              glob_dct[key] = lst[1] = Raiser(key)

      # auto_run added for verification purpose only, but it must stay usable:
      dct['auto_run'] = auto_run
`
  pyodide.runPython(code)
}






/**Cancel the code exclusions (done as soon as possible, to restore pyodide's normal behaviors).
* */
const restoreOriginalFunctions = exclusions =>{

  // Don't use auto_run, in case someone messes with it...
  const code = `
def _hack_unexclude():
  dct = __builtins__.__builtins___
  G = globals() if "globals" not in dct else dct['globals']()

  # Handle special behavior of auto_run:
  key = "auto_run"
  auto_run = dct.pop(key)
  bad_auto_run = G.get(key, __builtins__.auto_run) is not auto_run
  __builtins__.auto_run = auto_run

  # Restore everything before raising anything:
  not_ok = []
  for key,(func,raiser) in dct.items():

      if key == '__import__':
          __builtins__.__import__ = func

      else:
          if raiser is not None and raiser is not G.get(key):
              not_ok.append(key)
          if func is not None:
              if key in G:
                  del G[key]  # "Unshadow" the builtin
              if key == 'setrecursionlimit':
                  func(1000)

  if bad_auto_run:
      ExclusionError.throw("the auto_run tool...")
  if not_ok:
      ExclusionError.throw("${ exclusions }")

_hack_unexclude()
del _hack_unexclude
`
  pyodide.runPython(code)
}







/**Attempt to "optimize" the NodeVisitor class to not lose time on attribute accesses when
 * none are to check, or on keywords check when none are to check.
 * */
const astExclusions =(code, excludedKws, excludedMethods)=> {

  const classes = new Map()
  const customs = new Set()

  for(const kw of excludedKws) for(const cls of EXCLUSION_CLASSES[kw]||[]){
    if(cls.startsWith('+')) customs.add(cls.slice(1))
    else classes.set(cls,kw)
  }
  for(const cls of customs) classes.delete(cls)


  const attrChecker = !excludedMethods.length ? "" : `
        def visit_Attribute(self, node:ast.Attribute):
            if node.attr in forbidden_attrs:
                wrongs.add('.'+node.attr)
            super().generic_visit(node)
`

  const kwsChecker = !excludedKws.length ? "" : [...classes].map(
    ([cls,kw])=>`
        def visit_${cls}(self, node):
            wrongs.add("${ kw.replace('_',' ') }")
            super().generic_visit(node)
`
  ).join("") + [...customs].map(kw=>CUSTOM_SNIPPET[kw]).join("")


  const checkCode = `
@auto_run
def _hack_check_excluded_keywords():
    import ast, js

    try:
        tree = ast.parse("""${ escapePyodideCodeForJsTemplates(code) }""")
    except:
        return  # invalid syntax => nothing to check


    forbidden_kws   = {${ JSON.stringify(excludedKws).slice(1,-1) }}
    forbidden_attrs = {${ JSON.stringify(excludedMethods).slice(1,-1) }}
    wrongs          = set()

    class ExclusionsVisitor(ast.NodeVisitor):
        ${ attrChecker }
        ${ kwsChecker }

        #----------------------------------------------

        def _check_those(self, *stuff:str, gather_all=False):
            if gather_all:
                for kw in stuff:
                    if kw in forbidden_kws:
                        wrongs.add( kw.replace('_',' ') )
            else:
                for kw in stuff:
                    if kw in forbidden_kws:
                        wrongs.add( kw.replace('_',' ') )
                        break

        def _visit_loop(self, node, name:str, stuff:str, is_comp, is_async):
            to_check = (stuff,)
            if stuff=='for':
                to_check += ('for_comp',) if is_comp else ('for_inline',)
            if not is_comp and node.orelse:
                to_check += ('else', stuff+'_else')
            if is_comp and node.ifs:
                to_check += ('if',)
            if is_async:
                to_check += ('async', 'async_'+stuff)
            self._check_those(*to_check, gather_all=True)
            super().generic_visit(node)

        def visit_tries(self, node):
            to_check = ('try',)
            if node.orelse:
                to_check += ('else', 'try_else')
            if node.finalbody:
                to_check += ('finally',)
            self._check_those(*to_check, gather_all=True)
            super().generic_visit(node)

        def visit_ifs(self, node, kw='if', next_in_line='elif'):
            if kw in forbidden_kws:
                wrongs.add(kw)
            self.visit(node.test)
            for child in node.body: self.visit(child)
            for child in node.orelse:
                if isinstance(child, ast.If):
                    self.visit_If(child, next_in_line, next_in_line)
                elif 'else' in forbidden_kws:
                    wrongs.add('else')
                    self.visit(child)

    ExclusionsVisitor().visit(tree)

    if wrongs:
        to_clean_up = {'f str', 'f string'}
        if to_clean_up & wrongs:
            wrongs -= to_clean_up
            wrongs.add('f-string')
        msg = ', '.join(sorted(wrongs, key=str.casefold))
        raise ExclusionError.throw(msg)
`
    pyodide.runPython(checkCode)
}



/* NOTE: `as` keyword logistic has been removed */
const EXCLUSION_CLASSES = {

  "and":      ["And"],
  "assert":   ["Assert"],
  "async":    ["AsyncFor","AsyncWhile","AsyncWith","AsyncFunctionDef","+comprehension"],
  "async_def":["AsyncFunctionDef"],
  "async_for":["AsyncFor","+comprehension"],
  "async_with": ["AsyncWith"],
  "await":    ["Await"],
  "break":    ["Break"],
  "case":     ["match_case"],
  "class":    ["ClassDef"],
  "continue": ["Continue"],
  "def":      ["FunctionDef","AsyncFunctionDef"],
  "del":      ["Delete"],
  "elif":     ["+If"],
  "else":     ["+For","+AsyncFor","+While","+AsyncWhile","+If","+IfExp","+Try"],
  "except":   ["ExceptHandler"],
  "f_str":    ["JoinedStr"],
  "f_string": ["JoinedStr"],
  "False":    ["+Constant"],
  "finally":  ["+Try", "+TryStar"],
  "for":      ["For","AsyncFor","comprehension"],
  "for_else": ["+For","+AsyncFor"],
  "for_comp": ["comprehension"],
  "for_inline": ["For"],
  "from":     ["ImportFrom","YieldFrom","+Raise"],
  "from_import": ["ImportFrom"],
  "global":   ["Global"],
  "if":       ["+comprehension","+If","+IfExp"],
  "import":   ["Import","ImportFrom"],
  "is":       ["Is","IsNot"],
  "is_not":   ["IsNot"],
  "in":       ["In","NotIn"],
  "lambda":   ["Lambda"],
  "match":    ["Match"],
  "None":     ["+Constant"],
  "nonlocal": ["Nonlocal"],
  "not":      ["Not","NotIn","IsNot"],
  "not_in":   ["NotIn"],
  "or":       ["Or"],
  "pass":     ["Pass"],
  "raise":    ["Raise"],
  "raise_from": ["+Raise"],
  "return":   ["Return"],
  "True":     ["+Constant"],
  "try":      ["Try", "TryStar"],
  "try_else": ["+Try", "+TryStar"],
  "while":    ["While"],
  "while_else": ["+While"],
  "with":     ["With","AsyncWith"],
  "yield":    ["Yield","YieldFrom"],
  "yield_from": ["YieldFrom"],
  "+":        ["UAdd","Add"],
  "-":        ["USub","Sub"],
  "*":        ["Mult"],
  "/":        ["Div"],
  "//":       ["FloorDiv"],
  "%":        ["Mod"],
  "**":       ["Pow"],
  "~":        ["Invert"],
  "<<":       ["LShift"],
  ">>":       ["RShift"],
  "|":        ["BitOr"],
  "^":        ["BitXor"],
  "&":        ["BitAnd"],
  "@":        ["MatMult"],
  "==":       ["Eq"],
  "!=":       ["NotEq"],
  "<":        ["Lt"],
  "<=":       ["LtE"],
  ">":        ["Gt"],
  ">=":       ["GtE"],
  ":=":       ["NamedExpr"],
  "=":        ["Assign","AnnAssign","AugAssign"],
}



const CUSTOM_SNIPPET = {
  Constant: `
        def visit_Constant(self, node:ast.Constant):
            self._check_those( repr(node.value) )
`,
  For:        `
        def visit_For(self, node):
            self._visit_loop(node, "For", "for",False, False)
`,
  AsyncFor:   `
        def visit_AsyncFor(self, node):
            self._visit_loop(node, "AsyncFor", "for", False, True)
`,
  While:      `
        def visit_While(self, node):
            self._visit_loop(node, "While", "while", False, False)
`,
  AsyncWhile: `
        def visit_AsyncWhile(self, node):
            self._visit_loop(node, "AsyncWhile", "while", False, True)
`,
  comprehension: `
        def visit_comprehension(self, node):
            self._visit_loop(node, "comprehension", "for", True, node.is_async)
`,
  If: `
        def visit_If(self, node): self.visit_ifs(node, 'if','elif')
`,
  IfExp: `
        def visit_If(self, node): self.visit_ifs(node, 'if','if')
`,
  Try: `
        def visit_Try(self, node): self.visit_tries(node)
  `,
  TryStar: `
        def visit_TryStar(self, node): self.visit_tries(node)
  `,
  Raise: `
        def visit_Raise(self, node:ast.Raise):
            self._check_those('raise')
            if node.cause:
                self._check_those('from', 'raise_from')
            super().generic_visit(node)
  `,
}