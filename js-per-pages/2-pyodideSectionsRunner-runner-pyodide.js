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
  RunningProfile,
  decompressPagesIfNeeded,
  noStorage,
  renderMermaidGraphs,
  sleep,
  unEscapeSquaredBrackets,
  withPyodideAsyncLock,
  youAreInTroubles,
} from 'functools'
import { _DUMMY } from 'process_and_gui'   // Enforce dependencies order (if ever a runner is needed)

import { pyodideFeatureRunCode } from '0-generic-python-snippets-pyodide'
import { RuntimeManager } from '1-runtimeManager-runtime-pyodide'
import { RUNNERS_MANAGER } from '2-0-runnersManager-runners'













class PyodideSectionsRunnerBase {

  static pyFuncs = {}

    no_undefined = prop =>{
        const getter = v => {
          if(v!==undefined) return v
          throw new Error(`Undefined is not allowed: ${this.constructor.name}.${prop}.`)
        }
        return getter
    }

    // Getters so that the RunnersManager can identify which is what more easily (if ever needed)
  get isRunner()   { return true  }   // Always true, so far... Kept just in case
  get isPyBtn()    { return false }
  get isTerminal() { return false }
  get isIde()      { return false }
  get hasTerminal(){ return false }

  get isDelayedRevelation(){
    return this.profile === CONFIG.PROFILES.delayedReveal
  }


  //JS_CONFIG_DUMP
  get attemptsLeft()      { return this.data.attempts_left }
  get autoLogAssert()     { return this.data.auto_log_assert }
  get autoRun()           { return this.data.auto_run }
  get corrContent()       { return this.data.corr_content }
  get corrRemsMask()      { return this.data.corr_rems_mask }
  get cutFeedback()       { return this.data.cut_feedback }
  get deactivateStdoutForSecrets(){ return this.data.deactivate_stdout_for_secrets }
  get decreaseAttemptsOnUserCodeFailure(){ return this.data.decrease_attempts_on_user_code_failure }
  get envContent()        { return this.data.env_content }
  get envTermContent()    { return this.data.env_term_content }
  get excluded()          { return this.data.excluded }
  get excludedKws()       { return this.data.excluded_kws }
  get excludedMethods()   { return this.data.excluded_methods }
  get export()            { return this.data.export }
  get hasCheckBtn()       { return this.data.has_check_btn }
  get hasCorrBtn()        { return this.data.has_corr_btn }
  get hasCounter()        { return this.data.has_counter }
  get hasRevealBtn()      { return this.data.has_reveal_btn }
  get isVert()            { return this.data.is_vert }
  get maxIdeLines()       { return this.data.max_ide_lines }
  get minIdeLines()       { return this.data.min_ide_lines }
  get orderInGroup()      { return this.data.order_in_group }
  get postContent()       { return this.data.post_content }
  get postTermContent()   { return this.data.post_term_content }
  get prefillTerm()       { return this.data.prefill_term }
  get profile()           { return this.data.profile }
  get publicTests()       { return this.data.public_tests }
  get pyName()            { return this.data.py_name }
  get pypiWhite()         { return this.data.pypi_white }
  get pythonLibs()        { return this.data.python_libs }
  get recLimit()          { return this.data.rec_limit }
  get removeAssertionsStacktrace(){ return this.data.remove_assertions_stacktrace }
  get runGroup()          { return this.data.run_group }
  get secretTests()       { return this.data.secret_tests }
  get seqPlay()           { return this.data.seq_play }
  get seqRun()            { return this.data.seq_run }
  get showOnlyAssertionErrorsForSecrets(){ return this.data.show_only_assertion_errors_for_secrets }
  get srcHash()           { return this.data.src_hash }
  get stdKey()            { return this.data.std_key }
  get stdoutCutOff()      { return this.data.stdout_cut_off }
  get twoCols()           { return this.data.two_cols }
  get userContent()       { return this.data.user_content }
  get whiteList()         { return this.data.white_list }
  //JS_CONFIG_DUMP

  // Control stdout display during executions
  get allowPrint()     { return this._manager.allowPrint }
  set allowPrint(flag) { this._manager.allowPrint = flag }

  constructor(id, callInit=true){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - Constructor for', this.constructor.name, id)

    decompressPagesIfNeeded()


    this.id = id
    this.data = this._dataPostConversion(PAGE_IDES_CONFIG[id])   // Inner mutable object holding infos coming from mkdocs
    this.getCodeToTest = ()=>"" // If no editor, nothing to test...
    this.running = undefined    // RunningProfile.build output (object of boolean flags, mostly)
    this.isGuiCompliant = false // All the GUI makeup has been applied (may not always be, typically for hidden tabbed contents)

    this.runners = RunningProfile.buildDefaultRunnersObject() // Hold all the async callbacks related to events (but only
                                                              // the part of the logic disconnected to the UI itself)

    if(CONFIG._devMode)
      CONFIG.objs[this.id] = this
    else{
      delete PAGE_IDES_CONFIG[id]
    }

    if(callInit) this._init()

    RUNNERS_MANAGER.registerRunner(this)
  }


  /**Apply any desired data conversion on the info coming directly from mkdocs, before they are used.
   * */
  _dataPostConversion(data){
    data.python_libs = new Set(data.python_libs)
    return data
  }



  _init(){}         // Super calls sink...

  buildRunners(){
    throw new Error("buildRunners() is not implemented (should have been overridden).")
  }



  addRunnerIfNotDefinedYet(routine, runningProp='', asDefault=false){

    // Build an additional version of the routine that wont return anything (useful for
    // events bindings, to avoid any interaction with their logic)
    routine.asEvent ??= RUNNERS_MANAGER.wrapForEventAndSequentialRunIfNeeded(
      this, runningProp, routine, this.seqRun,
    )
    this.runners[ runningProp || "default" ] ??= routine
    if(asDefault) this.runners.default ??= routine
  }


  build(){
    this.buildRunners()

    // Using setTimeout to be sure the `build` step will be complete (some children classes
    // may have subsequent operations after the super method, aka, has been called here).
    if(this.autoRun){
      setTimeout(async ()=>await this.applyAutoRun())
    }
  }


  /**Actions to perform when the element becomes "visible" in the page.
   * Here "visible" means "not hidden", CSS-wise (see `=== "tabbed"`, typically).
   * */
  makeUpYourGui(){        // Cap overload
    return this.isGuiCompliant = true
  }



  /** Generic call for macros with AUTO_RUN=True (once the runner callback is defined...).
   * */
  async applyAutoRun(){
    await this._defaultAutoRun()
  }

  /**Allow to keep the same implementation for the IDE class, while the intermediate Terminal
   * class has its own logic for autoRun.
   * */
  async _defaultAutoRun(){
    while(!this.runners.default) await sleep(40)
    await this.runners.default()
  }


  /**Store code or command in the python runtime.
   * */
  storeUserCodeInPython(varName, code){
    const showOff = JSON.stringify(code.length>50 ? code.slice(0,50)+' ...' : code)
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - Store ', varName, showOff)

    // The double quotes are all escaped to make sure no multiline string will cause troubles
    const escapedCode = code.replace(/"/g, '\\"')
    pyodide.runPython(`__builtins__.${ varName } = """${ escapedCode }"""`)
  }



  /**Runners without any terminal won't ever give feedback, unless it's a critical error.
   * In that case, a window alert will be used, so that it doesn't go unnoticed.
   * */
  giveFeedback(content, format='error'){
    if(content && format=='error'){
      // Format back any escaped square brackets, because window.alert is not the terminal...
      window.alert( unEscapeSquaredBrackets(content) )
    }
  }



  /**Creates a generic "action runner", handling the overall security logic, catching exceptions
   * that are thrown up to this point and displaying them in a BigFail-fashion-way in the terminal.
   *
   * Contracts:
   *    - @setup takes the `e` (event) argument only and returns a RuntimeManager instance.
   *      The argument may be:
   *        * either an `Event`: then it has no use.
   *        * or the current terminal command (`string`) that just got validated in the console.
   *    - @action takes the runtime argument and returns nothing
   *    - @finallyTeardown takes the runtime argument and returns nothing.
   *
   * About executions:
   *    - @actionName : RunningProfile.PROFILES value to be able to identify what's currently running.
   *    - @setup is always run
   *    - @action is always called, and it is its job to decide if it has to actually run its
   *       logic or not, depending on the `runtime` state.
   *    - @finallyTeardown is always called, and should contain all the operations that HAVE
   *       to be run whatever happened before (success/error). Both are almost guaranteed to
   *       happen, whatever the outcome of the others executions was: the only exception would
   *       be a crash during @setup, that wouldn't return any `runtime` object (this would lead
   *       to a BIG_FAIL error thrown in he JS console).
   *
   * @returns: The RuntimeManager object (needed to handle sequential runs. Events are bound with
   *           a version of the function that doesn't return anything, keeping the legacy behavior)
   * */
  lockedRunnerWithBigFailWarningFactory(
    actionName,       // string, logging purpose + used to identify what's currently running.
    setup,            // async, args: eventOrTermCmdString
    action,           // async, args: runtime
    finallyTeardown,  // async, args: runtime (guaranteed to run)
    sendEventOrRuntimeToAction = false,   // Useful for drag & drop (IDE zip imports)
  ){
    const loggerName = `[${actionName}]`
    const runningMan = RunningProfile.build(actionName)

    return withPyodideAsyncLock(actionName, async(eventOrCmd, ...args)=>{
      if(eventOrCmd && eventOrCmd.preventDefault) eventOrCmd.preventDefault()
      LOGGER_CONFIG.ACTIVATE && jsLogger(loggerName)

      CONFIG.calledMermaid = false
      this.makeDirty(false)       // Assume executions will go well (see note in finally block)
      this.running = runningMan
      let runtime

      try{
        runtime = await setup.call(this, eventOrCmd)
        const callArgs = sendEventOrRuntimeToAction ? [eventOrCmd, ...args] : [runtime]
        await action.apply(this, callArgs)
        return runtime

      }catch(e){
        LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - BIG FAIL", actionName)

        // If something didn't get caught, it's very wrong... so give feedback to the user
        // in BIG and RED:
        const stdErr = youAreInTroubles(e)
        this.giveFeedback(stdErr)

        if(runtime){                  // runtime may be undefined JS error during setup...
          runtime.gotBigFail = true
          runtime.stdErr     = stdErr
        }
        throw e

      }finally{
        LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - finally", actionName)

        // For isDirty update, DO NOT only rely on `this.isDirty = runtime.stopped`, so that the
        // runner itself can set the value on a success if needed, and it won't be overridden here
        // (useful if a valid "play" is still considered dirty when a validation exists...).
        if(!runtime || runtime.stopped){
          this.makeDirty()
        }

        if(runtime){
          await finallyTeardown.call(this, runtime)
        }
        this.running = undefined
      }
    })
  }





  /**Build the default configuration runtime to use to run the user's code.
   * */
  setupGlobalConfig(){
    CONFIG.runningInfos = {
      action: this.running.name,
      htmlId: this.id,
      attemptsLeft: this.data.attempts_left,
      errorMsg: "",
    }

    for(const prop of 'get del set keys'.split(' ')){
      const globName = prop+'Storage'
      const method   = `pyodide${ _.capitalize(prop) }Storage`
      globalThis[globName] = this[method].bind(this)    // Legacy behavior
    }
    this.setupTerminalMessageRoutine()
  }


  setupTerminalMessageRoutine(){
    if(this.rotateTerminalMessage){
      CONFIG.termMessage = this.termFeedbackFromPyodide.bind(this)
    }
  }


  pyodideGetStorage(key)  { noStorage() }   // sink
  pyodideKeysStorage()    { noStorage() }   // sink
  pyodideSetStorage(k, v) { noStorage() }   // sink
  pyodideDelStorage(key)  { noStorage() }   // sink


  resetElement(){}    // sink

  makeDirty(){ throw new Error('Not implemented') } // sink with security

  /**Lock the terminal (if any) */
  lockDisplay(){}     // sink

  /**Unlock the terminal (if any) */
  unlockDisplay(){}   // sink

  /**Give focus to the default element. */
  focusElement(){}    // sink

  /**Activate or deactivate automatic focusing behaviors. */
  activateFocus(bool){}   // sink

  /**Method bound and assigned to CONFIG/terminalMessage, to automatically redirect python
   * calls to `terminal_message` to the current terminal's display. */
  termFeedbackFromPyodide(){}   // sink

  /**Generic steps to apply at the very end of a `runPythonCodeWithOptionsIfNoStdErr` call. */
  codeSnippetEndFeedback(runtime, step, code){}   // sink





  /** 1. Refresh the features defined in pyodide environment, in case the user messed with them
   *     (accidentally or not).
   *  2. Then run the content of the `env` section.
   *
   * @returns: RuntimeManager object.
   * */
  async setupRuntime(srcRuntime=null, section='env'){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - setupRuntime PyodideSectionsRunner')

    const runtime = await this._baseSetupRuntime(srcRuntime, section)
    await runtime.runWithCtx(section)
    return runtime
  }


  async _baseSetupRuntime(srcRuntime, section){
    this.setupGlobalConfig()
    const runtime = srcRuntime || new RuntimeManager(this)
    await runtime.runWithCtx({
      section:    section ?? 'env',
      method:     this.refreshPyodideFeatures,
      autoImport: false,    // Nothing to install, when redeclaring the Pyodide Features!
    })
    return runtime
  }


  refreshPyodideFeatures(){
    ;`
      ioStuff
      version
      localStorageRelays
      copyFromServer
      exclusionsTools
      mermaidDrawer
      refresher
      upDownLoader
    `.trim()
     .split(/\s+/)
     .forEach(pyodideFeatureRunCode)
  }





  /**Takes a user code as argument, and run it in the pyodide environment, using various runtime
   * logics. It mutates the RuntimeManager objects on the way, keeping track of the current state
   * of the executions (error or not, keep running or not, ...).
   *
   * Operations done:   (TODO: this is outdated...)
   *    1. Run methods exclusion check (if not needed, the method is called but won't do anything).
   *    2. If the runtime is marked as stopped, stop here.
   *    3. Try to install/import missing packages or python_libs.
   *    4. If the runtime is marked as stopped, stop here.
   *    5. Actually run the given code in Pyodide.
   *
   * @throws: Any JS runtime Error if something went very wrong... (python errors are swallowed
   *          and just printed to the jQuery.terminal)
   * */
  async runPythonCodeWithOptionsIfNoStdErr(code, runtime, testsStep){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - Enter generic running function')

    // Do nothing if nothing to do...!    (TODO: I _think_, this step is now useless...? Maybe not...)
    if(runtime.stopped) return;

    const someCodeToRun = code.trim()
    if(someCodeToRun){

      // Code Runtime configuration:
      const ctx = {
        code,
        section: 'code',
        logConfig: {
          code,
          purgeTrace: runtime.purgeStackTrace,
          autoAssertExtraction: runtime.autoLogAssert,
          purgeAssertionTrace: this.removeAssertionsStacktrace, // This is independent of the step running => not
                                                                // tide to `runtime`, but directly to the runner.
        },
        asyncSecrets: testsStep === CONFIG.section.secrets,
        method: async (ctx)=>{
          if(ctx.asyncSecrets){
            await pyodide.runPythonAsync(ctx.code)
          }else{
            pyodide.runPython(ctx.code)
          }
        },
        isEnvSection: false,
        applyExclusionsIfAny: true,
      }

      // No ast exclusions for validations' code:
      if(testsStep!==CONFIG.section.editor){
        ctx.kwsExclusions = ctx.methodsExclusions = false
      }

      await runtime.runWithCtx(ctx)
    }

    // Potentially give some feedback in the terminal to the user, about what happened:
    this.codeSnippetEndFeedback(runtime, testsStep, code)
  }




  async teardownRuntime(runtime){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - PyodideSectionsRunner teardownRuntime")

    await runtime.runWithCtx('post')
    this.renderPyodideGeneratedMermaids(runtime)
    await this._baseTeardownRuntime(runtime)
  }

  async _baseTeardownRuntime(runtime){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - teardown pyodide cleaner")
    pyodideFeatureRunCode('autoRunCleaner')
    runtime.cleanup()
  }



  renderPyodideGeneratedMermaids(runtime){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - teardown mermaid")

    if(!CONFIG.needMermaid || !CONFIG.calledMermaid){
      return
    }

    if(!globalThis.mermaid){
      this.giveFeedback(
        'Cannot convert to mermaid graph: mermaid is not available.\n'
        +'Please contact the author of the exercice.'
      )
    }
    renderMermaidGraphs()
  }
}












class PyodideSequentialRunner extends PyodideSectionsRunnerBase {


  get isStarredGroup()   { return !this.orderInGroup }
  get isInSequentialRun(){ return this.runGroup != -1 }


  constructor(id){
    super(id)

    this.rotateTerminalMessage = true
    this.isDirty = true         // Tell if the last run wa successful or not, or if the content has been modified
                                // without being run (handled unconditionally for all elements, even if they aren't
                                // "in sequential run". The RUNNERS_MANAGER handles what is actually to be run or not).
  }


  makeDirty(isDirty=true){
    this.isDirty = isDirty
    RUNNERS_MANAGER.overridePriorityElement(this)
  }

  resetElement(){
    super.resetElement()
    this.makeDirty()
  }


  /**If an html element is passed in, scroll it into view.
   * */
  scrollIntoView(element=undefined){
    if(element){
      const currentElement = $('#'+this.id)
      this.unhideTabbedContentIfNeeded(currentElement)
      element.scrollIntoView({
        block:"center", inline:"nearest", behavior:"smooth",
      })
      // this.focusElement()        // Doesn't work... :/
    }
  }


  /**Recursively reveal elements that are inside tabbed contents (`=== "..."`).
   * @returns: true if something had been revealed.
   * */
  unhideTabbedContentIfNeeded(jElement){
    const parent = jElement && jElement[0] && jElement.parents('.tabbed-block')

    if(!parent || !parent[0] || parent.is(':visible')){
      return false
    }

    // Unhide possible parents layers first:
    this.unhideTabbedContentIfNeeded(parent)

    // Extract the related label nad triggers it:
    const nthChild = 1 + parent.index()
    const label = parent.parent().prev().children(`:nth-child(${ nthChild })`)
    label.trigger('click')
    return true
  }


  showWillRunThis(previousRunner){
    if(this.hasTerminal){
      this.giveFeedback(`Running: ${ previousRunner.pyName }`, 'info')
    }
  }
}











export class PyodideSectionsRunner extends PyodideSequentialRunner{}
