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
  sleep,
  subscribeWhenReady,
  withPyodideAsyncLock,
} from 'functools'
import { addHourGlassIfNeeded } from 'process_and_gui'
import { pyodideFeatureCode } from "0-generic-python-snippets-pyodide"







/**Make sure everything is as expected on Pyodide side (enforce clear_scope contracts).
 * */
const checkPyodideInitialState=()=>{
  const keeper = [
    '__name__',
    '__doc__',
    '__package__',
    '__loader__',
    '__spec__',
    '__annotations__',
    '__builtins__',
    '_pyodide_core',
    'version',
  ]
  const unknown = pyodide.runPython('",".join(globals())').split(',').filter(k=>!keeper.includes(k))
  if(unknown.length){
    window.alert(`
Something unexpected was found after Pyodide's environnement startup.

The python environment might behave strangely because of this, or even raise unexpected errors.
Please contact the author of Pyodide-MkDocs-Theme by opening an issue with this complete error message on:

  ${ CONFIG.pmtUrl }/-/issues

  Unknown = ${ JSON.stringify(unknown) }
`)
  }
}



/**Setup Pyodide fatal error callback (note: never seen it, so far...).
 * */
const setupPyodideFatalCbk =()=> {

  // Put in place a "critical error" message (never saw it, so far...)
  pyodide._module.on_fatal = withPyodideAsyncLock('fatal', async(e)=>{
    const term = $.terminal.active()
    term.error(
      "Pyodide has suffered a fatal error. Please report this to the Pyodide maintainers."
    )
    term.error("The cause of the fatal error was:")
    term.error(e)
    await sleep();  // Enforce UI refresh
  })
}






/**Wait for some time then initialize Pyodide environment.
 * */
const startPyodideSyncWith =(PyodideSectionsRunnerClass)=>()=> {
  LOGGER_CONFIG.ACTIVATE && jsLogger('[Pyodide] - WASM: starting')
  loadPyodide()
    .then(setupPyodideEnvironmentToolsFactory(PyodideSectionsRunnerClass))
    .then(_=>console.log('Pyodide kernel ready.'))
    .catch(console.error)
}


/**Once the Pyodide environment has been started, put in place the generic logic/setup
 * for it (these are only "do once" operations).
 * */
const setupPyodideEnvironmentToolsFactory =(PyodideSectionsRunnerClass)=>(pyodide)=> {

  globalThis.pyodide = pyodide

  LOGGER_CONFIG.ACTIVATE && jsLogger('[Pyodide] - WASM: ok')
  LOGGER_CONFIG.ACTIVATE && jsLogger('[Pyodide] - Environment setup start')

  // Defined first. Mutated directly from pyodideStart snippet:
  PyodideSectionsRunnerClass.pyFuncs = globalThis.pyFuncs = {}

  const pyodideStart = pyodideFeatureCode('pyodideStart')
  pyodide.runPython(pyodideStart)
  checkPyodideInitialState()
  setupPyodideFatalCbk()

  if(!CONFIG._devMode) delete globalThis.pyFuncs

  // All done!
  CONFIG.pyodideIsReady = true
  $("#header-hourglass-svg").attr("class", "py_mk_vanish")

  LOGGER_CONFIG.ACTIVATE && jsLogger('[Pyodide] - Environment setup done')
}


const waiterForStart=()=>{
  let start;
  return ()=>{
    if(!CONFIG.overlordIsReady) return false

    const now = new Date()
    if(!start) start = now
    return now-start >= CONFIG.pyodideDelay
  }
}


export const startKernel=(PyodideSectionsRunnerClass)=>{

  addHourGlassIfNeeded()

  // Using this because Chrome-like browser may sometime just cancel a delayed execution if
  // there is too much time in between two async steps... (FML...):
  subscribeWhenReady('Wait4StartPyodide', startPyodideSyncWith(PyodideSectionsRunnerClass), {
    runOnly: true,
    waitFor: waiterForStart(),
    maxTries: 60,
  })
}
