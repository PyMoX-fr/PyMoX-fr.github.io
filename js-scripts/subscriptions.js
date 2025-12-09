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
import { checkMathJaxReady, getTheme, subscribeWhenReady, perennialMathJaxUpdate } from 'functools'

export const chaining=0;      // To control imports orders when using overrides






// Gather color theme data and create ACE theme (once only).

const getRGBChannels=colorString=>[
    colorString.slice(1, 3), colorString.slice(3, 5), colorString.slice(5, 7),
].map(s=>parseInt(s,16));


const bodyStyles = window.getComputedStyle(document.body);
const primaryColor = bodyStyles.getPropertyValue("--md-primary-fg-color");

document.documentElement.style.setProperty(
    "--main-color", getRGBChannels(primaryColor)
);

const _slate   = document.getElementById("ace_palette").dataset.aceDarkMode;
const _default = document.getElementById("ace_palette").dataset.aceLightMode;
let [default_ace_style, customLightTheme] = _default.split("|")
let [slate_ace_style,   customDarkTheme ] = _slate.split("|")
customLightTheme ||= "default"
customDarkTheme  ||= "slate"

// Correspondance between the custom and the classic palettes
CONFIG.ACE_COLOR_THEME.customThemeDefaultKey = customLightTheme
CONFIG.ACE_COLOR_THEME.customTheme = {
    [customLightTheme]: "default",
    [customDarkTheme]:  "slate",
};

// ACE style getter
CONFIG.ACE_COLOR_THEME.aceStyle = {
    default: default_ace_style,
    slate: slate_ace_style,
};






/**Logistic for PMT "bare tooltips": They are automatically put in place when an element holds at
 * the same time the ".tooltip" class and a "data-tip-txt" attribute.
 *
 * - The width of the tooltip can be set using "data-tip-width" (value in em)
 * - The text cannot contains any html code, only text.
 * */
;(function(){

  const tips = $(".tooltip[data-tip-txt]")
  if(!tips.length) return;

  const DELTA    = 10
  const tipSpan  = $('<span class="tooltiptext"></span>')
  const floating = $(`<div id="floating-tip" class="md-header md-typeset tooltip"></div>`)
  floating.append(tipSpan)
  floating.appendTo('body')


  const defaultPos=()=>({
    translateX:-50, translateY:0, anchorX:0, anchorY:0, width:'auto',
  })

  const pointerInfos=(top, left, right)=>{
    const viewW   = document.documentElement.clientWidth
    const viewH   = document.documentElement.clientHeight
    const isDown  = top   > viewH * 0.85
    const isLeft  = left  < viewW * 0.10
    const isRight = right > viewW * 0.90
    return {isDown, isLeft,isRight}
  }

  /**Place the anchor point just below the mouse pointer by mutation of pos
   * */
  const getMovingPosition=(e, obj)=>{
    const pos = defaultPos()

    const w = obj.dataset.tipWidth
    if (w!==undefined) pos.width = w+'em'

    e = e.originalEvent
    const pointer = pointerInfos(e.clientY, e.clientX, e.clientX)

    pos.translateX = pointer.isRight ? -100 : 0
    pos.translateY = pointer.isDown  ? -100 : 0
    pos.anchorX = e.pageX
    pos.anchorY = e.pageY + DELTA * (pointer.isDown ? -1:1)

    return pos
  }

  /**Automatically define the position of the tooltip around the hovered element by mutation of pos
   * */
  const getAnchorPoint=({width, height, top, left}, pagePos)=>{
    const pos   = defaultPos()

    pos.anchorX = Math.round(pagePos.left + width/2)
    pos.anchorY = pagePos.top + height + DELTA

    const pointer = pointerInfos(top + height, left, left+width)
    if(pointer.isDown){
      pos.anchorY    = pagePos.top - DELTA
      pos.translateY = -100
    }
    if(pointer.isLeft){
      pos.translateX = 0
    }else if (pointer.isRight){
      pos.translateX = -100
    }
    return pos
  }

  const placement=function(pos){
    floating.css({
      display: 'unset',
      top:  `${ pos.anchorY }px`,
      left: `${ pos.anchorX }px`,
    })
    tipSpan.css({
      width: pos.width,
      transform: `translate(${ pos.translateX }%, ${ pos.translateY }%)`,
    })
  }

  tips.on('mouseleave', function(e){
    floating.css({display: 'none'})
    tipSpan.text("")

  }).on('mouseenter', function(e){
    let pos

    if(this.dataset.tipMove!==undefined){
      pos = getMovingPosition(e, this)

    }else{
      // Floating must be positioned relative to the _page_, not the viewport (absolute position):
      const pagePos = $(this).position()

      // Positions & dimensions in viewport:
      const rect = this.getBoundingClientRect()

      pos = getAnchorPoint(rect, pagePos)
    }
    tipSpan.text(this.dataset.tipTxt)
    placement(pos)
  })

  // Put in place the moving tooltips:
  ;[...tips]
    .filter(tip=>tip.dataset.tipMove!==undefined)
    .forEach(moving=>{
      $(moving).on('mousemove', function(e){
        const pos = getMovingPosition(e, this)
        placement(pos)
      })
    })
})()








/**Define a MutationObserver to modify on the fly all the figures, when content is added to them:
 *
 * Whatever the figure, at some point, the content is removed, then replaced.
 * When the figure is low enough in the page, when it disappears, the page might scroll down
 * because it's not high enough anymore to fill the viewport.
 * This observer automatically sets a min-height on the figure div so that it doesn't shrink
 * anymore when its content is removed. This avoids the damn "flickering page scroll".
 * */
const FIGURE_HEIGHT_OBSERVER = new MutationObserver((entries)=>{
  for(const entry of entries){
    if(entry.addedNodes.length){
      // Wait for a long time so that the DOM has been updated (needed because of mermaid...)
      setTimeout(_=>{
        const target = $(entry.target)
        const actualHeight = Math.min(1500, target.height())
        target.css('min-height', actualHeight+'px')
      }, 150)
    }
  }
})


$("div.py_mk_figure").each(function(){
  FIGURE_HEIGHT_OBSERVER.observe(this, {childList:true})
})



//-----------------------------------------------------------------


/**Setup reactivity for the day/night button, repainting ACE editors.
 * NOTE: yet again, jQuery didn't work on a "change" event.
 * */
document.querySelector("[data-md-color-scheme]")
        .addEventListener("change", _=>{
          LOGGER_CONFIG.ACTIVATE && jsLogger("[Paint_ACEs]")

          const theme = getTheme();
          for(const id of CONFIG.element.allEditors){
            for (let theEditor of document.querySelectorAll(`div[id^="${ id }"]`)) {
              let editor = ace.edit(theEditor.id);
              editor.setTheme(theme);
              editor.getSession().setMode("ace/mode/python");
            }
          }
        });


;await (async function(){

  /**Elements in tabbed divs, that may need GUI makeup actions when the tab gets clicked on.
   * */
  const TABBED_TO_MAKE_UP_GUI = new Set()

  /**Storing all the terminals n the current page, to be able to restore any active command
   * they hold, while clicking on "tabs" tend to randomly remove them or parts of them...
   * */
  const ALL_TERMINALS = []


  const idePrefixToClass = {
    editor_: "Ide",
    tester_: "IdeTester",
    playground_: "IdePlayground",
  }


  const TO_BUILD_CONFIG = [
    ["span[id^=auto_run_]", "PyBtn"],
    ["[id^=btn_only_]",     "PyBtn"],
    ["div[id^=term_only_]", "Terminal"],
    ...CONFIG.element.allEditors.map(id=>
      [`div[id^=global_${ id }]`, idePrefixToClass[id], id=>id.slice('global_'.length)]
    )
  ]


  //------------------------------------------------------------------------


  // Add tabbed content manager/fixxxer (transformations to apply when tabs become visible
  // or are clicked on).
  $("div.tabbed-labels label").on('click', function(){

    // Handle the terminal crazy shit: loosing segments of the current command when clicking
    // tabs somewhere else in the page...
    for(const term of ALL_TERMINALS){
      term[1] = term[0].get_command()
      term[0].disable()
    }

    // On next tick, so that the UI is up to date (mainly : the IDE isn't hidden anymore...)
    setTimeout(_=>{
      if(TABBED_TO_MAKE_UP_GUI.size){
        for(const obj of [...TABBED_TO_MAKE_UP_GUI]){
          if(obj.isGuiCompliant || obj.makeUpYourGui()){
            TABBED_TO_MAKE_UP_GUI.delete(obj)
          }
        }
      }
      for(const [term,cmd] of ALL_TERMINALS) if(cmd) term.set_command(cmd)
    })
  })





  /**Add a dirty patch to fix troubles with IDE layout in details on CHROME (only):
   * The code area might slightly overlap the gutter, in some cases (happens if the gutter has
   * more than 9 lines, because the "more than one digit" line number creates a width increase,
   * that is not always properly reported on the code area with Chrome...).
   * */
  if(navigator.userAgent.includes('Chrome')){

    $('details').each(function(){

      const details = $(this)
      const ides = details.find("div[id^=global_editor]")
      if(!ides.length) return;

      details.on('click', _=>setTimeout(_=>{ ides.each(function(){
        const ide      = $(this)
        const codeArea = ide.find('div.ace_scroller')
        const gutter   = codeArea.prev()
        codeArea.css('left', gutter.css('width'))
      })}))

    })
  }



  //------------------------------------------------------------------------



  const waitForOverlord = async()=>{

    if(!CONFIG.overlordIsReady){
      LOGGER_CONFIG.ACTIVATE && jsLogger('[Subscriptions] (...waiting from subscription)')
      setTimeout(waitForOverlord, 50)
      return
    }
    LOGGER_CONFIG.ACTIVATE && jsLogger('[Subscriptions] - Done waiting: starting subscriptions')


    const ideManagerClass = CONFIG.CLASSES_POOL.GlobalRunnersManager
    if(ideManagerClass){
      ideManagerClass._defineIdesManagerProxyLike()
    }



    const to_build = TO_BUILD_CONFIG.map(
      ([query, className, transformId]) => [$(query), className, transformId]
    )
    const some_runners = to_build.some( ([jCollection,]) => jCollection.length>0 )

    if(some_runners){
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
    }

    const runner = CONFIG.CLASSES_POOL.Ide
    if(runner){
      // On next tick because the DOM isn't up to date yet:
      setTimeout(runner.enforceAceGutterFillAfterHeightsTroubles.bind(runner))
    }
    LOGGER_CONFIG.ACTIVATE && jsLogger('[Subscriptions] - Subscriptions done')

    if(CONFIG.CLASSES_POOL.Qcm){                          // Building qcms only if the class is defined in the page
      subscribeWhenReady("QCM", function(){
        LOGGER_CONFIG.ACTIVATE && jsLogger('[QCM]')
        CONFIG.CLASSES_POOL.Qcm.buildQcms()
      }, {now:true, runOnly:true})
    }


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
          return ready && (!some_runners || CONFIG.pyodideIsReady)
        }
      }
    )
  }

  await waitForOverlord()   // Start waiting...

})()
