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
  checkMathJaxReady,
  subscribeWhenReady,
  perennialMathJaxUpdate,
} from 'functools'
import {
  handlePmtTooltips,
  setupChromeFixAceGutterInDetailsElements,
  setupTabbedContentsOnClickFixer,
} from 'functoolsUi'
import { showIdCollisionsIfAny } from 'functoolsStorage'

export const chaining=0     // To control imports orders when using overrides (used for Playground)







;await (async function(){

  /**Elements in tabbed divs, that may need GUI makeup actions when the tab gets clicked on.
   * */
  const TABBED_TO_MAKE_UP_GUI = new Set()

  /**Storing all the terminals n the current page, to be able to restore any active command
   * they hold, while clicking on "tabs" tend to randomly remove them or parts of them...
   * */
  const ALL_TERMINALS = []

  setupTabbedContentsOnClickFixer(ALL_TERMINALS, TABBED_TO_MAKE_UP_GUI)

  setupChromeFixAceGutterInDetailsElements()


  setupTabbedContentsOnClickFixer(ALL_TERMINALS, TABBED_TO_MAKE_UP_GUI)

  setupChromeFixAceGutterInDetailsElements()


  const idePrefixToClass = {
    editor_: "Ide",
    tester_: "IdeTester",
    playground_: "IdePlayground",
  }

  const to_build = [
    ["span[id^=auto_run_]", "PyBtn"],
    ["[id^=btn_only_]",     "PyBtn"],
    ["div[id^=term_only_]", "Terminal"],
    ...CONFIG.element.allEditors.map(id=>
      [`div[id^=global_${ id }]`, idePrefixToClass[id], id=>id.slice('global_'.length)]
    )
  ].map(
    ([query, className, transformId]) => [$(query), className, transformId]
  )


  const waitForOverlord = async()=>{

    if(!CONFIG.overlordIsReady){
      LOGGER_CONFIG.ACTIVATE && jsLogger('[Subscriptions] (...waiting from subscription)')
      setTimeout(waitForOverlord, 50)
      return
    }
    LOGGER_CONFIG.ACTIVATE && jsLogger('[Subscriptions] - Done waiting: starting subscriptions')

    const managerClass = CONFIG.CLASSES_POOL.GlobalRunnersManager
    const isPageWithRunners = Boolean(managerClass)
    if(isPageWithRunners){

      managerClass._defineIdesManagerProxyLikeAndStore_MANAGER_InConfig()

      to_build.forEach( ([jCollection, className, transformId])=>{
        jCollection.each(function(){
          const id  = transformId ? transformId(this.id) : this.id
          const elt = new CONFIG.CLASSES_POOL[className](id)
          elt.build()
          elt.makeUpYourGui()
          if(elt.terminal) ALL_TERMINALS.push([elt.terminal, ''])

          // Store the runner objects that couldn't be fully initiated (GUI-wise / normally happens
          // because they are in tabs) :
          if(!elt.isGuiCompliant) TABBED_TO_MAKE_UP_GUI.add(elt)
        })
      })

      const IdeClass = CONFIG.CLASSES_POOL.Ide
      if(IdeClass){
        // NOTES:
        //    1. On next tick because the DOM isn't up to date yet
        //    2. Binding with the class itself because for a static method
        const guttersFixer = IdeClass.enforceAceGutterFillAfterHeightsTroubles.bind(IdeClass)
        setTimeout(guttersFixer)
      }


      // Show ids collisions BEFORE the AUTO_RUN step, otherwise selenium tests cannot resolve the
      // waiting operations in proper order (the alert interleaves itself with the executions).
      showIdCollisionsIfAny()

      // AFTER showing html ids collisions. See above, trigger all the elements that are using
      // `AUTO_RUN=True`, if some runners are defined:
      await CONFIG.RUNNERS_MANAGER.autoRunInOrder()
    }


    LOGGER_CONFIG.ACTIVATE && jsLogger('[Subscriptions] - Subscriptions done')

    handlePmtTooltips()


    subscribeWhenReady("QCM", function(){
      if(CONFIG.CLASSES_POOL.Qcm){                    // Building qcms only if the class is defined in the page
        LOGGER_CONFIG.ACTIVATE && jsLogger('[QCM]')
        CONFIG.CLASSES_POOL.Qcm.buildQcms()
        handlePmtTooltips()
      }
    }, {now:true, runOnly:true})


    // Done _LATE_ because of chrome troubles in Capytale: subscribing after everything has been
    // set/updated will avoid useless calls/reactions to DOM mutations (IDEs & co).
    LOGGER_CONFIG.ACTIVATE && jsLogger('[MathJax] - subscribe to document$ after pyodide started')
    subscribeWhenReady(
      'MathJax',
      perennialMathJaxUpdate,
      {
        delay: 200,
        maxTries: 50,   // because some useless reschedule before pyodide actually starts
        waitFor: _=>{
          // Use A LOT of extra conditions, trying to avoid potential troubles with chrome scripts scheduling...
          const ready = checkMathJaxReady()
          return ready && (!isPageWithRunners || CONFIG.pyodideIsReady)
        }
      }
    )
  }

  await waitForOverlord()   // Start waiting...
})()
