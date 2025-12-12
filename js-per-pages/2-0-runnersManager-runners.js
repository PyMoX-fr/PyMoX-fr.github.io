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
 *      - zip (import/export)
 *      - sequential run (in a version to come)
 * */
class GlobalRunnersManagerBase {

  constructor(){
    this.allRunners = {}    // runnerId: runner instance
    this.allowPrint = true  // Mutated from the runners instances... (see related getter+setter)
  }

  registerRunner(runner){
    this.allRunners[runner.id] = runner
    runner._manager = this
  }

  /**Define a global intermediate object transferring silently the calls to the "inner/hidden"
   * RunnerManager, without exposing it directly.
   */
  static _defineIdesManagerProxyLike(){

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
  }
}










class GlobalSequentialRunner extends GlobalRunnersManagerBase {

  constructor(){
    super()
    this.priority = []    // [ (has_priority_but_not_run_yet | run_last), ...]
    this.groups = []      // [ [runners,...], ...] (ordered²), as "list of groups"
    // The groups array is built in a sparse way, because the order of the initializations
    // of the runners is not guaranteed. So rely on the ordering of the groups in the page.
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

  /**Takes a "routine" running the python code related to the given pyoRunner (see
   * pyoRunner.runners object), and wraps it to handle:
   *
   *  1. The fact that the original implementation was returning undefined. So making sure
   *     the RuntimeManager object will never be sent back to the event handler.
   *  2. Add on the way the logistic for sequential runs, if this element  is in the sequence.
   *
   * @pyoRunner: Macro related instance
   * @actionName: kind of runner used
   * @routine:   A pyodide locked callback, returning a RuntimeManager object.
   * @sequentialRun: The sequential mode used in the page (if any)
   * @returns:   A new callback to use for events binding only.
   */
  wrapForEventAndSequentialRunIfNeeded(pyoRunner, actionProp, routine, sequentialRun){

    const allRunners = this.priority
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

    return async function sequentialAndNoReturn(...args){
      let ranSome = false
      let runThem = sequentialRun == SEQ_MODES.ALL
      let success = true
      let previousRunner

      pyoRunner.running = runningMan    // Dirty override, but needed here or there... :rolleyes:
      pyoRunner.allowPrint = !this.deactivateStdoutForSecrets   // Because always used for validations
      pyoRunner.lockDisplay()
      pyoRunner.setupTerminalMessageRoutine()

      try{
        for(previousRunner of allRunners){

          const isTriggerRunner = previousRunner===pyoRunner
          if(isTriggerRunner){
            break
          }

          runThem = runThem || previousRunner.isDirty
          if(!runThem){
            continue
          }

          ranSome = true
          pyoRunner.showWillRunThis(previousRunner)

          previousRunner.activateFocus(false)
          const prevRoutine = previousRunner.runners[actionProp] ?? previousRunner.runners.default
          let runtime
          try{
            previousRunner.rotateTerminalMessage = false
            if(previousRunner.isTerminal){
              args = [ previousRunner.prefillTerm || '' ]
            }
            runtime = await prevRoutine(...args)
          }finally{
            previousRunner.rotateTerminalMessage = true

          }
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

        if(ranSome) pyoRunner.showWillRunThis(pyoRunner)
        const oldClearConfig = pyoRunner.clearTerminalWhenLocking
        try{
          pyoRunner.clearTerminalWhenLocking = false
          await routine(...args)
        }finally{
          pyoRunner.clearTerminalWhenLocking = oldClearConfig
        }
      }
    }
  }
}




/** Common top level object.
 * */
class GlobalRunnersManager extends GlobalSequentialRunner {}

CONFIG.CLASSES_POOL.GlobalRunnersManager = GlobalRunnersManager
