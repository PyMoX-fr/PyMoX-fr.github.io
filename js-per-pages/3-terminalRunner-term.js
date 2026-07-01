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
import { withPyodideAsyncLock, RunningProfile } from 'functools'
import { textShortener, txtFormat } from 'functoolsTxt'
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




/**Extract and reformat any selection content in the terminal, handling all the crazy things
 * jQuery.terminal are throwing in...
 *
 * (inspired by https://stackoverflow.com/questions/5379120/get-the-highlighted-selected-text)
 * */
function getSelectionText(){
  let text = "";

  // Use window.getSelection only if available on the platform:
  if(window.getSelection){
    text = extractSelection()

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
 * (One year later: actually, it is. But with some tricks! The following is kept as archived
 * knowledge)
 *
 * -------------------------------------------------------------------------------------------
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
 *                      │     ├── span                // One span PER CHAR. Always ending with an extra space!
 *                      │     └── ...
 *                      ├── ...
 *                      ├── div.cmd-cursor-line       // Cmd line currently holding the cursor
 *                      │     ├── span                // Content BEFORE the cursor. MAY BE EMPTY / 1 char per inner span.
 *                      │     │     ├── span
 *                      │     │     └──  ...
 *                      │     ├── span.cmd-cursor.cmd-end-line  // Character holding the cursor
 *                      │     │     └── span
 *                      │     │         └── span
 *                      │     │             └── span  // One char, or a space if at the end of the line (then the next bunch of spans IS EMPTY)
 *                      │     └── span                // Content AFTER the cursor. MAY BE EMPTY / 1 char per inner span.
 *                      │           ├── span
 *                      │           └── ...
 *                      ├── ...
 *                      └── div.cmd-end-line
 *                            └── (various spans)
 *
 * WARNING:
 *    - The DocumentFragment objects may at most overlap on both `div.terminal-output` AND
 *      the `div.cmd-wrapper`.
 *    - The number of Range objects IS NOT guaranteed. Might be 1 to... more (there are more than
 *      one when the current command line is multiline, independently of the cursors position).
 *    - The command lines may add extra trailing whitespaces... or not... (pfff... :rolleyes: ).
 *      An _EXTRA_ trailing whitespace is present:
 *        - At the end of any non last line of a multiline command.
 *        - At the end of the last command line...:
 *            - IF the cursor is there.
 *            - IF there is NO cursor in the terminal... (PFFFF!!! DX )
 *
 *
 * GENERIC STRATEGY (was...):
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



/**Extract all the ranges in the current selection.
 *
 * WARNING: Trailing spaces _IN THE SELECTION_ are automatically removed when they are in a
 * command line.
 *    Reason: the terminal often adds one space at the end of command lines (not always, but...)
 *    Problem: the trimming also happen is the selection ends on a space that is not at the end
 *    of the line...
 * */
const extractSelection=()=>{

  const selection = document.getSelection()
  const out = []
  let prompt = ""

  for(let i=0 ; i < selection.rangeCount ; i++){

    const rngOut = []
    const rng = selection.getRangeAt(i)
    const docFragment = $(rng.cloneContents())

    // Extract everything that looks like a "line" or a "fraction of a line", in a multiline selection
    prompt = storeMultilineContents(docFragment, rngOut, prompt)

    // If `rngOut` is empty at this point, it means the selection is a single line one, so just
    // extract its content directly:
    if(!rngOut.length){
      storeSingleLineContents(docFragment, rngOut, prompt)
    }

    out.push(...rngOut)
  }

  const copied = out.join('\n')

  if(window.DEBUG_TERM_COPY) {
    console.log("*******************\ncopied content:\n\n"+copied)
  }
  return copied
}


const storeMultilineContents=(docFragment, rngOut, prompt)=>{

  docFragment.find([
    "div:not([ role=presentation ]) > span[data-text]",   // Output lines
    "div[style]:empty",                                   // Output: empty lines
    "div[ role=presentation ]:not( .terminal-command )",  // Cmd lines (excluding previous commands now displayed in the output)
    "div.cmd-cursor-line",                                // Cmd line, holding the cursor... :rolleyes:
    "span.cmd-prompt"                                     // Prompt element...
  ].join()).each(function(){
    const jThis = $(this)

    // Store the prompt for later use
    if(jThis.is('span.cmd-prompt')){
      prompt = this.textContent
      return
    }

    let txt = jThis.text()

    // Strip any trailing space added by jQueryTerminal, making sure to not strip the prompt...
    if(txt && jThis.is('div.cmd-end-line, div.cmd-cursor-line')){
      txt = txt.replace(TERMINAL_RSTRIP_SPACE_REGEXP, "")
    }

    // Consume prompt data if any
    if(prompt){
      txt = prompt+txt
      prompt = ""
    }

    rngOut.push(txt)
  })

  return prompt
}


const storeSingleLineContents=(docFragment, rngOut, prompt)=>{

  // Handle any prompt left over... (shouldn't happen...? Just in case. => no trimming)
  if(prompt){
    rngOut.push(prompt)

  }else{
    let txt = docFragment.text()

    /*  If ever the parent is a div from the command line, check if a trailing space must be
        removed or not.

    WARNING:
      * When one line of a multiline command is selected, and this line doesn't contain the
      cursor, the extra/trailing space is not selectable, so nothing to do in that case.
      * On the other hand, if the current and only line holds the cursor, it _MAY_ contain
      the last space, _IF AND ONLY IF_ the cursor is currently on the last char and this char
      is in the selection. this case is easily spotted by checking if the current fragment
      contains a `span.cmd-cursor.cmd-end-line` element, which exist only if the cursor is on
      that extra/trailing space.
    */
    if(docFragment.find('span.cmd-cursor.cmd-end-line').length){
      txt = txt.replace(TERMINAL_RSTRIP_SPACE_REGEXP, "")
    }

    // The Selection might occasionally contain an extra empty range (depends on where exactly
    // the mouse finishes the selection...), so store only existing content.
    if(txt){
      rngOut.push(txt)
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


  getTermSelectedText(){
    let txt = getSelectionText()
    if(this.joinTerminalLines){
      txt = txt.replace(/\n/g, '')
    }
    return txt
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
        const txt = this.getTermSelectedText()
        if (txt) {
          e.preventDefault()
          e.stopPropagation()
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
    if(this.prefillTerm && !this.autoRun){
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
    if(this.prefillTerm){
      await this.terminal.exec(this.prefillTerm)
    }
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
      method: this.pyodideConsoleRunner,    // This is the bound version of this.runPyodideConsole
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

  /**Send the current command line to the internal PyodideConsole, and check for the resulting state.
   * */
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
