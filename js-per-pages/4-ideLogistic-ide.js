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
  getIdeDataFromStorage,
  freshStore,
  PythonError,
  sleep,
  PMT_LOCAL_STORAGE_KEYS_WRITE,
  RunningProfile,
} from 'functools'
import { RUNNERS_MANAGER } from '4-0-idesManager-ide'
import { TerminalRunner } from '3-terminalRunner-term'



ace.require("ace/ext/language_tools");

export const isWin   = navigator.userAgent.includes('Windows')
export const isMacOs = navigator.userAgent.includes('Macintosh')

/**Tell if the given event (original, of jQuery) is using Ctrl or Cmd.
 * */
export const useCtrl =(e)=> e.ctrlKey || isMacOs && e.metaKey

export const somethingFullScreen =()=> Boolean(document.fullscreenElement)

/**Extract the height, as a number, from the css property (by default)
 * */
export const cssPx =(jObj,prop='height')=> +jObj.css(prop).slice(0,-2)











/**LocaleStorage data manager.
 *
 * Each IDE stores various data about it's current or past state(s):
 *    - `code`: current version of the content of the editor. Might be updated frequently.
 *    - `done`: -1|0|1 = state of the last validation: -1=failure, 0=unknown, 1=success.
 *    - `hash`: `ide.scrHash` value associated with the `code` property. Allow to track updates
 *              of the exercice, so that the user can be warned that the initial content of the
 *              exercice is not anymore the same than the last time they trained on it.
 *    - `name`: `ide.pyName` value (used to build zip archives or to load them).
 *    - `zip`:  To know if the given IDE content must be exported in the zip archive or not.
 *
 * WARNING: Redactors are allowed to store their own values in the local storage, so foreign
 *          items may occur and _HAVE TO BE KEPT_.
 */
class IdeStorageManager extends TerminalRunner {

  get isIde(){ return true }
  get hasTerminal(){ return true }
  get isTerminal(){ return false }

  /**Process to "re-initiate" the internal state of the IDE (useful for testing) */
  constructor(editorId, callInit=false){
    super(editorId, callInit)
    this.storage = this.getStorage()
  }

  // First class, making sure the change of argument is handled
  build(){
    super.build(this.termId)
  }



  getStorage(editorId=null){
    editorId ??= this.id
    const extractForThis = editorId==this.id
    const [storage,upToDate] = getIdeDataFromStorage(editorId, extractForThis?this:null)
    this.updateGenericStorageData(storage)
    return storage
  }

  getCodeFromStorage(){
    return this.storage.code
  }


  updateGenericStorageData(storage){
    storage.name   = this.pyName
    storage.hash ??= this.srcHash   // Only if undefined, so that no alert shown for ALL updated
                                    // IDEs that are still using the default code.
  }



  setStorage(changes={}){
    this._updateInternalStorage(changes)
    localStorage.setItem(this.id, JSON.stringify(this.storage))
  }

  resetElement(){
    super.resetElement()
    this.storage = freshStore("", {}, this)
    localStorage.removeItem(this.id)
  }

  _updateInternalStorage(changes){
    if(changes){
      for(const k in changes) this.storage[k] = changes[k]
    }
  }



  //-------------------------------------------------------------------------


  announceCodeChangeBasedOnSrcHash(){
    if(this.storage.hash !== this.srcHash){
      this.terminalEcho(CONFIG.lang.refresh.msg)
    }
  }


  /**Automatically gives the focus to the ACE editor with the given id.
   * */
  focusEditor(){
    if(this.activatedFocus){
      this.editor.focus()
    }
  }

  focusElement(){
    this.focusEditor()
  }


  //-------------------------------------------------------------------------


  _validateKeyStorageAccess(key){
    if(PMT_LOCAL_STORAGE_KEYS_WRITE.some(k=>k==key)){
      throw new PythonError(
          `Writing the "${ key }" property of the localStorage is forbidden (already used by PMT).`
      )
    }
  }

  _validateNotFromTerminal(){
    if(this.running.isTermCmd){
      throw new PythonError('Cannot access localStorage data from the terminal')
    }
  }


  /**LocalStorage accessor from pyodide. Returns null if the key doesn't exist.
   * */
  pyodideGetStorage(key){
    this._validateNotFromTerminal()
    return this.storage[key]
  }


  /**List all the keys present in the LocalStorage.
   *
   * IMPORTANT: When called from pyodide, this will send back a JsProxy object.
   *            It should be converted to a python list using `arr.to_py()`
   * */
  pyodideKeysStorage(){
    this._validateNotFromTerminal()
    return Object.keys(this.storage)
  }


  /**LocalStorage mutator from pyodide. Writing the properties used by PMT is forbidden.
   * Accept only strings or numbers.
   * */
  pyodideSetStorage(key, value){
    this._validateNotFromTerminal()
    this._validateKeyStorageAccess(key)
    if(typeof(value)!='string' && typeof(value)!='number'){
      throw new PythonError(
        `Cannot update "${ key }" localStorage property: only numbers and strings are allowed as values.`
      )
    }
    this.setStorage({[key]: value})
  }

  pyodideDelStorage(key){
    this._validateNotFromTerminal()
    this._validateKeyStorageAccess(key)
    if(key in this.storage) delete this.storage[key]
    this.setStorage()
  }
}

















class IdeZipManager extends IdeStorageManager {

  buildZipExportsToolsAndCbk(jBtn){
    // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
    // https://stackoverflow.com/questions/43180248/firefox-ondrop-event-datatransfer-is-null-after-update-to-version-52

    // Add drag&Drop behavior for zip archives:
    jBtn.on("dragenter dragstart dragend dragleave dragover drag", e=>e.preventDefault())

    // Doesn't work using jQuery... (again... x/ ):
    jBtn[0].addEventListener('drop', this.dropArchiveFactory(
      this.lockedRunnerWithBigFailWarningFactory(
        RunningProfile.PROFILE.zipImport,
        this.setupRuntimeZip,
        async(_e, zipFile)=>{ RUNNERS_MANAGER.readZipContentAndUpdateIdes(zipFile) },
        this.teardownRuntimeZip,
        true,
      )
    ))

    return this.lockedRunnerWithBigFailWarningFactory(
      RunningProfile.PROFILE.zipExport,
      this.setupRuntimeZip,
      this.zipExport,
      this.teardownRuntimeZip,
    )
  }


  async setupRuntimeZip(){
    this.terminal.pause()           // Deactivate user actions in the terminal until resumed
    this.terminal.clear()           // To do AFTER pausing...
    const runtime = await this._baseSetupRuntime()
    return runtime
  }

  async teardownRuntimeZip(runtime){
    this.terminal.resume()
    await this._baseTeardownRuntime(runtime)
  }



  async zipExport(_runtime){
    this.terminalEcho('Generate zip for '+location.href)
    RUNNERS_MANAGER.exportIdesAsZip()
    this.focusEditor()
  }


  dropArchiveFactory(asyncLockedZipDropper){
    return async dropEvent=>{
      this.giveFeedback("Loading archive content, please wait...")

      // Files _HAVE_ to be extracted here, because the locked runner is automatically calling
      // e.preventDefault(), which _SEEMS_ to remove the files (... it _MIGHT_ also be related
      // to the async aspects...).
      const zipFiles = RUNNERS_MANAGER.getArchiveFiles(dropEvent)

      if(!zipFiles.length){
        this.giveFeedback("No archive file found.")

      }else if(zipFiles.length>1){
        this.giveFeedback("Cannot Import multiple archives.")

      }else{
        CONFIG.loadIdeContent = this.loadIdeContent.bind(this)
        await asyncLockedZipDropper(dropEvent, zipFiles[0])
      }
    }
  }


  loadIdeContent(zippedPyName, code){
    const i        = zippedPyName.indexOf(CONFIG.ZIP.pySep)
    const editorId = zippedPyName.slice(0, i)
    const name     = zippedPyName.slice(i+1)
    const jIde     = $('#'+editorId)

    if(!jIde[0]){
      this.giveFeedback(
        `Couldn't find the IDE #${editorId} in the page (associated python name: ${ name })`
      )
    }else{
      ace.edit(editorId).getSession().setValue(code);
      // No save/localStorage handling at this point (I don't have the IdeRunner object in hand :p )
      this.giveFeedback(`Loaded ${ editorId }${ CONFIG.ZIP.pySep }${ name }.`, "none")
    }
  }
}
















/**Mostly handle various GUI troubles, like:
 *    - Incomplete initialization of IDEs that are in hidden `==== "tabs"`
 *    - Wrong terminal dimensions for this or that reason (generally, also tabs...)
 *
 * Also holds the generic routines that will be used for IDE split screen and full screen modes.
 *
 * NOTE: the constructor also takes in charge some definitions needed only for child classes,
 *       to get a better/easier way to see what values are available.
 * */
export class IdeGuiManager extends IdeZipManager {

  /**Depending on the zoom level in the page at load time, the ACE editor _might fail to define
   * its own height properly!_ (no idea why...).
   * If that occurs, store the object, then the subscriptions routine will do another attempts
   * on next tick: Setting the css height makes it recompute the proper size and then allow to
   * apply fillAceGutter logic.
   * */
  static IDE_WITH_HEIGHT_TROUBLES = []


  /**IDE instance currently in "split screen" mode.
   * */
  static SPLITTED = null


  /**Model to clone, to get the extraline numbers in the gutter perfectly overlapped with the
   * ones added by ACE editors.
   * */
  static INNER_LINE_NUMS = $(
    '<span style="display: none;" tabindex="0"></span><span style="display: none;" tabindex="0"><span></span></span>'
  )


  constructor(editorId, callInit=true){
    super(editorId, false)

    this.global    = $("#global_"+editorId)
    this.termId    = "term_" + editorId
    this.inputIdH  = "#input_" + editorId
    this.counterH  = "#compteur_" + editorId
    this.solutionH = "#solution_" + editorId

    // Various flags OR data related to split.full screen modes management (only)
    this.guiIdeFlags = {
      gutter: false,                  // Ensured the minIdeLines are written in IDE the gutter
      resizedVertTerm: !this.isVert,  // Flag to know if the terminal size dimensions have already been enforced or not.
      splittedLines: 0,               // nLines (gutter) of the IDE in split mode (0 if not splitted)
      splitSlider: null,              // jQuery object
      initTermH: 0,                   // Initial height of the terminal, before entering any screen mode
      initGlobH: 0,                   // Initial height of this.global, before entering any screen mode
      hasObserver: false,             // (should be actually useless, now) Has already built auto-completion MutationObserver or not
      escapeIdeSearch: false,         // Stroke Esc while the search/replace IDE tool was on focus
      viewport: window.screen.height,
      ideMinWidth: cssPx(this.global,'min-width'),
      fullScreenPadPx: 15,            // Padding added in full screen mode
      internalIsFullScreen: false,    // Inner flag to handle mixed requests between full and split screen.
                                      // DO NOT use as flag to handle fullscreen behaviors themselves...
    }

    this.editor = null  // ACE object
    this.gutter = null  // ACE object child
    this.delay  = 200   // Delay to wait after clearing the terminal content, (user actions)
    this.getCodeToTest = ()=>this.editor.getSession().getValue()
    if(callInit) this._init()
  }


  /**Process to "re-initiate" the internal state of the IDE (useful for testing) */
  _init(){
    super._init()
    this.hiddenDivContent = true
  }


  get splitScreenActivated() { return IdeGuiManager.SPLITTED }

  get isInSplit() { return this === IdeGuiManager.SPLITTED }


  /**Routines to handle partial UI initializations, mostly for IDEs hidden in `=== "tabs"`
   * whe the page is loaded: applies visual updates conditionally, only if they haven't
   * been applied before.
   * Note that the logic is rather intricate with super calls...
   * */
  makeUpYourGui(){      // Cap overload

    if(this.global.is(':hidden')) return false    // Nothing to do yet (tabbed content).

    const todo = [
      this.guiUpdateFillAceGutter(),
      this.resizeVertTerm(),
    ]
    return todo.every(Boolean) && super.makeUpYourGui()
  }


  resizeVertTerm(){
    if(this.guiIdeFlags.resizedVertTerm) return true
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - Handle terminal window size")

    const divHeight = $('#'+this.id).css('height')
    this.global.find(".term_editor_v").css("height", divHeight)
    return this.guiIdeFlags.resizedVertTerm=true
  }


  /**Fill the entire gutter with minIdeLines line numbers: those won't disappear when the
   * user is deleting lines (probably because they use "remove first match" kind of logic).
   * */
  guiUpdateFillAceGutter(){
    if(!this.guiIdeFlags.gutter){
      this.fillAceGutter()
    }
    return this.guiIdeFlags.gutter = true
  }


  //-----------------------------------------------------------------------------------


  /**When the current IDE is neither in split nor full screen mode, store the current height of
   * its terminal so that it can be restored exactly when exiting from both modes.
   * This is needed because the terminal's height is tweaked on the fly to make the display nicer,
   * while the term height is also part of determining how many lines the ace gutter needs.
   * And the css margins dynamically changing at times _OTHER_ than when I compute the lines...
   * (and without tracking the initial height, you get terminals that get larger and larger when
   * the user is switching from split to full screen, modes repeatedly...)
   * */
  storeInitPositionsDataIfNeeded(){
    if(!somethingFullScreen() && !this.isInSplit){
      this.guiIdeFlags.initTermH = cssPx( this.global.find('.term_wrapper') )
      this.guiIdeFlags.initGlobH = cssPx( this.global )
    }
  }


  static enforceAceGutterFillAfterHeightsTroubles(){
    LOGGER_CONFIG.ACTIVATE && jsLogger('[GutterLogistics]')
    for(const obj of IdeGuiManager.IDE_WITH_HEIGHT_TROUBLES){
      obj.fillAceGutter()
    }
    LOGGER_CONFIG.ACTIVATE && jsLogger('[GutterLogistics] - Done')
  }


  /**Fill the entire gutter with minIdeLines line numbers: those won't disappear when the
   * user is deleting lines (probably because they use "remove first match" kind of logic).
   * */
  fillAceGutter(nLines=null){
    const model = this.gutter.children().first().clone()
                      .removeClass('ace_gutter-active-line').addClass('pmt-gutter')

    if(!model.length){
      // Depending on the page zoom level, the ACE editor might fail to initiate its own size,
      // leading to a failure lower in this function. So set any size here, then store the
      // object to apply on next tick.
      $(this.editor.container).css('height','2px')
      IdeGuiManager.IDE_WITH_HEIGHT_TROUBLES.push(this)
      return
    }

    nLines      ??= this.minIdeLines
    const height  = cssPx(model)
    const numbers = this.gutter.find('.pmt-gutter')
    const first_missing = numbers.length

    // Remove extra line numbers:
    for(let i=nLines ; i<first_missing ; i++){
      numbers[i] && numbers[i].remove()
    }

    // Add needed line numbers:
    for(let i=first_missing ; i<=nLines ; i++){
      const elt = model.clone().css('top', (i-1)*height+'px').text(i)
      elt.append(IdeGuiManager.INNER_LINE_NUMS.clone())
      this.gutter.append(elt)
    }
  }


  /**Handle the ACE editor gutter display, enforcing options.minLines line numbers so that
   * the editor fills the desired height in `div.global_editor_xxx`.
   * May adapt the terminal height on the fly, if "required", to make the UI "nicer".
   *
   * @param options: object with optional properties:
   *    - goingFullScreen:    Flag to know how to compute the height of the global div.
   *    - minLines, maxLines: Resulting values to set on the ACE editor. If not given, computed
   *                          automatically on the fly.
   *    - setup:              default=true (is setting up the mode or not)
   *    - topDivH:            default=Infinity. The max height space currently available for the
   *                          #pmt-top-div element.
   * */
  ideScreenModeVerticalResize(options={}){

    let {goingFullScreen, minLines, maxLines, setup, topDivH} = {
      goingFullScreen:false, setup:true, topDivH:Infinity, ...options
    }
    const exitingScreenMode = minLines !== undefined

    const term  = this.global.find('.term_editor')
    let   termH = this.guiIdeFlags.initTermH

    if(exitingScreenMode){
      this.global.css('padding', '0')

    }else{
      this.global.css('padding', this.guiIdeFlags.fullScreenPadPx)

      const btns  = this.global.find('.ide_buttons_div_wrapper')
      const lineH = cssPx( this.global.find('div.ace_gutter-layer').children().first() )
      const btnsH = cssPx(btns) + cssPx(btns,'margin-top') + cssPx(btns,'margin-bottom')

      const globH = -2 * this.guiIdeFlags.fullScreenPadPx + ( goingFullScreen
        ? this.guiIdeFlags.viewport
        : Math.min(cssPx(this.global), topDivH)
      )

      // Do not allow terminal + buttons to fill more than half the height:
      const halfMinusBtns = globH/2 - btnsH
      if( !this.isVert && termH > halfMinusBtns ){
        termH = halfMinusBtns
      }

      // Sliders on windaube are HUGE, and will generally be applied only once the 2 cols mode
      // has been entered (the width becoming insufficient to avoid the need for a horizontal
      // slider). So, reduce the number of lines by 1 for the editor _and_ the terminal.
      const availableH = globH - btnsH - termH * !this.isVert
      const nLines     = Math.max(
        3,  // So that screen modes & "commenting tests" buttons stay on different lines
        Math.floor( availableH/lineH ) - isWin
      )

      // Fix the exact terminal height so that the bottom space is always consistent:
      if(!this.isVert){
        termH = Math.max(termH, globH - btnsH - lineH * (nLines-isWin) )
      }

      // Set the actual number of lines to "lock" for the ACE editor:
      minLines = maxLines = nLines

      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "Computed minLines =", minLines)
      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', {globH, termH, btnsH, availableH, lineH})
    }

    this.editor.setOptions({minLines, maxLines})
    this.fillAceGutter(minLines)
    this.editor.resize()

    term.css('resize', setup||this.isVert ? 'unset' : 'vertical')
    term.css("height", (setup ? termH : this.guiIdeFlags.initTermH)+'px')

    LOGGER_CONFIG.ACTIVATE && jsLogger(
      '[ScreenMode]', "IDE resizing done -",
      this.editor.getOption('minLines'),
      this.editor.getOption('maxLines')
    )
  }
}















export class IdeFullScreenGlobalManager extends IdeGuiManager {

  static currentIde = null
  static someMenuOpened = false


  /**Identify if the given jQuery node is one related to a context menu (ACE menu, commands or
   * auto-completion), and returns a string representing which one it is (undefined otherwise).
   * */
  static isSomeAceMenu(jNode){
    return (
           jNode.children(CONFIG.element.aceSettings).length && "menu"
        || jNode.children(CONFIG.element.aceF1Cmds).length && "F1"
        || jNode.hasClass(CONFIG.element.aceAutoComplete) && "auto-complete"
    )
  }


  /**Globally keep track of any IDE menu currently opened.
   * */
  static setMenusFlag(isVisible) {
    if(isVisible){
      IdeFullScreenGlobalManager.someMenuOpened=true
    }else{
      // The menu flag has to be unset with a significant delay, otherwise the keydown event sees
      // the updated status. Note that the delay only applies to an internal state, so it doesn't
      // have any visible effect on the user's side.
      setTimeout(()=>{
        IdeFullScreenGlobalManager.someMenuOpened=false
      }, 150)
    }
  }


  /**Handling the various context menus, to try to forbid going full screen when the auto-
   * completion tool, ace settings or ace command window are opened and the user stroke ESC
   * to exit them. This requires to keep track of what is currently or has been added to
   * the body tag.
   *
   * Notes:
   *  - The same logic _while_ in full screen cannot be applied because there is no control
   *    over the escape button keypress event, there.
   *  - The global state must be tracked, because the resolution order of the Escape keypress
   *    closes the menu before the fullscreen related key event is triggered...
   *  - The MutationObserver is added _once only_ per page (hence, "static").
   * */
  static buildBodyObserver(){
    new MutationObserver((records)=>{
      if(!this.currentIde) return

      for(const record of records) {

        for (const node of record.removedNodes) {
          const kind = this.isSomeAceMenu($(node))
          if(kind && kind!='auto-complete') this.setMenusFlag(false)
          // The auto-complete window will be extracted as soon as it's added, so ignore it.
        }

        for(let node of record.addedNodes) {
          node = $(node)
          const kind = this.isSomeAceMenu(node)
          if(!kind) continue

          this.setMenusFlag(true)
          switch(kind){

            case 'menu':
              node.find('table')
                  .addClass('dummyclass')     // To deactivate a css background rule of pmt
                  .css('font-size','10px')
              break

            case 'auto-complete':
              if(!this.currentIde.guiIdeFlags.hasObserver){
                this.currentIde.guiIdeFlags.hasObserver = true
                // Creating one observer per instance is suboptimal, but there aren't many IDEs
                // per page, and ofr the sake of simplicity... (tracking the ide instance against
                // the html target) => "whatever"...)
                new MutationObserver(records=>{
                  for(const record of records){
                    const isVisible = $(record.target).css('display')!='none'
                    this.setMenusFlag(isVisible)
                  }
                }).observe(node[0], {attributeFilter:['style']})
              }
              break
          }

          if(somethingFullScreen() || kind=='auto-complete'){
            node.detach().appendTo(this.currentIde.global)
            /* Always move the auto-complete window because:
                  - each IDE has its own auto-completion div element
                  - this allows to add one single style observer the first time the auto-completion
                    tool is used for that IDE
             */
          }
        }
      }
    }).observe(document.body, {childList: true})
  }



  makeUpYourGui(){        // Cap overload

    /* Add the logistic to track the use of ESC while the IDE search/replace tool is used
      ...
      Except the div is not present until first use, so needs first an observer on the
      parent div.ace_scroller. XD

      WARNING: Shenanigans around here because:
        - The keyup event on this.global is always applied AFTER the search/replace tool has
          already been closed. So it cannot be used to track the state of the search tool.
        - A MutationObserver on the search tool also resolves it's records before the keydown
          event is triggered on this.global
        - A MutationObserver would see the closing action whatever triggered it... Not only
          through the use of ESC...
     */
    const scroller = this.global.find('div.ace_scroller')
    new MutationObserver( (_, scrollerObs) => {

      const search = scroller.children('.ace_search')
      if(search.length){
        // Apply once only (the search tool elements stay in the DOM once created)
        scrollerObs.disconnect()    // no need anymore

        search.on('keydown', (e)=>{
          if(e.key!='Escape') return;
          this.guiIdeFlags.escapeIdeSearch = true
        })

      }
    }).observe(scroller[0], {childList:true})

    return super.makeUpYourGui()
  }
}


IdeFullScreenGlobalManager.buildBodyObserver()












class IdeFullScreenManager extends IdeFullScreenGlobalManager {


  switchFullScreenFromButton(){
    if(!somethingFullScreen()){
      this.requestFullScreen()
    }else{
      document.exitFullscreen()
    }
  }


  /**Finalize the IDE layout once full screen mode has been setup by the browser, then wait
   * for the exit. This is not done through an event, because it might happen in different ways,
   * requiring different results/behaviors (Esc, click "full screen" or "split screen" buttons).
   * */
  requestFullScreen(){

    this.storeInitPositionsDataIfNeeded()
    const focused = document.activeElement

    this.global[0].requestFullscreen().then(async _=>{
      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "Full screen ready")

      const splitScreenBtn = this.global.find(".ide-split-screen")

      IdeFullScreenGlobalManager.currentIde = this
        // (just in case the user used a button without typing anything in the editor yet)
      this.guiIdeFlags.internalIsFullScreen = true
      splitScreenBtn.addClass('deactivated')
      this.ideScreenModeVerticalResize({goingFullScreen: true})
      focused.focus()   // Always give back the focus to the element which had it before.

      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "Full screen setup - DONE")


      // Wait forever if needed...
      while(somethingFullScreen()) await sleep(50)


      const minLines = this.guiIdeFlags.splittedLines || this.minIdeLines
      const maxLines = this.guiIdeFlags.splittedLines || this.maxIdeLines
      LOGGER_CONFIG.ACTIVATE && jsLogger(
        '[ScreenMode]', "Full screen reversion with", minLines, maxLines
      )

      if(this.splitScreenActivated) splitScreenBtn.removeClass('deactivated')
      this.guiIdeFlags.internalIsFullScreen = false
      const resizeOption = this.isInSplit ? {topDivH:this.setupTopDivHeight()}
                                          : {setup:false, minLines, maxLines}
      this.ideScreenModeVerticalResize(resizeOption)

      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "Full screen reversion - DONE")
    })
  }
}













export class IdeSplitScreenManager extends IdeFullScreenManager {


  /**Set the pmt-top-div height so that it occupies the whole viewport.
   * */
  setupTopDivHeight(topDiv, header){
    topDiv ??= $("#"+CONFIG.element.pmtTopDiv)
    if(!topDiv[0]) return;
    const headerHpx = ( header ?? $('body > header') ).css('height')
    topDiv.css('height', `calc( 100vh - ${ headerHpx })`)
    return cssPx(topDiv)
  }


  async switchSplitScreenFromButton(e, autoScroll=true){

    this.storeInitPositionsDataIfNeeded()

    const focused      = document.activeElement
    const isFullScreen = somethingFullScreen()
    const swapColumns  = e && useCtrl(e.originalEvent ?? e)    // Adapt for non jQuery events

    if(isFullScreen){
      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "Exit full screen mode")
      document.exitFullscreen()

      // Everything is async with various delays/things waiting on each others, so wait
      // for the internal flag instead of document.fullscreenElement, so that the IDE can
      // apply its logic when exiting it from another async method.
      while(this.guiIdeFlags.internalIsFullScreen) await sleep(50)
      await sleep(50)  // Extra delay so that the logic in `requestFullScreen.then` finishes

      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "Full screen mode exited")
    }

    this.switchSplitScreen(swapColumns, isFullScreen, autoScroll)
    focused.focus()
  }



  /**Go "in" or "out" of split screen mode for the current IDE instance, handling the possible
   * initial states, like:
   *
   *    - If currently in full screen:
   *          1. exit full screen
   *          2. set current IDE in split mode
   *
   *    - If another IDE is currently in split screen mode:
   *          1. make it exit split screen
   *          2. set current IDE in split mode
   *
   *    - If the current IDE is in split screen mode:
   *          1. make it exit split screen
   *
   * This involves DOM reorganizations, moving entire parts of it here or there...
   * */
  switchSplitScreen(swapColumns, fromFullScreen, autoScroll=true){

    // Allow to switch from one IDE to another, staying in "split" mode:
    if(this.splitScreenActivated && !this.isInSplit){
      LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "Exit previous splitted")
      this.splitScreenActivated.switchSplitScreen(swapColumns, false)
    }
    const topDivId = CONFIG.element.pmtTopDiv
    const topDiv   = $(document.getElementById(topDivId) ?? `<div id="${ topDivId }"></div>`)

    // Check for columns reversion request only:
    if(this.isInSplit && swapColumns){
      topDiv.append(
        topDiv.children().get().map(elt=>$(elt).detach()).reverse()
      )
      return;

    }else if(this.isInSplit && fromFullScreen){
      return    // Restoring split screen mode for the current IDE, coming from full screen
    }

    const setup    = !this.isInSplit || fromFullScreen
    const header   = $('body > header')
    const page     = $("div.md-container")
    const splitBtn = this.global.find(".ide-split-screen")
    const srcRepl  = this._getPlaceholder()
    const slider   = this._getSlidingElement(topDiv)
    const headerH  = cssPx(header)

    const changes  = setup ? {
      log: 'Setup',
      rearrangeDom: ()=>{ topDiv.insertAfter(header)
                          const order = [page, slider, this.global]
                          if(swapColumns) order.reverse()
                          topDiv.append(order)
                          const topDivH = this.setupTopDivHeight(topDiv, header)
                          srcRepl.insertBefore($(this.solutionH))
                          return {topDivH}
                        },
      ideResizeArgs:      {setup},
      splitBtnClass:     'remove',
      splitIdeClass:     'add',
      SPLITTED_becomes:   this,
      splittedLinesFlag:  this.editor.getOption('minLines'),
      scrollRefBefore:    this.global,
      scrollRefAfter:     srcRepl,
      eltToScroll:        page[0],
    }:{
      log: 'Teardown',
      rearrangeDom: ()=>{ page.insertAfter(header)
                          slider.find('button').off()
                          srcRepl.replaceWith(this.global)
                          topDiv.remove()
                          return {}
                        },
      ideResizeArgs:      {setup, minLines:this.minIdeLines, maxLines:this.maxIdeLines},
      splitBtnClass:     'add',
      splitIdeClass:     'remove',
      SPLITTED_becomes:   null,
      splittedLinesFlag:  0,
      scrollRefBefore:    srcRepl,
      scrollRefAfter:     this.global,
      eltToScroll:        window,
      initHeight:         this.guiIdeFlags.initGlobH,
    }

    //------------------------------------------------------------

    LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', changes.log, "split screen mode")

    // BEFORE detaching anything:
    let topSrc = changes.scrollRefBefore[0].getBoundingClientRect().top


    // Reorganize the DOM:
    page.detach()
    this.global.detach()
    const data = changes.rearrangeDom()


    // Resize the IDE once moved, adding or removing line numbers to fill appropriately
    // the space when needed:
    if('topDivH' in data) changes.ideResizeArgs.topDivH = data.topDivH
    this.ideScreenModeVerticalResize(changes.ideResizeArgs)


    // Update various tracked values or UI element classes:
    splitBtn[    changes.splitBtnClass+'Class' ]('deactivated')
    this.global[ changes.splitIdeClass+'Class' ]('split')
    this.guiIdeFlags.splittedLines = changes.splittedLinesFlag
    IdeGuiManager.SPLITTED = changes.SPLITTED_becomes


    // Handle the final scroll position once everything is in place, keeping the original placement
    // as much as possible, unless the moved element would end up outside of the viewport.
    if(autoScroll){
      const viewH = window.innerHeight || document.documentElement.clientHeight
      const box   = changes.scrollRefAfter[0].getBoundingClientRect()

      if(topSrc < headerH || topSrc > viewH-50){
        const eltH = changes.initHeight ?? box.height
        topSrc = headerH + Math.max(50, (viewH - eltH) / 2)
      }
      changes.eltToScroll.scrollBy(0, box.top - topSrc)
    }

    LOGGER_CONFIG.ACTIVATE && jsLogger('[ScreenMode]', "split handling - DONE")
  }



  /**Build or extract the IDE placeholder element (jQuery).
   * */
  _getPlaceholder(){
    const placeholderId  = "pmt-ide-placeholder"
    const placeholderMsg = CONFIG.lang.splitModePlaceholder.msg
    const placeholder    = `<div id="${ placeholderId }">${ placeholderMsg }</div>`
    const jPlaceholder   = $(document.getElementById(placeholderId) ?? placeholder)
    return jPlaceholder
  }


  /**Build or extract the slider element to move the vertical separation (jQuery).
   * */
  _getSlidingElement(topDiv){
    const sliderWrapperID = "pmt-slider-div"
    const sliderId        = "pmt-split-slider"
    const sliderElements  = `<div id="${ sliderWrapperID }-div"><div id="${ sliderWrapperID }"><button id="${ sliderId }"></button></div></div>`
    const limit           = this.guiIdeFlags.ideMinWidth

    let slider = $(sliderWrapperID)
    if(!slider[0]){
      slider = $(sliderElements)
      slider.on('dblclick', function(){topDiv.css('grid-template-columns', `50% min-content auto`)})
      slider.on('mousedown', function(){
        topDiv.on('mouseup', _=>{ topDiv.off() })
        topDiv.on('mousemove', function(e){
          const width = cssPx(topDiv,'width')
          if(width > 2*limit){
            const col1  = Math.min( Math.max(limit, e.originalEvent.pageX), width-limit)
            const col1p = (100 * col1/width).toFixed(1)
            topDiv.css('grid-template-columns', `${ col1p }% min-content auto`)
          }
        })
      })
    }
    return slider
  }
}
