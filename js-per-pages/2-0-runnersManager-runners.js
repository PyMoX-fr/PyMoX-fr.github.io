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

import { RunningProfile } from 'functools'



/**Public interface object, filled from the subscriptions.js file with methods transferring the
 * calls to the actual GlobalRunnersManager instance.
 * Reason: currently, none of the IdeRunners objects are accessible to the user, even by loading
 * a module from the console. So trying to keep it that way with this extra layer/wrapper.
 * */
export const RUNNERS_MANAGER = {}


const SEQ_MODES = Object.freeze({
  NONE: "",
  ALL: "all",
  DIRTY: "dirty",
})




/**Singleton object managing interactions between IDEs in the current page.
 *    - zip (import/export)
 *    - sequential run (in a version to come)
 * */
class GlobalRunnersManagerBase {

  constructor(){

    /**Holds all the Runner instances in the page, as `{runnerId: object}`
     * */
    this.allRunners = {}

    /**Control if contents printed to the stdout should be actually visible in the terminal or
     * not. This value is mutated from the runners instances... (see related getter & setter
     * in PyodideSectionsRunnerBase).
     * */
    this.allowPrint = true
  }

  registerRunner(runner){
    this.allRunners[runner.id] = runner
    runner._manager = this
  }


  /**Define a global intermediate object transferring silently the calls to the "inner/hidden"
   * RunnerManager, without exposing it directly.
   * All methods not starting with an underscore (except the constructor) will be exposed.
   * */
  static _defineIdesManagerProxyLikeAndStore_MANAGER_InConfig(){

    const IdesManagerClass = CONFIG.CLASSES_POOL.GlobalRunnersManager
    const IDE_MANAGER_SRC  = new IdesManagerClass()

    const getPublicMethodsWithInheritance=(cls)=>{
      const methods = new Set()   // Use a set to not register the overloaded methods several times
      while(cls.prototype){
        const props = Object.getOwnPropertyNames(cls.prototype)
        for(const prop of props){
          if(!prop.startsWith('_') && prop!='constructor') {
            methods.add(prop)
          }
        }
        cls = Object.getPrototypeOf(cls)
      }
      return [...methods]
    }

    const methodsToPatch = getPublicMethodsWithInheritance(IdesManagerClass)

    // Avoid direct binding so that the actual source isn't accessible to the user:
    for (const method of methodsToPatch){
      RUNNERS_MANAGER[method] = ((method)=>
        (...args) => IDE_MANAGER_SRC[method](...args)
      )(method)
    }

    // Store the RUNNERS_MANAGER "proxy" on the CONFIG object, to avoid having the subscriptions
    // script importing pyodide/runners related files directly.
    // The fact that the GlobalRunnersManager is stored in the CLASSES_POOL will ensure proper
    // resolution order anyway.
    CONFIG.RUNNERS_MANAGER = RUNNERS_MANAGER
  }
}










class GlobalAutoRunManager extends GlobalRunnersManagerBase {

  constructor(){
    super()

    /**Sparse defined array of each runner currently in the page that should run automatically.
     *    - Index 0 will always stay `undefined`.
     *    - All other indices will be contiguous & defined (in the end)
     * See `MaestroMacros.get_auto_run_rank(...)` for details about the indices values.
     *
     * Once the AUTO_RUN phase is finished, this array is empty.
     * */
    this.autoRuns = []

    /**Keep track of the runner instance currently "auto-running", if any. This allows to authorize
     * the current runner to actually run during the AUTO_RUN phase, while the executions of all
     * other runners is forbidden.
     * */
    this.currentAutoRun = null
  }

  registerRunner(runner){     // Cap override
    super.registerRunner(runner)
    if(runner.autoRun){
      this.autoRuns[runner.autoRun] = runner
    }
  }

  async autoRunInOrder(){
    for(const runner of this.autoRuns){
      if(runner){       // Because 'for ... of' extracts undefined for the empty slot at index 0...
        this.currentAutoRun = runner
        await runner.applyAutoRun()
      }
    }
    this.autoRuns = []
  }

  /**Forbid executions of any runner, as long as all the autoRuns have been executed, EXCEPT if
   * the runner asking for permission" is the one supposed to be run automatically.
   * */
  waitForAutoRunFinished(runner){
    return this.autoRuns.length && this.currentAutoRun !== runner
  }
}










class GlobalSequentialRunner extends GlobalAutoRunManager {

  constructor(){
    super()

    /**All groups of runners in the current page, in "top->bottom" DOM order.
     * Groups are stored as an ordered² 2d array [ [runners,...], ...].
     *
     * Note: The `this.groups` array is sparse defined, because the order of the initializations
     * of the runners is not guaranteed because of the `run` macros, which actually end up at the
     * bottom of the html page. So we rely instead on the ordering of the groups in the page, as
     * defined in the python layer (see: `PageConfiguration.get_run_group_data(...)` in
     * `pyodide_mkdocs_theme/pyodide_macros/plugin_tools/pages_and_macros_py_configs.py`).
     * */
    this.groups = []

    /**Array (ordered) of all runners which have the priority in a given group. Can be seen as:
     *
     *    [ (has_priority_but_not_run_yet | last_run_or_used_instance), ...]
     *
     * Note: this array is sparse defined, because the order of the initializations of the runners
     * is not guaranteed because of the `run` macros, which actually end up at the bottom of the
     * html page. So we rely instead on the ordering of the groups in the page, as defined in the
     * python layer (see: `PageConfiguration.get_run_group_data(...)` in
     * `pyodide_mkdocs_theme/pyodide_macros/plugin_tools/pages_and_macros_py_configs.py`).
     * */
    this.priority = []
  }

  registerRunner(runner){     // Cap override
    super.registerRunner(runner)

    if(!runner.isInSequentialRun) return;
    const iGroup = runner.runGroup

    const arrRunners = this.groups[iGroup] ??= this.groups[iGroup] ?? []

    if(runner.isStarredGroup || !this.priority[iGroup]){
      // Starred element or first one to be handled
      this.priority[iGroup] = runner
      arrRunners.splice(0, 0, runner)

    }else{
      // Otherwise, elements are systematically added in order, so just push...
      arrRunners.push(runner)
    }
  }

  overridePriorityElement(runner){
    if(runner.isInSequentialRun){
      const iGroup = runner.runGroup
      this.priority[iGroup] = runner
    }
  }

  /**Takes an array of runners id, which are contained in a tabbed-block that got revealed by the
   * user, clicking on the corresponding label, then give the priority to any runner that is:
   *  1. Part of a group
   *  2. The only runner of the group in the tabbed-block (this is to not change the priority for
   *     nested tabbed contents).
   */
  grantPriorityIfAloneInTab(runnersId){

    const runnersInGroups = runnersId
        .map(id=>this.allRunners[id])
        .filter(runner=>runner && this.groups[runner.runGroup].length > 1)

    const runnersByGroups = {}
    runnersInGroups.forEach(runner=>{
      runnersByGroups[runner.runGroup] = runnersByGroups[runner.runGroup] ?? []
      runnersByGroups[runner.runGroup].push(runner)
    })

    Object.values(runnersByGroups)
          .filter(group=>group.length==1)
          .forEach(group=>this.overridePriorityElement(group[0]))
  }


  // Testing purposes (see selenium tests)
  restoreDefaultPriorities(){
    for(const runner of Object.values(this.allRunners)){
      if(runner.isStarredGroup) this.overridePriorityElement(runner)
    }
  }


  /**Takes a "routine" running the python code related to the given pyoRunner (see
   * pyoRunner.runners object), and wraps it to handle:
   *
   *  1. The fact that the original implementation was returning undefined. So making sure
   *     the RuntimeManager object will never be sent back to the event handler.
   *  2. Add on the way the logistic for sequential runs, if this element  is in the sequence.
   *
   * @pyoRunner:     Macro related instance
   * @actionName:    kind of runner used
   * @routine:       A pyodide locked callback, returning a RuntimeManager object.
   * @sequentialRun: The sequential mode used in the page (if any)
   * @returns:       A new callback, to use for events binding only.
   */
  wrapForEventAndSequentialRunIfNeeded(pyoRunner, actionProp, routine, sequentialRun){

    const thisManager = this
    const runningMan = RunningProfile.build(RunningProfile.PROFILE[actionProp])
    const useSequential = (
      sequentialRun && pyoRunner.isInSequentialRun && (
        !pyoRunner.isIde || pyoRunner.isIde && (
          runningMan.isValidating || pyoRunner.seqPlay && runningMan.isPlaying
        )
      )
    )
    if(!useSequential){
      return async function noReturn(...args){
        await routine(...args)
      }
    }

    LOGGER_CONFIG.ACTIVATE && jsLogger('[Sequence] - Wrapped', pyoRunner.pyName)

           /**args: generally: [sectionName, Runtime], but might be ["command"] for terminals. */
    return async function sequentialAndNoReturn(...srcArgs){

      // Always give the current runner the priority, first, in case it is not "the one"...
      thisManager.overridePriorityElement(pyoRunner)

      /**In dirty mode, previous IDEs are run from the first "dirty" one only. All other runners
       * are always run whatever their state.*/
      let runIdes = sequentialRun == SEQ_MODES.ALL

      /**Flag to know when to use or not the announcement about what runner will execute
       * in the terminal. */
      let ranSome = false

      let success = true

      let previousRunner

      pyoRunner.running = runningMan    // Dirty override, but needed here or there... :rolleyes:
      pyoRunner.allowPrint = !this.deactivateStdoutForSecrets   // Because always used for validations
      pyoRunner.lockDisplay()
      pyoRunner.setupTerminalMessageRoutine()

      const iTrigger = thisManager.priority.findIndex( runner => runner===pyoRunner)
      try{
        for(previousRunner of thisManager.priority.slice(0,iTrigger)){

          // IDE without validation button are not considered
          if(previousRunner.isIde && previousRunner.hasCheckBtn){
            runIdes ||= (
              previousRunner.isDirty
              || runningMan.isValidating && previousRunner.storage.done < 1
            )
            if(!runIdes){
              continue
            }
          }

          ranSome = true
          pyoRunner.showWillRunThis(previousRunner)
          previousRunner.activateFocus(false)
          const prevRoutine = previousRunner.runners[actionProp] ?? previousRunner.runners.default
          const args = previousRunner.isTerminal ? [ previousRunner.prefillTerm || '' ] : srcArgs
          const runtime = await prevRoutine(...args)
          if(runtime.stopped){
            previousRunner.scrollIntoView()
            success = false
            break
          }
          previousRunner.activateFocus(true)
        }

      }finally{
        pyoRunner.unlockDisplay()
        pyoRunner.allowPrint = true

        // Defensive programming: deactivate again, so that it's always done, even on JS errors.
        if(previousRunner) previousRunner.activateFocus(true)
      }

      // If no error so far, run the current/triggering element (no return!)
      if(success){
        if(ranSome) pyoRunner.showWillRunThis()
        const oldClearConfig = pyoRunner.clearTerminalWhenLocking
        try{
          pyoRunner.clearTerminalWhenLocking = false
          await routine(...srcArgs)
        }finally{
          pyoRunner.clearTerminalWhenLocking = oldClearConfig
        }

      }else{
        // Make sure the selenium tests won't hang if a previous runner raised an error:
        pyoRunner.seleniumRunningFlag = false
      }
    }
  }
}




/** Common top level object.
 * */
class GlobalRunnersManager extends GlobalSequentialRunner {}

CONFIG.CLASSES_POOL.GlobalRunnersManager = GlobalRunnersManager
