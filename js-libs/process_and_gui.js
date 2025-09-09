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
import { buttonWithTooltip, subscribeWhenReady, txtFormat } from 'functools'

export const _DUMMY=null    // Reexport to enforce dependencies order: see PyodideSectionsRunner.
                            // (reminder: the script defining CONFIG is loaded synchronously)



//------------------------------------
// Post process the content of CONFIG
//------------------------------------


// For backward compatibility ( < 2.2.0)
const DEFAULT_FORMATTING_BEFORE_220 = {
  runScript:         'info',
  installStart:      'info',
  installDone:       'info',
  validation:        'info',
  editorCode:        'info',
  publicTests:       'info',
  secretTests:       'info',
  successMsg:        'success',
  successMsgNoTests: 'info',
  unforgettable:     'warning',
  successHead:       'success',
  failHead:          'warning',
}

// Preformat the various messages to use in the terminals (in the given tongue)
for(const prop in CONFIG.lang){
  const obj = CONFIG.lang[prop]
  const format = obj.format || DEFAULT_FORMATTING_BEFORE_220[prop]

  if(format){
    obj.msg = txtFormat[ format ]( obj.msg )
  }
}

CONFIG.lang.tests.as_pattern = new RegExp(CONFIG.lang.tests.as_pattern, 'i')
CONFIG.pythonLibs            = new Set(CONFIG.pythonLibs)







//----------------------------------------------------------
// Manage global GUI modifications for the Theme's elements
//----------------------------------------------------------


/**Insertion of the placeholders, around the search bar.
 * */
subscribeWhenReady(
    "AroundSearchLeft",
    function(){
        LOGGER_CONFIG.ACTIVATE && jsLogger('[AroundSearch]', 'left')
        const wrappingDivL = `<div id="${ CONFIG.element.searchBtnsLeft.slice(1)  }"></div>`
        $(wrappingDivL).insertBefore(CONFIG.element.dayNight)
    },
    {waitFor: CONFIG.element.dayNight, runOnly:true},
)

subscribeWhenReady(
    "AroundSearchRight",
    function(){
        LOGGER_CONFIG.ACTIVATE && jsLogger('[AroundSearch]', 'right')
        const wrappingDivR = `<div id="${ CONFIG.element.searchBtnsRight.slice(1) }"></div>`

        /* Try various locations for insertion.
            1. On the right of the search bar
            2. On the right of the dayNight palette otherwise (in case no search tool/plugin)
        */
        if($(CONFIG.element.searchBlock)[0]){
            $(wrappingDivR).insertAfter(CONFIG.element.searchBlock)
        }else{
            $(wrappingDivR).insertAfter(CONFIG.element.dayNight)
        }
    },
    {waitFor: CONFIG.element.searchBtnsLeft, runOnly:true},
)



/**Insertion of the trash icon/button
 * */
if(CONFIG.element.trashCan){ subscribeWhenReady(
    "TrashCan",
    function(){
      LOGGER_CONFIG.ACTIVATE && jsLogger('[TrashCan]')

      const trashId = CONFIG.element.trashCan.slice(1)
      const TRASH_SVG =
`<svg height="20px" version="1.1" id="${ trashId }" xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve" fill="#ffffff">
  <g>
    <path d="M88.594,464.731C90.958,491.486,113.368,512,140.234,512h231.523c26.858,0,49.276-20.514,51.641-47.269 l25.642-335.928H62.952L88.594,464.731z M420.847,154.93l-23.474,307.496c-1.182,13.37-12.195,23.448-25.616,23.448H140.234 c-13.42,0-24.434-10.078-25.591-23.132L91.145,154.93H420.847z"></path>
    <path d="M182.954,435.339c5.877-0.349,10.35-5.4,9.992-11.269l-10.137-202.234c-0.358-5.876-5.401-10.349-11.278-9.992 c-5.877,0.357-10.35,5.409-9.993,11.277l10.137,202.234C172.033,431.231,177.085,435.696,182.954,435.339z"></path>
    <path d="M256,435.364c5.885,0,10.656-4.763,10.656-10.648V222.474c0-5.885-4.771-10.648-10.656-10.648 c-5.885,0-10.657,4.763-10.657,10.648v202.242C245.344,430.601,250.115,435.364,256,435.364z"></path>
    <path d="M329.046,435.339c5.878,0.357,10.921-4.108,11.278-9.984l10.129-202.234c0.348-5.868-4.116-10.92-9.993-11.277 c-5.877-0.357-10.92,4.116-11.277,9.992L319.054,424.07C318.697,429.938,323.17,434.99,329.046,435.339z"></path>
    <path d="M439.115,64.517c0,0-34.078-5.664-43.34-8.479c-8.301-2.526-80.795-13.566-80.795-13.566l-2.722-19.297 C310.388,9.857,299.484,0,286.642,0h-30.651H225.34c-12.825,0-23.728,9.857-25.616,23.175l-2.721,19.297 c0,0-72.469,11.039-80.778,13.566c-9.261,2.815-43.357,8.479-43.357,8.479C62.544,67.365,55.332,77.172,55.332,88.38v21.926h200.66 h200.676V88.38C456.668,77.172,449.456,67.365,439.115,64.517z M276.318,38.824h-40.636c-3.606,0-6.532-2.925-6.532-6.532 s2.926-6.532,6.532-6.532h40.636c3.606,0,6.532,2.925,6.532,6.532S279.924,38.824,276.318,38.824z"></path>
  </g>
</svg>`
      const trashBtnOptions = {
        tagId: trashId+"Btn",
        shift: 90,
        fontSize: 1.5,
        tipWidth: CONFIG.lang.tipTrash.em,
        tipText: CONFIG.lang.tipTrash.msg,
      }

      const trashButton = $(
        buttonWithTooltip(trashBtnOptions, TRASH_SVG)
      ).on('click', function(){

        const data  = Object.keys(localStorage)
        const codes = data.filter( s => /^editor_[\da-f]{16,}$/.test(s) )
        const cmds  = data.filter( s => /^\d+_commands$/.test(s) )

        if(!codes.length){
          window.alert(`Pas de codes enregistrés sur ce navigateur.`)
        }else{
          const todo = window.confirm(
              `Il y a actuellement ${ codes.length } références enregistrées sur ce `
            + "navigateur.\nVoulez-vous toutes les effacer ?"
          )
          if(todo) codes.forEach(k=>localStorage.removeItem(k))
        }

        cmds.forEach(k=>{
          localStorage.setItem(k, "[]")
        })
      })
      $(CONFIG.element.searchBtnsRight).append(trashButton)
  },
  {waitFor: CONFIG.element.searchBtnsRight, runOnly:true},
)}
