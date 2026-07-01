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





const getTheme=()=>{
  // automatically load current palette
  const palette = __md_get("__palette")
  let curPalette = palette === null
    ? CONFIG.ACE_COLOR_THEME.customThemeDefaultKey
    : palette.color["scheme"]

  const style = CONFIG.ACE_COLOR_THEME.customTheme[curPalette]
  return "ace/theme/" + CONFIG.ACE_COLOR_THEME.aceStyle[style];
}


/**Convert a css hex color string to the equivalent RGB Array of integers.
 * */
const getRGBChannels=colorString=>[
  colorString.slice(1, 3), colorString.slice(3, 5), colorString.slice(5, 7),
].map(s=>parseInt(s,16));


/**Add the css `var(--main-color)`, which is equal to material's `--md-primary-fg-color`.
 * */
export const defineCssMainColor=()=>{
  const bodyStyles = window.getComputedStyle(document.body);
  const primaryColor = bodyStyles.getPropertyValue("--md-primary-fg-color");

  document.documentElement.style.setProperty(
    "--main-color", getRGBChannels(primaryColor)
  );
}


/**Once the ace scripts are loaded, update the CONFIG.ACE_COLOR_THEME infos with the values
 * provided by the redactor, or using defaults otherwise.
 * */
export const defineAceColorPaletteThemeData=()=>{
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
}



export const getIdeOptions=(ide={})=>{
  // https://github.com/ajaxorg/ace/wiki/Configuring-Ace
  return {
    autoScrollEditorIntoView: false,
    copyWithEmptySelection:   true,               // active alt+flèches pour déplacer une ligne, aussi
    enableBasicAutocompletion:true,
    enableLiveAutocompletion: false,
    enableSnippets:           true,
    tabSize:                  4,
    useSoftTabs:              true,               // Spaces instead of tabs
    navigateWithinSoftTabs:   false,              // this is _fucking_ actually "Atomic Soft Tabs"...
    printMargin:              false,              // hide ugly margins...
    maxLines:                 ide.maxIdeLines ?? 30,
    minLines:                 ide.minIdeLines ?? 10,
    mode:                     "ace/mode/python",
    theme:                    getTheme(),
    fontSize:                 CONFIG.editorFontSize,
    fontFamily:               [CONFIG.editorFontFamily, "Monaco", "Menlo", "Ubuntu Mono", "Consolas",
                              "Source Code pro", "source-code-pro", "monospace"],   // Fix apple troubles...
  }
}




/*
------------------------------
 Various UI fixes logistic...
------------------------------
*/





/**Define a MutationObserver to modify on the fly all the figures, when content is added to them:
 *
 * Whatever the figure, at some point, the content is removed, then replaced.
 * When the figure is low enough in the page, when it disappears, the page might scroll down
 * because it's not high enough anymore to fill the viewport.
 * This observer automatically sets a min-height on the figure div so that it doesn't shrink
 * anymore when its content is removed. This avoids the damn "flickering page scroll".
 * */
export const createFiguresHeightMutationObserver=()=>{

  const FIGURE_HEIGHT_OBSERVER = new MutationObserver((entries)=>{
  for(const entry of entries){
    if(!entry.addedNodes.length) continue

      // Wait for a long time so that the DOM has been updated (needed because of mermaid...)
      setTimeout( _=>{
          const target = $(entry.target)
          const actualHeight = Math.min(1500, target.height())
          target.css('min-height', actualHeight+'px')
        }, 150
      )
    }
  })

  $("div.py_mk_figure").each(function(){
    FIGURE_HEIGHT_OBSERVER.observe(this, {childList:true})
  })
}



/** Add tabbed content manager/fixxxer:
 *    - Automatically give priority to runners in the tab, that are part of a group with some
 *      other runners, but are the only runner of the group that can be found in the tab.
 *    - Locking then unlocking terminals to avoid losing some parts of their current commands
 *      when clicking on tabbed labels... :rolleyes:
 *    - Transformations to apply when tabs become visible or are clicked on (makeUpYourGui).
 * */
export const setupTabbedContentsOnClickFixer =(allTerminals, notGuiCompliantEditors)=>{

  $("div.tabbed-labels label").on('click', function(){

    // ALWAYS FIRST: Handle the terminal crazy behavior: loosing segments of the current command
    //  when clicking tabs somewhere else in the page, so archive the commands and freeze them...
    for(const term of allTerminals){
      term[1] = term[0].get_command()
      term[0].disable()
    }

    // Gives the priority to any runner (not run macros...) present in the related tabbed-block
    // that is in a group with some other runners, and the only child found:
    const jLabel = $(this)
    const i = jLabel.index()
    const contents = $(jLabel.parent().parent().find('.tabbed-block'))
    const runnerIdsInTab = $(contents[i])
      .find(".py_mk_ide, .py_mk_terminal.term_solo, .py_mk_py_btn")
      .map((_,o)=>o.id.replace(/global_/, ""))
      .toArray()
    CONFIG.RUNNERS_MANAGER.grantPriorityIfAloneInTab(runnerIdsInTab)


    // Then make all the updates, on next tick, and reactivate the terminals with their commands:
    setTimeout(_=>{

      // Handle editors in the tab, removing those that have been handled from the set:
      if(notGuiCompliantEditors.size){
        for(const obj of [...notGuiCompliantEditors]){
          if(obj.isGuiCompliant || obj.makeUpYourGui()){
            notGuiCompliantEditors.delete(obj)
          }
        }
      }

      // ALWAYS LAST: Reactivate all terminals
      for(const [term,cmd] of allTerminals) if(cmd) term.set_command(cmd)
    })
  })
}



/**Add a dirty patch to fix troubles with IDE layout in details on CHROME (only):
 * The code area might slightly overlap the gutter, in some cases (happens if the gutter has
 * more than 9 lines, because the "more than one digit" line number creates a width increase,
 * that is not always properly reported on the code area with Chrome...).
 * */
export const setupChromeFixAceGutterInDetailsElements=()=>{

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
}



/**Setup reactivity for the day/night button, repainting ACE editors.
 * */
export const aceEditorsDayNightReactivity=()=>{
  // NOTE: yet again, jQuery didn't work on a "change" event...(?)
  document.querySelector("[data-md-color-scheme]").addEventListener("change", _=>{
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
}






/*
------------------------------
 PMT "Bare" tooltips logistic
------------------------------
*/




/**Logistic for PMT "bare tooltips": They are automatically put in place when an element holds at
 * the same time the ".tooltip" class and a "data-tip-txt" attribute.
 *
 * - The width of the tooltip can be set using "data-tip-width" (value in em)
 * - The text cannot contains any html code, only text.
 * */
export const handlePmtTooltips=()=>{

  const tips = $(".tooltip[data-tip-txt]:not(.tip-done)")

  if(!tips.length) return;

  const DELTA  = 10
  let floating = $("#floating-tip")
  let tipSpan  = $("#floating-tip > span.tooltiptext")

  if(!floating.length){
    floating = $(`<div id="floating-tip" class="md-header md-typeset tooltip"></div>`)
      .css('display', 'none')
      .appendTo('body')
    tipSpan  = $('<span class="tooltiptext"></span>').appendTo(floating)
  }


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
  const getAnchorPoint=({width, height, top, left}, pagePos, obj)=>{
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

    const w = obj.dataset.tipWidth
    if (w!==undefined) pos.width = w+'em'

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


  // Add the event listener to all tool tips, and mark them as handled (in case several
  // applications are done-> see MCQ):
  tips.on('mouseleave', function(e){
    floating.css({display: 'none'})
    tipSpan.text("")

  }).on('mouseenter', function(e){
    let pos

    if(this.dataset.tipMove!==undefined){
      pos = getMovingPosition(e, this)

    }else{
      // Floating must be positioned relative to the _page_, not the viewport (absolute position):
      const pagePos = $(this).offset()

      // Positions & dimensions in viewport:
      const rect = this.getBoundingClientRect()

      pos = getAnchorPoint(rect, pagePos, this)
    }
    tipSpan.html(this.dataset.tipTxt)
    placement(pos)
  }).addClass('tip-done')

  // Put in place the moving tooltips:
  ;[...tips]
    .filter(tip=>tip.dataset.tipMove!==undefined)
    .forEach(moving=>{
      $(moving).on('mousemove', function(e){
        const pos = getMovingPosition(e, this)
        placement(pos)
      })
    })
}
