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
import { pyodideFeatureCode } from "0-generic-python-snippets-pyodide"
import { PyodideSectionsRunner } from '2-pyodideSectionsRunner-runner-pyodide'







/**Make sure everything is as expected on Pyodide side (enforce clear_scope contracts).
 * */
const checkPyodideInitialState=()=>{
  const keeper = ['__name__', '__doc__', '__package__', '__loader__', '__spec__', '__annotations__', '__builtins__', '_pyodide_core', 'version']
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






/**Wait for some time before starting then initializing Pyodide environment.
 * */
const startPyodideSync =()=> {
  LOGGER_CONFIG.ACTIVATE && jsLogger('[Pyodide] - WASM: starting')
  loadPyodide()
    .then(setupPyodideEnvironmentTools)
    .catch(e=>console.error(e))
}


/**Once the Pyodide environment has been started, put in place the generic logic/setup
 * for it (these are only "do once" operations).
 * */
const setupPyodideEnvironmentTools =(pyodide)=> {

  globalThis.pyodide = pyodide

  LOGGER_CONFIG.ACTIVATE && jsLogger('[Pyodide] - WASM: ok')
  LOGGER_CONFIG.ACTIVATE && jsLogger('[Pyodide] - Environment setup start')

  // Defined first. Mutated directly from pyodideStart snippet:
  PyodideSectionsRunner.pyFuncs = globalThis.pyFuncs = {}

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

// Using this because Chrome-like browser may sometime just cancel a delayed execution if
// there is too much time in between two synch steps... (FML...):
subscribeWhenReady('Wait4StartPyodide', startPyodideSync, {
  runOnly: true,
  waitFor: waiterForStart(),
  maxTries: 60,
})





/**Insertion of the hourglass svg.
 * */
if(CONFIG.element.hourGlass){
  subscribeWhenReady(
    "HourGlass",
    function(){
      LOGGER_CONFIG.ACTIVATE && jsLogger('[HourGlass]')

      const hourGlassSvg = `
  <svg viewBox="0 0 512 512" id="${ CONFIG.element.hourGlass.slice(1) }"
    height="24px" width="24px" version="1.1" xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" fill="#ffffff"><g>
    <path class="st0" d="M329.368,237.908l42.55-39.905c25.237-23.661,39.56-56.701,39.56-91.292V49.156 c0.009-13.514-5.538-25.918-14.402-34.754C388.24,5.529,375.828-0.009,362.314,0H149.677c-13.514-0.009-25.918,5.529-34.754,14.401 c-8.872,8.837-14.41,21.24-14.402,34.754v57.554c0,34.591,14.315,67.632,39.552,91.292l42.55,39.888 c2.352,2.205,3.678,5.272,3.678,8.493v19.234c0,3.221-1.326,6.279-3.67,8.475l-42.558,39.905 c-25.237,23.653-39.552,56.702-39.552,91.292v57.554c-0.009,13.514,5.529,25.918,14.402,34.755 c8.836,8.871,21.24,14.409,34.754,14.401h212.636c13.514,0.008,25.926-5.53,34.763-14.401c8.863-8.838,14.41-21.241,14.402-34.755 v-57.554c0-34.59-14.324-67.64-39.56-91.292l-42.55-39.896c-2.344-2.205-3.678-5.263-3.678-8.484v-19.234 C325.69,243.162,327.025,240.095,329.368,237.908z M373.942,462.844c-0.009,3.273-1.266,6.055-3.403,8.218 c-2.162,2.135-4.952,3.402-8.226,3.41H149.677c-3.273-0.009-6.055-1.275-8.225-3.41c-2.128-2.163-3.394-4.945-3.402-8.218v-57.554 c0-24.212,10.026-47.356,27.691-63.91l42.55-39.906c9.914-9.285,15.538-22.274,15.538-35.857v-19.234 c0-13.592-5.624-26.58-15.547-35.866l-42.541-39.896c-17.666-16.555-27.691-39.69-27.691-63.91V49.156 c0.008-3.273,1.274-6.055,3.402-8.226c2.17-2.127,4.952-3.394,8.225-3.402h212.636c3.273,0.009,6.064,1.275,8.226,3.402 c2.136,2.171,3.394,4.952,3.403,8.226v57.554c0,24.22-10.026,47.355-27.683,63.91l-42.55,39.896 c-9.922,9.286-15.547,22.274-15.547,35.866v19.234c0,13.583,5.625,26.572,15.547,35.874l42.55,39.88 c17.658,16.563,27.683,39.707,27.683,63.918V462.844z"></path>
    <path class="st0" d="M256,248.674c10.017,0,18.131-8.122,18.131-18.139c3.032-12.051,9.397-23.161,18.578-31.757l42.542-39.888 c13.592-12.739,21.602-30.448,22.446-48.984H154.302c0.844,18.536,8.854,36.245,22.438,48.984l42.541,39.888 c9.19,8.596,15.547,19.706,18.579,31.757C237.861,240.552,245.983,248.674,256,248.674z"></path>
    <path class="st0" d="M256,267.796c-10.017,0-18.139,8.122-18.139,18.139c0,10.009,8.122,18.131,18.139,18.131 c10.017,0,18.131-8.122,18.131-18.131C274.131,275.918,266.017,267.796,256,267.796z"></path>
    <path class="st0" d="M256,332.137c-10.017,0-18.139,8.122-18.139,18.14c0,10.009,8.122,18.131,18.139,18.131 c10.017,0,18.131-8.122,18.131-18.131C274.131,340.259,266.017,332.137,256,332.137z"></path>
    <path class="st0" d="M239.876,389.742l-66.538,66.538h165.315l-66.537-66.538C263.21,380.845,248.782,380.845,239.876,389.742z"></path>
  </g></svg>`
      $(CONFIG.element.searchBtnsLeft).prepend($(hourGlassSvg))
    },
    {waitFor: CONFIG.element.searchBtnsLeft, runOnly:true},
  )
}
