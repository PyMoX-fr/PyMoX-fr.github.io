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
import { PythonError, sleep } from 'functools'
import { pyodideFeatureRunCode } from '0-generic-python-snippets-pyodide'






/**Explore the user's code to find missing Python packages to install. If some are found,
 * load micropip (if not done yet), then install all the missing modules.
 * This also imports all the packages present in runner.whiteList and handles python_libs.
 *
 * NOTE:
 *    python_libs are identified by picking into the global config, but are actually loaded
 *    only if they are available in the Runner instance property (this is to limit _SAVAGE_/
 *    unexpected installations of random packages from PyPI).
 * */
export const installPythonPackages=(function(){


  /*Things are (very) complicated, here...
   *
   * OBSERVATIONS/GOALS:
   *
   *    * Installing packages via micropip doesn't actually import them in the environment (it
   *      works the same for custom python libs).
   *
   *    * The theme needs to know up front what packages are missing or not, to decide when to
   *      display installation messages or not.
   *
   *    * _Installed_ packages can be found through micropip, but NOT loaded python_libs.
   *
   *    So, spotting missing packages relies on picking in sys.modules.
   *    BUT, modules actually end up there _ONLY_ if a python code actually imported them, going
   *    through `import xxx`.
   *    So far, so good. Problems arise with additional features:
   *
   *
   * ADDITIONNAL CONSTRAINTS:
   *
   *    * White lists:
   *        - their content has to be actually imported in the global scope, so that they are
   *          actually available to the user.
   *
   *    * Custom libs:
   *        - They have to be imported in pyodide _right now_, so that they end up listed in
   *          `sys.modules`.
   *        - This makes them visible as "installed" on a next import/installation attempt...
   *        - ...which may occur right after the current call because imports in terminals commands
   *          may go through env, then envTerm, and BOTH will check if an import has to be done in
   *          the terminal command.
   *
   *    * Packages with different installation and import names (ex: Pillow vs PIL):
   *        Packages whose the installation name differs from the import name have to be
   *        automatically imported for the user, so that they are usable in the "triggering" code.
   *
   *    * Exclusions:
   *        - They are not applied on env sections, so modules _can_ be installed/loaded here
   *          so they _have_ to be actually imported (to avoid several installations: see above)...
   *        - ..._BUT_ hidden inside a function, so that they do not leak in the global scope.
   *        - Then the redactor's import (from the `env` or `env_term` code itself) will determine
   *          if the module ends up in the global scope or not.
   *
   *
   * CONCLUSIONS:
   *
   *    For those reasons, all packages that are "installed" will always be imported in a hidden
   *    scope, so that they get registered in sys.modules.
   *
   *    Since the "triggering code" (env code, user code, cmd, ...) still has to be executed,
   *    afterward, the actual visibility of the module is left to the redactor/user, and:
   *        - All automatic installs/imports are done in a hidden scope.
   *        - Packages of the whiteList are all imported in the global scope, whatever happens or
   *          the configuration of exclusions/sections, ...
   * */




  const FORBID_EXTERNALS = new Set(['py_lib', 'pylib', 'pylibs', 'py-lib', 'py-libs'])
  const PMT_TOOLS = ['p5', 'vis', 'vis_network']      // GENERATED


  /**In most cases, installations will be done once only (since no module will be installed
   * several times!), but just in case (to avoid troubles with later changes... Without that,
   * a script tag/load could end up loaded at each call of `asyncJsScriptCdnLoader`).
   * */
  const CACHE_JS_INSTALLED = new Set()



  const featureRunner = (feature, outputConverter=null) => (repl=null) =>{
    let out = pyodideFeatureRunCode(feature, repl)
    if(outputConverter) out = outputConverter(out)
    return out
  }



  /**Dynamically load a JS script tag (sync) at runtime.
   * (Loaded scripts names are cached, to avoid multiple imports)
   * */
  const asyncJsScriptCdnLoader = (name, scriptOptions={})=> async ()=>{
    if(CACHE_JS_INSTALLED.has(scriptOptions.src)){
      console.log(name, 'already loaded...')
      return
    }
    _loadScript(scriptOptions.src)

    console.log(`Loading ${ name }...`)
    while(!CACHE_JS_INSTALLED.has(scriptOptions.src)){
      await sleep(50)
    }
    console.log(name, 'ready')
  }


  const multiCdnsLoader = (name, ...cdns)=> async ()=>{
    cdns = cdns.map(data=>
      typeof(data)=='string' ? {src:data} : data
    )
    const targets = cdns.map(o=>o.src)
    cdns.forEach(o=>_loadScript(o))

    console.log(`Loading ${ name }...`)
    while(targets.some(src=> !CACHE_JS_INSTALLED.has(src) )){
      await sleep(50)
    }
    await sleep(50)   // add one more cycle, just in case...
    console.log(name, 'ready')
  }


  const _loadScript=(scriptOptions)=>{
    scriptOptions = {
      crossorigin:    "anonymous",
      referrerpolicy: "no-referrer",
      ...scriptOptions
    }
    const script = document.createElement('script')
    script.addEventListener("load", function(){ CACHE_JS_INSTALLED.add(scriptOptions.src) })
    for(const k in scriptOptions){
      if(k=='src') continue             // Always set last...
      script[k] = scriptOptions[k]
    }
    script.src = scriptOptions.src      // Always set LAST (I don't remember why...)
    document.body.appendChild(script)
  }

  const checkImportAsNamespaceOnly=(name)=>(code, _conf)=>{
    const badImport = new RegExp(`from ${ name }\\S* import`).test(code)
    if(badImport){ throw new PythonError(
      `ImportError: Invalid ${ name } import.\nThe ${ name } module must be used as a namespace.`
      +`Example:\n    import ${ name }\n    ${ name }.functionName(...)`
    )}
  }

  const confImportWithPostCdn=(name, options, codeCheck=null)=>{
    if(!Array.isArray(options)) options = [options]
    return {
      [name]: {
        codeCheck: codeCheck ?? checkImportAsNamespaceOnly(name),
        toImport: name,
        post: multiCdnsLoader(name, ...options)
      }
    }
  }





  const pyodidePlotRunner = featureRunner('pyodidePlot')

  const visCdns = [
    "https://unpkg.com/vis-network/standalone/umd/vis-network.min.js",
    "https://unpkg.com/vis-timeline/standalone/umd/vis-timeline-graph2d.min.js",
    "https://unpkg.com/vis-graph3d/standalone/umd/vis-graph3d.min.js",
  ]


  /**IMPORTS_CONFIG type:
   *
   *   Record<
   *     PackageName,                  // (string) Name used in the import statement (user's code)
   *     {
   *       codeCheck: Cbk[code,conf]   // Verifications to apply to the code content first
   *       toInstall: string|string[], // Micropip installation name
   *       post:      async Cbk,       // Callback to run to apply any kind of extra logic
   *       toImport:  string,          // Automatic import name, at the very end (in hidden scope)
   *     }
   *   >
   * */
  const IMPORTS_CONFIG = {
    matplotlib: {
      post: async ()=>{ pyodidePlotRunner() }
    },
    sympy: {
      toInstall: ["matplotlib", "sympy"],
      post: async ()=>{
        pyodidePlotRunner()
        pyodide.runPython("PyodidePlot.sympy_backend()")
      }
    },
    PIL: {
      toInstall: "Pillow"
    },
    ...confImportWithPostCdn('p5', "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.0/p5.min.js"),
    ...confImportWithPostCdn('vis', visCdns),
    ...confImportWithPostCdn('vis_network', visCdns),
  }




  /**Routine managing the actual import logic, storing the name of the module/package
   * to import later (hidden scope).
   *
   * @returns: the actual config object.
   * */
  const getConfAndSetupImport = (name, code) =>{

    const conf = {
      codeCheck: (_)=>undefined,
      toImport:  name,
      toInstall: name,
      post:      async ()=>undefined,
      ...IMPORTS_CONFIG[name] || {}
    }

    conf.codeCheck(code, conf)
    enforceImports.push( conf.toImport )
    return conf
  }


  /**Install an available custom python_lib.
   * */
  const installCustomPythonLib = async (libName, code) => {
    LOGGER_CONFIG.ACTIVATE && jsLogger("[Installer] - Install", libName)

    const conf        = getConfAndSetupImport(libName, code)
    const isPmtTool   = PMT_TOOLS.includes(libName)
    const rootNoSlash = CONFIG.siteUrl.replace(/\/$/, '')
    const archive     = `${ rootNoSlash }${ isPmtTool?"/assets/javascripts":"" }/${ libName }.zip`
    let zipResponse, oops=false
    try{
      zipResponse = await fetch(archive)
    }catch(e){
      oops = true
    }
    if(oops || !zipResponse.ok){
      throw Error(
        `Couldn't fetch a PMT python_lib ressource at ${ archive }.\nPlease check the followings:\n`+
        "  - The `python_lib` is actually available in the page (see metadata files and markdown headers).\n"+
        "  - The `site_url` value in the mkdocs.yml config file of your project is correct."
      )
    }
    const zipBinary = await zipResponse.arrayBuffer()
    pyodide.unpackArchive(zipBinary, "zip", {extractDir: libName})
    await conf.post()
  }


  /**Install an external python package (through pyodide's default behaviors: micropip+PyPI).
   * */
  const installExternalPackage = async (libName, code) => {
    LOGGER_CONFIG.ACTIVATE && jsLogger("[Installer] - Install", libName)

    if(!micropip){
      await pyodide.loadPackage("micropip");
      micropip = pyodide.pyimport("micropip");
    }
    const conf = getConfAndSetupImport(libName, code)
    await micropip.install(conf.toInstall)   // Nothing done if already installed element(s) => no check needed.
    await conf.post()
  }



  /**Some standard libs are available, but not already imported (like statistics, for example).
   * So a basic import is tried first.
   * Note: to NOT apply on forbidden packages!
   */
  const attemptStandardLibImports=(importableLibs)=>{
    const installNeeded = []

    for(const lib of importableLibs){
      try{
        pyodide.runPython(`
def __hack_std_import_attempt():
    import ${ lib }
__hack_std_import_attempt()
`)
      }catch(e){
        installNeeded.push(lib)
      }
    }

    if(installNeeded.length != importableLibs.length){
      pyodide.runPython(`del __hack_std_import_attempt`)
    }
    return installNeeded
  }




  /**Extract all the packages names currently available in pyodide. */
  const getAlreadyImportedPackagesAsSet = featureRunner("alreadyImported", out=>new Set(out.split(' ')) )

  /**Rely on pyodide to analyze the code content and find the imports the user is trying to use. */
  const getWantedImports = featureRunner("wantedImports")


  const predicatesFactory=(runner)=>{

    const importedModules  = getAlreadyImportedPackagesAsSet()
    const predicates = {
      isNotImportedYet:     (name) => !importedModules.has(name),
      isNotWhiteList:       (name) => !runner.whiteList.includes(name),
      isExcluded:           (name) =>  runner.excluded.includes(name),
      isNotPyPiAllowed:     (name) =>  runner.pypiWhite  && !runner.pypiWhite.includes(name),
      isAvailablePythonLib: (name) =>  runner.pythonLibs.has(name) ||  PMT_TOOLS.includes(name),
      isNotKnownPythonLib:  (name) => !CONFIG.pythonLibs.has(name) && !PMT_TOOLS.includes(name),
      isWrongPyLib:         (name) =>  FORBID_EXTERNALS.has(name),
    }
    return predicates
  }


  const throwExclusionErrorIfNeeded = (ctx, arr, head="", extraMsg="")=>{
    if(ctx.applyExclusionsIfAny && arr.length){
      pyodide.runPython(`ExclusionError.throw("${ arr.join(', ') + extraMsg }", ${ head })`)
    }
  }


  const runPythonImportsIfAny = (arrCmds, scoped) =>{
    if(!arrCmds.length) return;

    arrCmds = arrCmds.map(lib=>'import '+lib)

    const code = !scoped ? arrCmds.join('\n') : `
def _hack_imports():
    ${ arrCmds.join('\n    ') }
_hack_imports()
del _hack_imports`  // (not using the auto_run decorator because it might not be already in place)

    pyodide.runPython(code)
  }



  // ------------------------------------------------------------------------------



  let   micropip
  const enforceImports = []   // python lib names to import at the end (in hidden scope)



  return async (runtime, ctx)=>{
    LOGGER_CONFIG.ACTIVATE && jsLogger('[Installer] - installPythonPackages')

    enforceImports.length = 0       // Reset global

    const runner = runtime.runner
    const code   = ctx.code

    const wantedLibs = getWantedImports(code).toJs()
    const pred       = predicatesFactory(runner)


    // Spot exclusions FIRST (otherwise attemptStandardLibImports could actually import
    // some standard libs...):
    const maybeUndesired = wantedLibs.filter(pred.isNotWhiteList)
    const excluded       = maybeUndesired.filter(pred.isExcluded)
    throwExclusionErrorIfNeeded(ctx, excluded)


    const neededLibs      = wantedLibs.concat(runner.whiteList).filter(pred.isNotImportedYet)
    const installNeeded   = attemptStandardLibImports(neededLibs)
    const pyLibsNeeded    = installNeeded.filter(pred.isAvailablePythonLib)
    const externalsNeeded = installNeeded.filter(pred.isNotKnownPythonLib)

    LOGGER_CONFIG.ACTIVATE && jsLogger('[Installer] - pyLibsNeeded',    pyLibsNeeded)
    LOGGER_CONFIG.ACTIVATE && jsLogger('[Installer] - externalsNeeded', externalsNeeded)
    /*
    pyLibsNeeded:
          Import names matching an available python_lib, compared against runner.pythonLibs,
          because only the available ones in the current IDE can be downloaded.

    externalsNeeded:
          Imports names that will attempt installation from PyPI.
          Names checked against CONFIG.pythonLibs so that an unavailable custom lib doesn't
          trigger a "savage install" from PyPI.
    */


    // Check misspelled py_libs imports first (at this point, they are seen as external requests)
    const wrongs  = externalsNeeded.filter(pred.isWrongPyLib)
    const verb    = wrongs.length-1 ? "are":"is"
    const msgTail =` ${ verb } forbidden for security reasons.\\n\\nDid you mean?   import py_libs`
    throwExclusionErrorIfNeeded(ctx, wrongs, "'Import of '", msgTail)

    // pypiWhite restrictions only apply to external requests:
    const invalid = externalsNeeded.filter(pred.isNotPyPiAllowed)
    throwExclusionErrorIfNeeded(ctx, invalid, "'cannot install '" )


    // Actual installations. NOTE: these are ONLY installation, not executions, meaning the order
    // of the installations has no importance.
    if(pyLibsNeeded.length || externalsNeeded.length){

      runner.giveFeedback(CONFIG.lang.installStart.msg, null)
      for(const lib of pyLibsNeeded)    await installCustomPythonLib(lib, code)
      for(const lib of externalsNeeded) await installExternalPackage(lib, code)
      runner.giveFeedback(CONFIG.lang.installDone.msg, null)
    }


    // Enforce imports of all installed modules in hidden scope, to be sure they end up in
    // sys.modules (not using the auto_run decorator because it might not be already in place).
    runPythonImportsIfAny(enforceImports, true)

    // Make sure white listed packages are always visible in the user's scope:
    // (DON'T filter out already imported modules from the white list because they could have
    // been imported in a different scope!)
    runPythonImportsIfAny(runner.whiteList, false)
  }
})()
