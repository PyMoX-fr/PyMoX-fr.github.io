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





/**Spaces in the terminal are not "normal" space chars -> they have to be replaced on the fly when
 * extracting content for copy/paste. */
const TERMINAL_CRAZY_SPACE = "\\u00a0"

/**RegExp used to do the all terminal spaces replacements. */
const TERMINAL_SPACES_REGEXP = new RegExp(TERMINAL_CRAZY_SPACE, "ug")

/** Regexp to use to "right strip" any terminal space character. */
const TERMINAL_RSTRIP_SPACE_REGEXP = new RegExp(`${ TERMINAL_CRAZY_SPACE }$`, "u")

/**Regexp to identify the prompt content (starting of continuation: ">>>" or "...". Also identify
 * partial selection). */
const TERMINAL_PROMPT_REGEX = /^(?:[.]{0,3}>{0,3})$/




/**Extract and reformat any selection content in the terminal, handling all the crazy things
 * jQuery.terminal are throwing in...
 *
 * (inspired by https://stackoverflow.com/questions/5379120/get-the-highlighted-selected-text)
 * */
function getSelectionText(){
  let text = "";

  // Use window.getSelection only if available on the platform:
  if(window.getSelection){
    if(!window.getSelection().toString()){
      return ""     // Avoid some mess when no selection!
    }
    text = new TermSelectionExtractor().extract_as_text()

  // Warn the user if something goes wrong/cannot use `window.getSelection`, then use default behavior:
  }else if(document.selection && document.selection.type != "Control") {
      console.warn("Unsupported copy from PMT terminal (fallback to default/simplified behavior).")
      text = document.selection.createRange().text;
  }

  // Cleanup jQuery terminals spaces mess...:
  text = text.replace(TERMINAL_SPACES_REGEXP, " ")
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
 *    - The number of Range objects IS NOT guaranteed. Might be 1 to... more (there are more than
 *      one when the current command line is multiline, independently of the cursors position).
 *
 *
 * GENERIC STRATEGY:
 *    1. If there are multiple ranges, merge them all together in a unique Range, removing
 *       potential empty ranges at the end first.
 *    2. Depending on the common ancestor, decide what to extract, and how:
 *      - If the common ancestor is "too wide" (as in, outside of the terminal), just return ""
 *        (this will trigger the default copy behavior).
 *      - Otherwise, extract the terminal-output on one side (if any), then the terminal
 *        command on the other side.
 *
 *    DO NOT rely on the ranges themselves, but only on the actual DOM structure.
 * */
class TermSelectionExtractor {


  /**Debugging purpose method. */
  show(title, ...stuff){
    if(!window.DEBUG_TERM_COPY) return;

    console.log("*******************\n"+title)

    stuff.forEach(o=>{
      if(o!==null && Object.is(o.constructor, Object)){
        for(const name in o){
          const elt = o[name]
          console.log(name+':', elt)
        }
        console.log("-------")
      }else{
        console.log(o)
      }
    })
  }

  //--------------------------------------------------------------------------------

  constructor(){
    if(window.DEBUG_TERM_COPY) console.clear()    // (debugging helper)
    this.lines = []
    this.conf = null
    this.rng = null
    this.commonAncestor = null
  }


  extract_as_text(){

    const baseSelection = window.getSelection()
    this.rng = baseSelection.getRangeAt(0).cloneRange()    // Initial value. Modified on the fly

    this.removeTrailingInvalidRangeIfNeeded(baseSelection)
    this.commonAncestor = $(this.rng.commonAncestorContainer)

    if(this.commonAncestor.is("body, main, article")){
      return ""       // Selection is too wide => going out of the terminal:
    }

    this.fixRngEndContainerForFullCmdSelection()
    this.conf = this.getExtractionConfig()

    // Selection out of bounds of the div.terminal-wrapper: return empty string instead
    if(this.conf.invalid)   return ""

    if(this.conf.hasOutput) this._extractOutput()
    if(this.conf.hasCmd)    this._extractCmd()

    const out = this.lines.join('\n')
    this.show('Copied content:', '"'+out+'"')
    return out
  }



  /**When selecting the command line up to the end, there might an empty Range object at the end
   * (depends on where the mouse actually starts/ends: the endContainer might end up at different
   * depths in the DOM, resulting in some extra stuff). This empty Range is causing a total mess
   * of the extraction logic, so it has to be removed/ignored.
   *
   * The problematic empty range can be identified as follow:
   *    - Having a startContainer node being `div.cmd`
   *    - Its offset is greater than 0
   *    - It's always the last range, even if the user started by clicking too much on
   *      the left of the line.
   *
   * (NOTE: next time, write down how to reproduce that thing...!)
   * */
  removeTrailingInvalidRangeIfNeeded(baseSelection){
    let endRngIdx = baseSelection.rangeCount - 1
    let lastRng   = baseSelection.getRangeAt(endRngIdx)

    // Find last actual range to consider:
    const tooLarge = $(endRngIdx.startContainer).is('div.cmd') && lastRng.startOffset > 0

    // Mutate this.rng to get one single range of all the text to extract, if there is more than
    // one (valid) Range in the selection:
    const thisRngEndNeedsUpdate = endRngIdx - tooLarge > 0
    if(thisRngEndNeedsUpdate){
      const endRng = baseSelection.getRangeAt(baseSelection.rangeCount-1)
        // WARNING: WHY NOT baseSelection.getRangeAt(endRngIdx) ??? -> what's the point, then??
        // (currently, this will exclude the last range when there are 2 of them and the last
        // one is invalid, because this.rng.endContainer won't get updated. It IS updated WITH
        // THE LAST Range endContainer in other cases, though...)
        //   => If I remember correctly, this is a dirty FIX for some jQuery.terminal non sense...

        // This will update the commonAncestor and "shrink" the Range automatically if needed
        // (aka, if only cmd stuff is selected while the mouse selected some external elements
        // on the way...).
        this.rng.setEnd(endRng.endContainer, endRng.endOffset)
        this.commonAncestor = $(this.rng.commonAncestorContainer)

        this.show("endRngIdx", "invalid=",tooLarge, endRngIdx, endRng)
    }
  }


  /**Fix this.rng.endContainer to make sure to exclude any extra/useless lines coming from empty
   * contents generated when iterating on the Range:
   *
   * When some command elements are selected, the commonAncestor might be "too large" and
   * contain upper level tags (div.cmd, div.cmd-wrapper) that would generate empty lines
   * when iterating on the range, during extractions.
   */
  fixRngEndContainerForFullCmdSelection(){

    let endContainer     = $(this.rng.endContainer)
    let relevantAncestor = this._findAncestorDivOfInterest(endContainer)

    const isFullCmd = (
      relevantAncestor.is('.terminal-scroller, .terminal-wrapper, .cmd')
      || endContainer.is('.cmd-wrapper')
    )   // DO NOT test relevantAncestor.is('.cmd-wrapper') here: it would systematically extend
        // the range to the full command content, while maybe only a part of it is selected.

    if(isFullCmd){
      // Make sur to work with div.cmd as relevantAncestor (ease spotting the last child later):
      if(relevantAncestor.is('div.cmd-wrapper')){
        relevantAncestor = relevantAncestor.parent()      // -> div.cmd
      }
      const lastCmdChild = relevantAncestor.find('div.cmd-wrapper > :last-child')[0]
      if(!lastCmdChild){     // Internal security
        throw new Error("Couldn't find div.cmd-wrapper from "+this.commonAncestor.toString())
      }

      this.rng.setEndAfter(lastCmdChild)
      this.commonAncestor = $(this.rng.commonAncestorContainer)
    }
  }



  /**Determines what kind of content(s) has to be extracted, end return an object giving
   * informations about how the selection is structured (Some fields may be missing,
   * leading to `undefined`):         `{hasCmd, hasOutput, invalid}`
   * */
  getExtractionConfig(){

    // Get deepest possible meaningful div that wraps the selection, to identify what kind
    // of content(s) is to be copied:
    const div = this._findAncestorDivOfInterest(this.commonAncestor)

    if(div.is('.cmd, .cmd-wrapper')) return {hasCmd: true}
    if(div.is('.terminal-output'))   return {hasOutput: true}
    if(div.is('.terminal-wrapper'))  return {hasOutput: true, hasCmd: true}

    return {invalid:true}   // Security/default case
  }



  /**Extract the closest parent div of the given jQuery element, that is matching any of the critical
   * elements to consider when handling copy/paste selection logic.
   * */
  _findAncestorDivOfInterest(elt){
    return elt.closest([
      'div.cmd-wrapper',         // command only
      'div.cmd',                 // command only
      'div.terminal-output',     // output only
      'div.terminal-wrapper',    // Cmd for sure, but output??? -> need to rebuild a Range
      'div.terminal-scroller',   // Cmd for sure, but output??? -> need to rebuild a Range
    ].join(', '))
  }



/**Starting from the `{side}Container` of this.rng, extract the deepest jQuery parent element
 * that matches the given predicate.
 *
 * NOTES:
 *  - Range.offSet is included for the startContainer, but excluded for the endContainer.
 *  - The `{side}Container` _really_ is the container of the ending element. Meaning the offset
 *    has to be considered to know on what child the selection actually starts/begin.
 *  - ...BUT if the `{side}Container` is a text tag,
 * */
  _getFirstParentMatchingOnSide(side, desiredPredicate){
    const node   = $(this.rng[side+'Container'])
    const offset = Math.max(0, this.rng[side+'Offset'] - (side=='end'))
    let   elt    = node[0].nodeName=='#text' /* || offset < 0  ? */ ? node : node.children().eq(offset)
    if(!elt.length) elt = node   // (resulted in negative index or no actual match)

    while(!desiredPredicate(elt)){
      elt = elt.parent()
    }
    return elt
  }


  /**Add the current line/content to this.lines, trimming it on the right side if needed.
   * */
  pushLine(line, trimRight=false){
    const txt =  trimRight ? line.replace(TERMINAL_RSTRIP_SPACE_REGEXP,'') : line
    this.lines.push(txt)
  }


  /**Split this.rng into 3 separated Ranges, each handling a specifiksc segment of the selected text:
   *    - `head`:   The very first line/beginning of the selection. Often empty if the line is
   *                completely selected, or if only the end of the line is selected.
   *    - `center`: The central elements/texts. This covers only full lines to extract (simplifying
   *                a bit the extraction machinery for this part).
   *    - `tail`:   Equivalent of `head`, but at the end.
   *
   * If one single line is selected, only the `center` range should be used (head and tail are
   * collapsed).
   *
   * @isLinePredicate(elt):
   *    Return true if the given element is holding a line of content (potentially partial)
   *
   * @parentLinePredicate(elt):
   *    Return true if the given element matches the first parent on which one wants to stop, when
   *    ascending the hierarchy from the commonAncestor of this.rng.
   * */
  splitAndStudyBaseRangeWith(isExtractingOutput, isLinePredicate, parentLinePredicate){
    const top          = this.commonAncestor
    const topTag       = top[0].nodeName    // Don't use jQuery for this... x/

    const isTxtOnly    = topTag == '#text'
    const isSpan       = topTag == 'SPAN'
    const isMultiSpan  = topTag == 'DIV' && isLinePredicate(top)
    const isSingleLine = isTxtOnly || isSpan || isMultiSpan

    let headLine, tailLine
    let [head, center, tail] = [0,0,0].map(_=>this.rng.cloneRange())

    if(isSingleLine){
      head.collapse(true)
      tail.collapse()

    }else{
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

      headLine = this._getFirstParentMatchingOnSide('start', parentLinePredicate)
      head.setEndAfter(headLine[0])
      center.setStartAfter(headLine[0])

      tailLine = this._getFirstParentMatchingOnSide('end', parentLinePredicate)
      center.setEndBefore(tailLine[0])
      tail.setStartBefore(tailLine[0])
    }

    this.show('analyze', this.conf, {top, headLine, tailLine, isTxtOnly, isSpan, isMultiSpan, isSingleLine})

    // Adapt center and collapse tail if there is a Cmd part while extracting the output only:
    if(isExtractingOutput && (this.conf.hasCmd || tailLine && tailLine.is('div.terminal-wrapper'))){
      tail.collapse()   // Remove any Cmd part

      // If the head is covering the last output line, center must also be collapsed:
      const headIsEnd = $(head.cloneContents()).find("div > span, div:empty").parent().is('div.cmd-end-line')
      if(headIsEnd){
        center.collapse(true)
      }else{
        const out = top.find('div.terminal-output')
        center.setEndAfter(out[0])
        center.setStart(head.endContainer, head.endOffset)
      }
    }

    return {top, head, center, tail, headLine, tailLine, isSingleLine}
  }


  _extractRanges(head, center, tail, options={}){

    const extractor = this
    options = {
      centerJRule: null, stripOneSpace: false, ...options
    }

    let i=0
    for(const rng of [head, center, tail]){
      i++

      if(rng.collapsed){
        continue

      }else if(i===2 && options.centerJRule){
        // The `center` Range may be multiline, so extract the whole content, then pick complete
        // lines inside the fragment, when found:
        $(rng.cloneContents()).find(options.centerJRule).each(function(){
          const txt = this.innerText
          extractor.pushLine(txt, options.stripOneSpace)
        })

      }else{
        // `head` and `tail` or the `center` ranges are single line contents, so extract directly:
        extractor.pushLine(rng.toString(), options.stripOneSpace)
      }
    }
  }





  _extractOutput(){
    let {
      top, head, center, tail, headLine, tailLine, isSingleLine
    }=this.splitAndStudyBaseRangeWith(
      true,
      (elt) => elt.parent().attr('data-index'),
      (elt) => elt.is('div.terminal-wrapper') || elt.parent().is('div[data-index]')
    )

    // Shortcut if one single line is showing up in the selection:
    if(isSingleLine){
      this.pushLine(this.rng.toString())

    }else{
      this._extractRanges(head, center, tail, {centerJRule: "div > span, div:empty"})
    }

    this.show('Output extraction', {head, center, tail})
  }




  _extractCmd(){
    let {
      top, head, center, tail, headLine, tailLine, isSingleLine
    }=this.splitAndStudyBaseRangeWith(
      false,
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
      center.setEnd(tail.startContainer, tail.startOffset)    // redundant...?
    }
    this.show('CMD extraction', {head, center, tail})

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
    await this.terminal.exec(this.prefillTerm)
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
