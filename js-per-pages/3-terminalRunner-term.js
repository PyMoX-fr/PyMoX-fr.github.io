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
  textShortener,
  txtFormat,
  withPyodideAsyncLock,
  RunningProfile
 } from 'functools'
import { PyodideSectionsRunner } from "2-pyodideSectionsRunner-runner-pyodide"
import { RuntimeManager } from '1-runtimeManager-runtime-pyodide'








export const observeResizeOf=(function(){

  /**Global ResizeObserver:
   *
   * Terminals (isolated or with IDEs) are subscribing to the observer through the `observeResizeOf`
   * function, then the observer transfers the call to the desired JS object, calling its `handleResize`
   * method with the ResizeObserverEntry as argument.
   *
   * WARNING:
   *    1) Make sure no element subscribes several times to the observer (typically: IDE+its terminal!)
   *    2) Inheritance will handle the fact that the needed behaviors are different.
   *    3) Defined here _if ever_ it becomes useful with isolated terminals but, until now, those are
   *       handling their size gracefully, without any extra logistic...
   */
  const RESIZE_OBS = new ResizeObserver(
    _.throttle( (entries)=>{
      for(const entry of entries){
        const runnerThis = SIZE_OBS_MAP.get(entry.target)
        runnerThis.handleResize(entry)
      }
    }), 50, {leading:false, trailing:true}
  )

  const SIZE_OBS_MAP = new Map()

  return (jTarget, runnerThis)=>{
    jTarget.each(function(){
      SIZE_OBS_MAP.set(this, runnerThis)
      RESIZE_OBS.observe(this)
    })
  }
})()






const TERMINAL_CRAZY_SPACE = "\\u00a0"
const TERMINAL_SPACES_REGEXP = new RegExp(TERMINAL_CRAZY_SPACE, "ug")
const TERMINAL_RSTRIP_SPACE_REGEXP = new RegExp(`${ TERMINAL_CRAZY_SPACE }$`, "u")
const TERMINAL_PROMPT_REGEX = /^(?:[.]{0,3}>{0,3})$/


function getSelectionText(){
  // Code inspired by https://stackoverflow.com/questions/5379120/get-the-highlighted-selected-text

  let text = "";
  if(window.getSelection){
    if(!window.getSelection().toString()){
      return ""     // Avoid some mess when no selection!
    }
    text = new TermSelectionExtractor().extract()

  }else if(document.selection && document.selection.type != "Control") {
      console.warn("Unsupported copy from PMT terminal (fallback to default/simplified behavior).")
      text = document.selection.createRange().text;
  }

  // Just like usual, jQuery terminals are messing with the content, replacing spaces
  // with "\u00a0" characters... x/
  text = text.replace(TERMINAL_SPACES_REGEXP, " ")
  // console.log(text)
  return text;
}







/**Extraction of text selection using the window.getSelection is not enough to extract properly
 * empty lines...
 * That's... UNFORTUNATE!!!!!  DX
 *
 * Terminal output/contents are organized in the following way (ignoring top levels elements):
 *
 *        div.terminal-wrapper
 *            ├── div.terminal-output                 // All older commands or feedback blocks
 *            │     ├── div[data-index]               // One block (aka, one older command, or one feedback block)
 *            │     ├── ...
 *            │     └── div[data-index]
 *            │           ├── div                     // That represents one single line in the block
 *            │           ├── ...
 *            │           └── div.cmd-end-line        // Always present. The class is a flag for jQ.terminals.
 *            │                 └── (various spans)
 *            │
 *            └── div.cmd                             // Current command element, where the user is typing
 *                └── div.cmd-wrapper                 // Current command element, where the user is typing
 *                      ├── span.cmd-prompt           // Always first. Either ">>> " or "... "
 *                      │     └── span
 *                      │           └── ">>> " or "... "
 *                      ├── div.cmd-end-line          // One div per command line.
 *                      │     ├── span                // One span PER CHAR
 *                      │     ├── ...
 *                      │     └── span                // Always ending with an extra space! (allows to show the blinking cursor at the end of the line...)
 *                      ├── ...
 *                      ├── div.cmd-cursor-line       // Cmd line  holding the cursor (might be first or last)
 *                      │     ├── span                // before cursor, MAY BE EMPTY
 *                      │     │     ├── span          // One span PER CHAR
 *                      │     │     ├── ...
 *                      │     │     └── span
 *                      │     ├── span.cmd-cursor.cmd-end-line
 *                      │     │     └── span
 *                      │     │         └── span
 *                      │     │             └── span  // One char, or a space if at the end of the line (then the next bunch of spans IS EMPTY)
 *                      │     └── span                // after cursor, MAY BE EMPTY
 *                      │           ├── span          // One span PER CHAR
 *                      │           ├── ...
 *                      │           └── span          // Always ending with an extra space, IF not empty (cursor already at the end of the line)
 *                      ├── ...
 *                      └── div.cmd-end-line
 *                            └── (various spans)
 *
 * WARNING:
 *    - The DocumentFragment objects may at most overlap on both `div.terminal-output` AND
 *      the `div.cmd-wrapper`.
 *    - The number of Range objects IS NOT guaranteed. Might 1 to... more (there are more than
 *      one when the current command line is multiline, independently of the cursors position).
 *
 *
 * GENERIC STRATEGY:
 *    1. If there are multiple ranges, merge them all together in a unique Range.
 *    2. Depending on the common ancestor, decide what to extract, and how.
 *          - If the common ancestor is "too wide", just return "" (this will trigger the
 *            default copy behavior)
 *          - Otherwise, extract the terminal-output on one side (if any), then the terminal
 *            command on the other side.
 *
 *    DO NOT rely on the ranges themselves, but only on the actual DOM structure.
 * */
class TermSelectionExtractor {
  /*
  Code usable in the sandbox to test the behaviors :

N = 1
import js
getattr(js.window,"$").terminal.active().set_command(("print(43)\n"*N).strip())
assert False, 'slgjkhjkgfhd\n\nlkhsgkjhsdg'
  */

  constructor(){
    this.rng   = null
    this.conf  = this._analyze()    // Set this.rng on the fly
    this.lines = []
  }


  /**Debugging purpose only.
   * */
  show(title, elts={}, rngs={}){
    console.log("*******************\n"+title)
    for(const name in elts){
      const elt = elts[name]
      console.log(name+':', elt)
    }
    console.log("----")
    for(const name in rngs){
      const rng = rngs[name]
      console.log(name+':', rng.toString())
      console.log(rng)
    }
  }


  _analyze(){

    const findDivOfInterest = (elt)=> elt.closest([
      'cmd-wrapper',         // command only
      'cmd',                 // command only
      'terminal-output',     // output only
      'terminal-wrapper',    // Cmd for sure, but output??? -> need to rebuild a Range
      'terminal-scroller',   // Cmd for sure, but output??? -> need to rebuild a Range
    ].map(rule=>'div.'+rule).join(', '))


    const selection = window.getSelection()
    this.rng = selection.getRangeAt(0).cloneRange()

    // Merge all ranges into one, BUT... the selection could contain an extra empty Range
    // that will make a total mess of the extraction.
    // This range MUST be ignored and can be identified as following:
    //    - Having a startContainer node being `div.cmd`
    //    - Its offset is greater than 0
    //    - It's always the last range, even if the user started by clicking to much on
    //      the left of the line.
    let closingIdx = selection.rangeCount-1
    let closingRng = selection.getRangeAt(closingIdx)
    const isOutRng = $(closingIdx.startContainer).is('div.cmd') && closingRng.startOffset > 0
    if(isOutRng) closingIdx--

    if(closingIdx > 0){
      const endRng = selection.getRangeAt(selection.rangeCount-1)
      this.rng.setEnd(endRng.endContainer, endRng.endOffset)
    }

    // Fix the endContainer and rebuild a new Range if needed:
    //    - iF the cursor is on the very end of the current command line...
    //    - and depending on the initial the user's mouse click in the terminal (as in,
    //      enough on the right or the left of the text)...
    let elder = $(this.rng.commonAncestorContainer)
    let jEnd  = $(this.rng.endContainer)
    let end   = findDivOfInterest(jEnd)

    const isWrongEnd = end.is('.terminal-scroller, .terminal-wrapper, .cmd') || jEnd.is('.cmd-wrapper')
      // Do NOT test .cmd-wrapper on end: it would systematically extend selections to the end
      // of the current command, il any.

    if(isWrongEnd){
      if(end.is('.cmd-wrapper')) end = end.parent()
      const tail = end.find('div.cmd-wrapper > :last-child')[0]
      this.rng.setEndAfter(tail)
      elder = $(this.rng.commonAncestorContainer)
      if(!tail){
        throw new Error("Couldn't find div.cmd-wrapper from "+elder.toString())
      }
    }

    // Too wide => selection going out of the terminal:
    if(elder.is("body, main, article")){
      return {invalid:true}
    }

    // Get lowest possible meaningful div to identify what kind of content(s) is to be copied:
    const div = findDivOfInterest(elder)
    if(div.is('.cmd, .cmd-wrapper')) return {hasCmd: true}
    if(div.is('.terminal-output'))   return {hasOutput: true}
    if(div.is('.terminal-wrapper'))  return {hasOutput: true, hasCmd: true}
    return {invalid:true}
  }



  extract(){
    // console.log('conf', this.conf)
    // Selection out of bounds of the div.terminal-wrapper
    if(this.conf.invalid) return ""

    if(this.conf.hasOutput) this._extractOutput()
    if(this.conf.hasCmd)    this._extractCmd()
    const out = this.lines.join('\n')
    return out
  }



  _getParentTag(side, stopUpOn){
    const node   = $(this.rng[side+'Container'])
    const offset = Math.max(0, this.rng[side+'Offset'] - (side=='end'))
    let   elt    = node[0].nodeName=='#text' ? node : node.children().eq(offset)
    if(!elt.length) elt = node   // (resulted in negative index...)

    while(!stopUpOn(elt)){
      elt = elt.parent()
    }
    return elt
  }

  pushLine(line, stripOneSpace=false){
    const txt =  stripOneSpace ? line.replace(TERMINAL_RSTRIP_SPACE_REGEXP,'') : line
    this.lines.push(txt)
  }



  /**Extract the string content of the given Range, if it's not collapsed.
   *
   * @on:       If given, must be a jQuery identifier string: the content Range is then cloned and
   *            copy the innerText data of all the elements matching the @on rule.
   * @stripOne: When extracting the terminal current command lines, those hold a trailing space,
   *            that has to be removed.
   */
  _getRangeTxt(rng, stripOneSpace, options=null){
    if(rng.collapsed) return;

    if(!options || options.centerAsOneLine){
      // `head` and `tail` ranges are _supposed_ to be single line contents, so extract directly:
      this.pushLine(rng.toString(), stripOneSpace)

    }else{
      // The `center` Range may be multiline, so extract the whole content, then pick complete
      // lines inside the fragment, when found:
      const extractor = this
      $(rng.cloneContents()).find(options.centerJRule).each(function(){
        const txt = this.innerText
        extractor.pushLine(txt, stripOneSpace)
      })
    }
  }


  _extractRanges(head, center, tail, options={}){
    options = {
      centerJRule:null, centerAsOneLine:false, stripOneSpace:false, ...options
    }
    this._getRangeTxt(head,   options.stripOneSpace)
    this._getRangeTxt(center, options.stripOneSpace, options)
    this._getRangeTxt(tail,   options.stripOneSpace)
  }


  _workoutBaseRange(IsLine, spotLine){
    const top          = $(this.rng.commonAncestorContainer)
    const topTag       = top[0].nodeName    // Don't use jQuery for this....

    const isTxtOnly    = topTag == '#text'
    const isSpan       = topTag == 'SPAN'
    const isMultiSpan  = topTag == 'DIV' && IsLine(top)
    const isSingleLine = isTxtOnly || isSpan || isMultiSpan

    let headLine, tailLine
    let [head, center, tail] = [0,0,0].map(_=>this.rng.cloneRange())

    if(!isSingleLine){
      // At this point:
      //    - The given Range IS (supposed to be) multiline, but "dunno where"
      //    - It could be in the terminal-output div only,
      //    - ...or in the current command line(s) only,
      //    - ...or covering both.
      //
      // So, the idea is to create 3 new Ranges:
      //      - The head Range covers only the first line (potentially incomplete)
      //      - All the lines in the middle (potentially collapsed Range, that
      //        may cover both output and cmd-wrapper)
      //      - The tail Range covers the last line (potentially incomplete)
      //
      // These will then be cut further if need by caller (to extract the output or cmd
      // parts solely.)

      headLine = this._getParentTag('start', spotLine)
      tailLine = this._getParentTag('end', spotLine)
      head.setEndAfter(headLine[0])
      center.setStartAfter(headLine[0])
      center.setEndBefore(tailLine[0])
      tail.setStartBefore(tailLine[0])
    }
    // this.show('BASE', {top, headLine, tailLine, isSingleLine}, {rng:this.rng, head, center, tail})

    return {top, head, center, tail, headLine, tailLine, isSingleLine}
  }





  _extractOutput(){
    let {
      top, head, center, tail, headLine, tailLine, isSingleLine
    }=this._workoutBaseRange(
      (elt) => elt.parent().attr('data-index'),
      (elt) => elt.is('div.terminal-wrapper') || elt.parent().is('div[data-index]')
    )

    if(isSingleLine){
      this.pushLine(this.rng.toString())
      return
    }

    // Adapt center and collapse tail if there is a Cmd part:
    if(this.conf.hasCmd || tailLine.is('div.terminal-wrapper')){
      tail.collapse()   // Remove any Cmd part
      const out = top.find('div.terminal-output')
      center.setEndAfter(out[0])
      center.setStart(head.endContainer, head.endOffset)
    }

    let centerAsOneLine = false
    let centerJRule = "div[data-index] > div"
    const topCenter   = $(center.commonAncestorContainer)
    if(!topCenter.is('div[class]')){
      centerAsOneLine = true
      centerJRule = null
    }
    // this.show('OUT', {head, center, tail})

    this._extractRanges(head, center, tail, {centerAsOneLine, centerJRule})
  }


  _extractCmd(){
    let {
      top, head, center, tail, headLine, tailLine, isSingleLine
    }=this._workoutBaseRange(
      (elt) => elt.is('div[role=presentation], span.cmd-prompt'),
      (elt) => elt.is('div[role=presentation], span.cmd-prompt, div.terminal-wrapper'),
      true
    )

    // Shortcuts to avoid a fucking mess when possible...
    const cmdWrapper = $(this.rng.startContainer).closest('div.terminal-scroller').find('div.cmd-wrapper')
    const children   = cmdWrapper.children()
    isSingleLine   ||= !this.conf.hasOutput && children.length == 2

    if(isSingleLine){
      this.pushLine(this.rng.toString(), true)
      return
    }

    const headIsTail = headLine.is('div[role=presentation') && headLine[0]===tailLine[0]
    if(headIsTail){
      head.collapse(true)
      // DO NOT merge this part of the logic within the next `if` condition (they aren't
      // equivalent/common...).
    }

    // Adapt center and collapse head if there is an output part:
    if(this.conf.hasOutput || headLine.is('div.terminal-wrapper')){
      head.collapse(true)     // Collapse on start, to keep the info to handle the prompt later
      const cmd = top.is('div.cmd-wrapper') ? top : top.find('div.cmd-wrapper')
      center.setStartBefore(cmd[0])
      center.setEnd(tail.startContainer, tail.startOffset)
    }
    // this.show('CMD', {head, center, tail})

    const iPromptMaybe = this.lines.length
    this._extractRanges(head, center, tail, {
      centerJRule: "div[role=presentation], span.cmd-prompt",
      stripOneSpace: true,
    })

    // Merge the prompt (if any) in the next string:
    const prompt = this.lines[iPromptMaybe]
    const promptWithNext = iPromptMaybe+1 < this.lines.length && TERMINAL_PROMPT_REGEX.test(prompt)
    if(promptWithNext){
      this.lines.splice(iPromptMaybe, 1)
      this.lines[iPromptMaybe] = prompt + ' ' + this.lines[iPromptMaybe]
    }
  }
}

















class _TerminalHandler extends PyodideSectionsRunner {


  get isTerminal() { return true }
  get hasTerminal(){ return true }


  constructor(id, callInit=true){
    super(id, false)
    this.terminal      = null     // jQuery.terminal object
    this.termWrapper   = null     // jQuery Html element
    this.activatedFocus= true     // Forbid/allow focusing on the terminal (or the editor)
    this.termEnabled   = false    // Flag to enforce activation of the terminal (admonitions+tabbed troubles)
    this.clearTerminalWhenLocking = true
    this.isIsolated    = id.startsWith("term_only")
    this.cmdChunk      = ""               // SINGLE line command to run
    this.cmdOnTheRun   = ""               // Complete code of the currently written multiline command ("executed so far")
    this.cmdStack      = []               // Multiline commands to come yet (coming from a copy/paste)
    this.eraseCmdOnTheRunInPost = false   // Flag to erase this.cmdOnTheRun when needed, but in post section only (so that __USER_CMD__ stays consistent on user's side)
    this.joinTerminalLines = false        // UI button related (internal value)
    this.pyodideConsoleRunner = null      // Will be: this.runPyodideConsole.bind(this)
    if(callInit) this._init()
  }

  _init(){
    super._init()
    this.alreadyRanEnv = false    // Specific to terminals, but defined "for everyone"
  }


  /**Build a jQuery terminal and bind it to the underlying pyodide runtime.
   *
   * WARNING:  If this is an IdeEditorHandler, this.id is the id of the editor div, not
   *           the id of the terminal div ! (hence the use of the termId argument)
   * */
  build(termId=null){

    super.build()

    if(!termId) termId = this.id
    const jqTermId = '#' + termId

    LOGGER_CONFIG.ACTIVATE && jsLogger("[Terminal] - build " + jqTermId)

    const termOptions = {
      greetings: "",                            // Cancel terminal banner (welcome message),
      completionEscape: false,
      prompt: CONFIG.MSG.promptStart,
      outputLimit: this.stdoutCutOff,           // this.terminal.settings().outputLimit=value (to change dynamically)
      enabled: false,                           // GET RID OF THE DAMN AUTO-SCROLL!!!!!!
      // wrap: getWrapTerms(),                  // This also deactivate colors... FUCK THIS!
      keymap: this.getTerminalBindings(),
      completion: function(command, callback){  // terminal AUTO-completion
        const suggestionsArr = PyodideSectionsRunner.pyFuncs.complete(command)
        callback(suggestionsArr)
      },
      mousewheel: function(){ return true },    // Seems enough to fix the "no mouse wheel" troubles on terminals
      onBlur: function(){},                     // Allow to leave the textarea, focus-wise.
    }                                           // DO NOT PUT ANY CODE INSIDE THIS !! (I don't understand what's going
                                                // on here, but  this is the only way I found to make all this work...)

    this.terminal    = $(jqTermId).terminal(this.runners.cmd.asEvent, termOptions)
    this.termWrapper = this.terminal.parent()

    this.terminal.history().clear()             // Clear the history from localeStorage.

    if(CONFIG._devMode) CONFIG.terms[termId]=this.terminal

    this.addEventToRunOnce(
      this.terminal, this.ensureTerminalActivationOnClick.bind(this), true
    )
    this.termWrapper.on(
      'click', this.attemptAtResolvingTerminalUiTroubles.bind(this)
    )
    this.termWrapper.find(".stdout-wraps-btn").on(
      'click', this.swapTerminalLinesJoinerForCopies.bind(this)
    )
    this.termWrapper.find(".stdout-ctrl").on(
      'click', _=>{ this.updateStdoutCutFeedback(!this.cutFeedback) }
    )
    this.updateStdoutCutFeedback(this.cutFeedback)

    this.prefillTermIfAny()
  }


  lockDisplay(){ this.terminal.pause() }
  unlockDisplay(){ this.terminal.resume() }


  resetElement(){
    super.resetElement()
    this.terminal.clear()
  }

  focusTerminal(arg=undefined){
    // Shenanigans here to be sure to get around the crazy terminal implementation,
    // introducing `focusTerminal` without doing any change in the logic
    if(!this.activatedFocus) return;

    if(arg===undefined) this.terminal.focus()
    else                this.terminal.focus(arg)
  }

  activateFocus(isActive=true){
    this.activatedFocus = isActive
  }

  focusElement(){
    this.focusTerminal()
  }

  scrollIntoView(){
    super.scrollIntoView( this.termWrapper[0] )
  }



  /**Update the UI button status and the inner state of cutFeedback to the given value.
   * */
  updateStdoutCutFeedback(to){
    this.data.cut_feedback = CONFIG.cutFeedback = to
    const method = to ? 'removeClass' : 'addClass'
    $(this.termWrapper).find(".stdout-x-ray-svg")[method]('py_mk_hidden')
  }



  swapTerminalLinesJoinerForCopies(){
    this.joinTerminalLines = !this.joinTerminalLines
    const method = this.joinTerminalLines ? 'removeClass' : 'addClass'
    this.termWrapper.find(".stdout-wraps-btn")[method]('deactivated')
  }


  /**Because terminals are created deactivated, add an EventListener for click to reactivate them.
   * Using the async lock so that the user cannot resume a terminal while it's running (could
   * occur on first click/run).
   *
   * - Does nothing if the terminal already got activated by other means.
   * - If a selection exists, do not enable the terminal or the selection gets lost.
   * */
  ensureTerminalActivationOnClick(){
    if(!this.termEnabled){
      if(!getSelectionText()){
        this.focusTerminal(true)
        this.terminal.enable()
      }
      this.termEnabled = true
    }
  }


  /**Transfer user's resize operations to the terminal wrapper, so that the content stays
   * confined to the wrapping div.
   * */
  terminalAutoWidthOnResize(){
    const wrapperWidth = this.termWrapper.width()
    const termWidth    = this.terminal.width()
    if(wrapperWidth!=termWidth){
      this.terminal.width(wrapperWidth)
    }
  }


  /**This routine tries to fix the following bugs with terminals:
   *    - The 0px width terminals on tab change (markdown: `=== "tabbed"`):
   *    - The FILL content lost when the user changed of tab anywhere in the page...
   * */
  attemptAtResolvingTerminalUiTroubles(){
    const w = this.termWrapper.css('width')
    if(w != this.terminal.css('width')){
      this.terminal.css('width', w)
    }
    const h = this.termWrapper.css('height')
    if(h != this.terminal.css('height')){
      this.terminal.css('height', h)
    }
  }


  /**Routine adding the given callback on a jQuery @target click event, with an automatic
   * "unsubscription on first click" wrapping logic.
   * If @withLock is true, the routine is using the Pyodide async lock, to avoid messing
   * with the global state of the page.
   * */
  addEventToRunOnce(target, cbk, withLock=false, event='click'){
    let clickHandler = async _=>{
      target.off(event, clickHandler)
      cbk()
    }
    if(withLock){
      clickHandler = withPyodideAsyncLock('term_'+event, clickHandler)
    }
    target.on(event, clickHandler)
  }



  /**Hook returning the configuration for terminal keyboard shortcuts bindings.
   * To override in child classes when needed.
   *
   * Handled here: transfer KeyInterrupt from DOM to python runtime (note: actually
   * useless as long as no worker used!).
   * */
  getTerminalBindings(){
    return ({
      "CTRL+C": async (e) => {

        // Skip if some text is selected (=> copy!)
        let txt = getSelectionText()
        if (txt) {
          e.preventDefault()
          e.stopPropagation()
          if(this.joinTerminalLines){
            txt = txt.replace(/\n/g, '')
          }
          await navigator.clipboard.writeText(txt)
          return
        }

        let currentCmd = this.terminal.get_command();
        PyodideSectionsRunner.pyFuncs.clear_console();
        this.terminal.echo(CONFIG.MSG.promptStart + currentCmd);
        this.terminal.echo(txtFormat.error("KeyboardInterrupt"));
        this.terminal.set_command("");
        this.terminal.set_prompt(CONFIG.MSG.promptStart);
      },
    })
  }



  prefillTermIfAny(){
    if(this.prefillTerm){
      const history = this.terminal.history()
      history.append(this.prefillTerm)
      this.terminal.set_command(this.prefillTerm)
    }
  }


  setupGlobalConfig(){
    super.setupGlobalConfig()
    CONFIG.cutFeedback = this.cutFeedback
  }




  /**When a terminal is available, display stdout and errors in it, if any.
   *
   *  @format: by default `"error"`. Formatting to use for the jQuery.terminal.
   * If @format is `null`, the @content is already formatted for the terminal and no txtFormat
   * option must be applied anymore.
   * */
  giveFeedback(content, format='error'){
    if(content){
      if(format!==null) content = txtFormat[format](content)
      this.terminalEcho(content)
    }
  }


  /**Feedback coming from pyodide, one way or another...
   * Any call reaching this method is about a content to unconditionally show in the terminal.
   *(Note: @isPrint is only used in children classes)
   *
   * @throws: Error if isPrint is false and the key isn't the expected one, of if the `format`
   *          option is unknown.
   */
  termFeedbackFromPyodide(_key, msg, format, isPrint=false, newline=false){
    msg = textShortener(msg)
    this.terminalEcho(msg, {newline, format})
  }


  /**Internal hook, allowing to capture all the content sent to the terminal from a parent class
   * (aka, IdeTester...).
   * @options argument is never used, UNLESS the call comes from `termFeedbackFromPyodide`.
   *
   * WARNING: at this point, the content is already formatted with jQuery.terminal syntaxes,
   *          __UNLESS__ @options is used (hence, the content comes from a pyodide call).
   * */
  terminalEcho(content, options=null){
    const termOptions = {newline: true}   // jQuery terminal default behavior
    if(options){
      if(!txtFormat[options.format]){
        throw new Error(`format='${options.format}' is not a valid value for terminal_message(...)`)
      }
      content = txtFormat[options.format](content)
      termOptions.newline = options.newline
    }
    this.terminal.echo(content, termOptions)
  }
}












export class TerminalRunner extends _TerminalHandler {

  // @Override
  buildRunners(){
    this.pyodideConsoleRunner = this.runPyodideConsole.bind(this)
    this.addRunnerIfNotDefinedYet(
      this.buildAsyncPythonExecutors(), RunningProfile.PROPS.cmd, true
    )
  }


  /**Generate the async-locked callback used to run commands typed into the terminal.
   * */
  buildAsyncPythonExecutors(running=RunningProfile.PROFILE.cmd){
    return this.lockedRunnerWithBigFailWarningFactory(
      running,
      this.setupRuntimeTerminalCmd,
      this.runTermCommand,
      this.teardownRuntimeTerminalCmd,
    )
  }

  async applyAutoRun(){
    await this.runners.cmd(this.prefillTerm)
  }



  /**Definitions of @cmdChunk and @cmdOnThRun and general context about `PyodideConsole`:
   * ------------------------------------------------------------------------------------
   *
   *
   * All those properties, but especially @cmdChunk , are trickier than they seem.
   * This is essentially because the hidden/inner PyodideConsole is actually running totally
   * independently of the jQuery.terminal object itself.
   *
   * Concretely, the PyodideConsole is handling the code itself without troubles, but anything
   * other than "just run that code" (aka, installations/imports, exclusions, ...) still has to
   * be done around the console.
   *
   *
   * What a @cmdChunk means (brain-wise), might sometimes be quite different of what a terminal
   * might actually be sending here as argument:
   *
   * @cmdChunk: This is the string content that is passed through _WHEN THE USER HITS `Enter` in
   *           the terminal without holding Shift key_. This implies @cmdChunk could concretely
   *           be a lot of different things:
   *                - A single line command, just like you'd expect:
   *                      `a = 45+6`
   *                - A multiline command, potentially with several "commands" in it (two, here):
   *                      ```
   *                      globs = {}
   *                      def func(k):
   *                          return globs.get(k, 42)
   *                      ```
   *                - The CONTINUATION of a multiline command started earlier (here it gets messy):
   *                      Previously:   `>>> """ Starting the multi thing`
   *                      Previously:   `... continue it`
   *                      Now:          `... third line`
   *
   *                      After hitting `Enter`, @cmdChunk will be `"third line"` ONLY.
   *
   *                - Any mix of all these two last...
   * */
  async setupRuntimeTerminalCmd(cmdChunk){

    this.cmdChunk    = this._handleMultilineCommands(cmdChunk)
    this.cmdOnTheRun = !this.cmdOnTheRun ? this.cmdChunk : this.cmdOnTheRun + '\n' + this.cmdChunk
    this.storeUserCodeInPython('__USER_CMD__', this.cmdOnTheRun)
    this.lockDisplay()

    let runtime
    if(!this.alreadyRanEnv){
      // If an IDE/terminal is run before the IDE itself, it must run the env/post sections.
      runtime = await this.setupRuntimeTrackingEnvRun()

    }else{
      // If env already ran before, envTerm HAS to run independently, so remove the dependency.
      runtime = new RuntimeManager(this)
      runtime.changeDependency('envTerm', 'start')  // Make envTerm runnable on its own!
    }

    await this.setupRuntime(runtime, 'envTerm')
    return runtime
  }


  _handleMultilineCommands(cmd){
    const isMultiLines = cmd.includes('\n')
    if(!isMultiLines) return cmd

    const [first, ...cmds] = cmd.split('\n')

    // Hack the current last (multi-)line of the terminal and replace it with the first only,
    // then execute it without any additional display in the terminal:
    const prompt = this.terminal.get_prompt()
    this.terminal.update(-1, prompt+first)

    if(this.cmdStack.length) throw new Error(
      `Some multiline commands are already stored: a new multiline command should never occur.`
    )
    this.cmdStack = cmds.reverse()
    return first
  }


  /**Centralizing the logic to decide if the `env` section has been run or not.
   * */
  async setupRuntimeTrackingEnvRun(){
    const runtime = await this.setupRuntime()
    this.alreadyRanEnv = !runtime.stopped
    return runtime
  }



  /**Specific teardown steps when using a terminal command (isolated or IDE's terminal).
   * */
  async teardownRuntimeTerminalCmd(runtime){
    try{
      await runtime.runWithCtx('postTerm')

    }finally{
      // If ever postTerm failed, post might still have to run:
      await this.teardownRuntime(runtime)
      if(this.eraseCmdOnTheRunInPost) this.cmdOnTheRun = ""
    }

    // Triggers the next command line if a multiline command has been pasted.
    // this will be run only when the current executions are fully resumed (so that the Pyodide
    // lock has been released)
    if(this.cmdStack.length){
      setTimeout(async()=>await this.terminal.exec(this.cmdStack.pop()))
    }
  }


  /**Generic terminal teardown actions (common to isolated and IDEs' terminals)
   * */
  async teardownRuntime(runtime) {
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - TerminalRunner teardownRuntime")
    if(!this.cmdStack.length){
      this.unlockDisplay()
    }
    await super.teardownRuntime(runtime)              // Runs ONLY if `env` has also been run
    this.storeUserCodeInPython('__USER_CMD__', "")
  }





  /**Extract the current command from the terminal and:
   *  - either run it directly if it doesn't hold line breaks,
   *  - or split it and handle each line separately, to mimic the behavior of a true
   *    python terminal.
   * */
  async runTermCommand(runtime){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - Terminal - start running command", this.cmdChunk)

    this.eraseCmdOnTheRunInPost = false

    if(runtime.stopped){
      LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - Terminal - Skipped!")
      this.eraseCmdOnTheRunInPost = true
      return
    }

    await runtime.runWithCtx({
      section: RunningProfile.PROFILE.cmd,
      code: this.cmdOnTheRun,
      isEnvSection: false,
      applyExclusionsIfAny: true,
      method: this.pyodideConsoleRunner,
      logConfig: {
        code: this.cmdOnTheRun,
        autoAssertExtraction: false,
        purgeTrace: runtime.purgeStackTrace,
        purgeAssertionTrace: this.removeAssertionsStacktrace, // This is independent of the step running => not
                                                              // tide to `runtime`, but directly to the runner.
      },
    })

    // Needed if the error was raised on imports/exclusions. If the command itself rose, this
    // will just redo some steps for nothing...
    if(runtime.stopped){
      PyodideSectionsRunner.pyFuncs.clear_console()
      this.eraseCmdOnTheRunInPost = true
      this.terminal.set_prompt(CONFIG.MSG.promptStart)
    }
  }


  async runPyodideConsole(){
    let state='syntax-error'
    try{
      state = await PyodideSectionsRunner.pyFuncs.redirect_cmd(this.cmdChunk)

    }finally{
      const isIncomplete = state == 'incomplete'
      const prompt = isIncomplete ? CONFIG.MSG.promptWait : CONFIG.MSG.promptStart
      this.terminal.set_prompt(prompt)
      this.eraseCmdOnTheRunInPost = !isIncomplete
    }
  }
}


CONFIG.CLASSES_POOL.Terminal = TerminalRunner
