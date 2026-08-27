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
import { subscribeWhenReady } from 'functools'
import { moveLocalStorageEntriesFromOlderProjectId, trashLocalStorage } from 'functoolsStorage'
import { applyLangMessagesFormatting } from 'functoolsTxt'
import {
  aceEditorsDayNightReactivity,
  createFiguresHeightMutationObserver,
  defineAceColorPaletteThemeData,
  defineCssMainColor,
} from 'functoolsUi'
import { buttonWithTooltip, makeIdeJqButton } from 'functoolsUiBuilder'

export const chaining=0     // Export to enforce dependencies order: see PyodideSectionsRunner.
                            // (reminder: the script defining CONFIG is loaded synchronously)



//------------------------------------
// Post process the content of CONFIG
//------------------------------------

applyLangMessagesFormatting()

// Convert some data types on the fly...
CONFIG.lang.tests.as_pattern = new RegExp(CONFIG.lang.tests.as_pattern, 'i')
CONFIG.pythonLibs            = new Set(CONFIG.pythonLibs)



//------------------------
// Local storage handling
//------------------------


// Update/move all localStorage entries, if required by the redactor:
if((CONFIG.projectMoveFromOldId??null) !== null){
  moveLocalStorageEntriesFromOlderProjectId(CONFIG.projectMoveFromOldId)
}



//----------------------------------------------------------
// Manage global GUI modifications for the Theme's elements
//----------------------------------------------------------



aceEditorsDayNightReactivity()

createFiguresHeightMutationObserver()

defineCssMainColor()

defineAceColorPaletteThemeData()


// Placeholder on the left of the search bar:
 subscribeWhenReady(
    "AroundSearchLeft",
    function(){
        LOGGER_CONFIG.ACTIVATE && jsLogger('[AroundSearch]', 'left')
        const wrappingDivL = `<div id="${ CONFIG.element.searchBtnsLeft.slice(1)  }"></div>`
        $(wrappingDivL).insertBefore(CONFIG.element.dayNight)
    },
    {waitFor: CONFIG.element.dayNight, runOnly:true},
)

// Placeholder on the left of the search bar:
subscribeWhenReady(
    "AroundSearchRight",
    function(){
        LOGGER_CONFIG.ACTIVATE && jsLogger('[AroundSearch]', 'right')
        const wrappingDivR = `<div id="${ CONFIG.element.searchBtnsRight.slice(1) }"></div>`

        // The search bar may be missing, depending on the site configuration, so adapt the button placement.
        const hasSearchBar = $(CONFIG.element.searchBlock).length
        $(wrappingDivR).insertAfter(
          hasSearchBar ? CONFIG.element.searchBlock : CONFIG.element.dayNight
        )
    },
    {waitFor: CONFIG.element.searchBtnsLeft, runOnly:true},
)



const resetAllButton=()=>{
  makeIdeJqButton('restart', {
    autoCbk:  false,
    bareTip:  true,
    fontSize: 1.5,
    tipWidth: CONFIG.lang.tipResetAll.em,
    tipText:  CONFIG.lang.tipResetAll.msg,
    tagId:    "header-reset-all",
    extraStyle: "margin:0 -5px 0 8px",
  }).on('click', _=>{
    if(window.confirm(CONFIG.lang.restartConfirm.plural)){
      CONFIG.RUNNERS_MANAGER.resetAllIdes()
    }
  }).appendTo(CONFIG.element.searchBtnsRight)
}


const trashCanButton=()=>{

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
  buttonWithTooltip(trashBtnOptions, TRASH_SVG)
    .on('click', trashLocalStorage)
    .appendTo($(CONFIG.element.searchBtnsRight))
}

subscribeWhenReady(
  "TrashCan",
  ()=>{
    LOGGER_CONFIG.ACTIVATE && jsLogger('[TrashCan]')
    const useIdes = CONFIG.CLASSES_POOL.Ide || CONFIG.overlordClasses.includes("Ide")
    if(useIdes) resetAllButton()
    if(CONFIG.element.trashCan) trashCanButton()
  },
  {waitFor: CONFIG.element.searchBtnsRight, runOnly:true},
)




// Logistic to add the "hourglass" thing for kernel startup:
export const addHourGlassIfNeeded=()=>{

  const hourglassBuilder = ()=>{
    LOGGER_CONFIG.ACTIVATE && jsLogger('[HourGlass]')
    $(CONFIG.element.searchBtnsLeft).prepend($(`
<svg viewBox="0 0 512 512" id="${ CONFIG.element.hourGlass.slice(1) }"
  height="24px" width="24px" version="1.1" xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" fill="#ffffff"><g>
  <path class="st0" d="M329.368,237.908l42.55-39.905c25.237-23.661,39.56-56.701,39.56-91.292V49.156 c0.009-13.514-5.538-25.918-14.402-34.754C388.24,5.529,375.828-0.009,362.314,0H149.677c-13.514-0.009-25.918,5.529-34.754,14.401 c-8.872,8.837-14.41,21.24-14.402,34.754v57.554c0,34.591,14.315,67.632,39.552,91.292l42.55,39.888 c2.352,2.205,3.678,5.272,3.678,8.493v19.234c0,3.221-1.326,6.279-3.67,8.475l-42.558,39.905 c-25.237,23.653-39.552,56.702-39.552,91.292v57.554c-0.009,13.514,5.529,25.918,14.402,34.755 c8.836,8.871,21.24,14.409,34.754,14.401h212.636c13.514,0.008,25.926-5.53,34.763-14.401c8.863-8.838,14.41-21.241,14.402-34.755 v-57.554c0-34.59-14.324-67.64-39.56-91.292l-42.55-39.896c-2.344-2.205-3.678-5.263-3.678-8.484v-19.234 C325.69,243.162,327.025,240.095,329.368,237.908z M373.942,462.844c-0.009,3.273-1.266,6.055-3.403,8.218 c-2.162,2.135-4.952,3.402-8.226,3.41H149.677c-3.273-0.009-6.055-1.275-8.225-3.41c-2.128-2.163-3.394-4.945-3.402-8.218v-57.554 c0-24.212,10.026-47.356,27.691-63.91l42.55-39.906c9.914-9.285,15.538-22.274,15.538-35.857v-19.234 c0-13.592-5.624-26.58-15.547-35.866l-42.541-39.896c-17.666-16.555-27.691-39.69-27.691-63.91V49.156 c0.008-3.273,1.274-6.055,3.402-8.226c2.17-2.127,4.952-3.394,8.225-3.402h212.636c3.273,0.009,6.064,1.275,8.226,3.402 c2.136,2.171,3.394,4.952,3.403,8.226v57.554c0,24.22-10.026,47.355-27.683,63.91l-42.55,39.896 c-9.922,9.286-15.547,22.274-15.547,35.866v19.234c0,13.583,5.625,26.572,15.547,35.874l42.55,39.88 c17.658,16.563,27.683,39.707,27.683,63.918V462.844z"></path>
  <path class="st0" d="M256,248.674c10.017,0,18.131-8.122,18.131-18.139c3.032-12.051,9.397-23.161,18.578-31.757l42.542-39.888 c13.592-12.739,21.602-30.448,22.446-48.984H154.302c0.844,18.536,8.854,36.245,22.438,48.984l42.541,39.888 c9.19,8.596,15.547,19.706,18.579,31.757C237.861,240.552,245.983,248.674,256,248.674z"></path>
  <path class="st0" d="M256,267.796c-10.017,0-18.139,8.122-18.139,18.139c0,10.009,8.122,18.131,18.139,18.131 c10.017,0,18.131-8.122,18.131-18.131C274.131,275.918,266.017,267.796,256,267.796z"></path>
  <path class="st0" d="M256,332.137c-10.017,0-18.139,8.122-18.139,18.14c0,10.009,8.122,18.131,18.139,18.131 c10.017,0,18.131-8.122,18.131-18.131C274.131,340.259,266.017,332.137,256,332.137z"></path>
  <path class="st0" d="M239.876,389.742l-66.538,66.538h165.315l-66.537-66.538C263.21,380.845,248.782,380.845,239.876,389.742z"></path>
</g></svg>`))
  }

  if(CONFIG.element.hourGlass){
    subscribeWhenReady(
      "HourGlass",
      hourglassBuilder,
      {waitFor: CONFIG.element.searchBtnsLeft, runOnly:true},
    )
  }
}
