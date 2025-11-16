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
  buildJqHistoryBtn,
  cancelEvent,
  choice,
  decompressLZW,
  downloader,
  getIdeOptions,
  perennialMathJaxUpdate,
  PythonError,
  renderMermaidGraphs,
  sleep,
  subscribeWhenReady,
  txtFormat,
  uploader,
  RunningProfile,
} from 'functools'
import { observeResizeOf } from '3-terminalRunner-term'
import {
  IdeSplitScreenManager,
  IdeFullScreenGlobalManager,
  somethingFullScreen,
} from '4-ideLogistic-ide'















/**Hold logistic related to managing the Ace editor data (no behaviors implemented here:
 * see IdeRunner about that).
 * */
class IdeAceManager extends IdeSplitScreenManager {


  /**Add the `tests` section to the given code, joining them with the appropriated
   * string/comment if needed.
   * */
  _joinCodeAndPublicSections(userCode){
    const editorCode = [ userCode, this.publicTests ].filter(Boolean).join(CONFIG.lang.tests.msg)
    return editorCode
  }


  /**Save the current IDE content of the user, or the given code, into the localStorage
  * of the navigator.
  * */
  save(givenCode=""){   LOGGER_CONFIG.ACTIVATE && jsLogger("[Save]")
    const currentCode = givenCode || this.getCodeToTest()
    this.setStorage({code: currentCode, hash: this.srcHash})
  }


  applyCodeToEditorAndSave(exerciseCode, doSave=true){
    exerciseCode ||= ""
    this.editor.getSession().setValue(exerciseCode)
    if(doSave) this.save(exerciseCode)
  }


  /**Build (or extract if allowed) the initial code to put in the editor.
   * */
  getStartCode(attemptLocalStorageExtraction=false){
    let exerciseCode = ""

    if(attemptLocalStorageExtraction){
      exerciseCode = this.getCodeFromStorage()
    }
    if(!exerciseCode){
      exerciseCode = this._joinCodeAndPublicSections(this.userContent)
    }

    // Enforce at least one empty line of code in the editor, so that the terminal prompt
    // is always visible for IDEv:
    exerciseCode = exerciseCode.replace(/\n+$/,'')
    if(!exerciseCode) exerciseCode = '\n'

    return exerciseCode+"\n"
  }


  setStartingCode(options={}){

    const {extractFromLocalStorage, saveOnceApplied} = {
      extractFromLocalStorage:false,
      saveOnceApplied:true,
      ...options
    }
    const code = this.getStartCode(extractFromLocalStorage)
    this.applyCodeToEditorAndSave(code, saveOnceApplied)
    return code
  }
}















/**Handle `validations`: an array of arrays, holding info about N last validations.
 * As of now, the structure of the inner arrays is:
 *
 *      [done, formattedTimestamp, code]
 *
 * Validations have a "session" lifetime and are not stored in the localStorage.
 * */
class IdeHistoryManager extends IdeAceManager {

  constructor(editorId){
    super(editorId)
    this.validations = []
  }


  getTime(){
    return (Date()+'').split(' GMT')[0].slice(-8)
  }

  /**Store the data of the current run/validation to this.validations.
   * */
  pushValidation(code, done){     // CodCap
    const time = this.getTime()
    this.validations.push([done, time, code])

    // Suppress entries that are too old:
    if(this.validations.length > CONFIG.N_IDE_VALIDATIONS){
      this.validations.splice(0, this.validations.length-CONFIG.N_IDE_VALIDATIONS)
    }
  }


  /**Update the color of an element to show a validation state (green/ref/normal).
   *
   * By default, color the "check" button of the current IDE instance.
   * To color another element, pass in a second argument (jQuery collection).
   *
   * @returns: the updated jQuery element/collection.
   * */
  updateValidationBtnColor(done=undefined, jElt=undefined){
    done ??= this.storage.done
    jElt ??= this.global.find("button[btn_kind=check]")
    if(!this.isDelayedRevelation){
      const color = this.getIdeStateColor(done)
      jElt.css('--ide-btn-color',  color)
    }
    return jElt
  }


  getIdeStateColor(done){     // CodCap
    return !done ? "unset" : done<0 ? 'red' : 'green'
  }

  clearValidations(){ this.validations.length = 0 }



  setupHistoryBtn(jHistItem, [done, time, code]){
    jHistItem.text(time)
    jHistItem.on('click', e=>{
      cancelEvent(e)
      this.applyCodeToEditorAndSave(code)
      this.updateValidationBtnColor(done)
    })
    this.updateValidationBtnColor(done, jHistItem)
  }
}













/**Handle all elements of logics related to giving some kind of feedback to the user
 * (through terminal, UI colors, ...),
 */
class IdeFeedbackManager extends IdeHistoryManager {


  /**Relay method, to transfer stdout content from pyodide to the jQuery.terminal.
   * If @isPrint is true, the call has been done through the `bi_print` python function.
   * If @isPrint is false, then the call has been done through the `terminal_message` function.
   *
   * When the stdout is deactivated and @isPrint is false, the @key argument is required to
   * match the one given through the IDE macro `STD_KEY` argument.
   * */
  termFeedbackFromPyodide(key, msg, format, isPrint=false, newline=undefined){
    const hidden    =  isPrint && !this.allowPrint
    const forbidden = !isPrint && !this.allowPrint && key != this.stdKey
    if(forbidden){
      throw new PythonError("Cannot print to the terminal.")
    }
    if(!(isPrint && hidden)){
      super.termFeedbackFromPyodide(null, msg, format, isPrint, newline ?? !isPrint)
    }
  }


  /**Unconditionally update the counter of attempts with the given value.
   *
   * Handles Infinity as a security, in case the method is called with it anyway.
   * */
  setAttemptsCounter(nAttempts){
    this.data.attempts_left = nAttempts
    $(this.counterH).text(nAttempts===Infinity ? CONFIG.INFINITY : nAttempts)
  }


  //----------------------------------------------------------------------------------


  /**If the current action has been successful until now, display the appropriate
   * message in the terminal.
   * */
  codeSnippetEndFeedback(runtime, step, code){
    if(runtime.stopped || !step) return

    const playing = this.running.isPlaying
    const intro   = playing ? "" : CONFIG.lang.validation.msg
    const section = CONFIG.lang[step].msg
    const ok      = CONFIG.lang.successMsg.msg

    let msg = `${ intro }${ section }: ${ ok }`   // Default section message
    if(!code) msg = ""                            // No default message if no code in the section...
    if(playing && !this.hasCheckBtn){             // ...but ensure the default ending message is shown,
      msg = CONFIG.lang.successMsgNoTests.msg     //    if this is "playing" and nothing else to do after.
    }

    if(msg) this.terminalEcho(msg)

    // Prepare a "very final" message if needed:
    if(playing && this.hasCheckBtn){
      // If a validation button is present while running the public tests
      runtime.finalMsg = CONFIG.lang.unforgettable.msg
    }
    else if(this.isDelayedRevelation && this.attemptsLeft>0 && this.running.isValidating){
      // If a validation button is present while running the public tests
      runtime.finalMsg = CONFIG.lang.delayedReveal.msg.replace('{N}', this.attemptsLeft-1+"")
    }
  }



  /**Reveal solution and REMs on success, or if the counter reached 0 and the corr&REMs content
   * is still hidden, then prepare an appropriate revelation message if needed (`finalMsg`).
   *
   * Do not forget that any error related feedback has already been printed to the console, so
   * when it comes to feedback given in this method, it's only about a potential "final message".
   * */
  handleValidationOutcome(runtime, allowCountDecrease, code){
    const isDelayed    = this.isDelayedRevelation
    const success      = !runtime.stopped
    const done         = isDelayed ? 0 : success ? 1:-1
    const someToReveal = this.corrRemsMask && this.hiddenDivContent && (!this.profile || isDelayed)
    const trueSuccess  = success && !isDelayed

    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - handleValidationOutcome")
    // console.log("[OutCome]", JSON.stringify({
    //   success, pof:this.profile, revealable, hidden:this.hiddenDivContent,
    //   allowCountDecrease: !!allowCountDecrease, mask:this.corrRemsMask, N:this.attemptsLeft
    // }))

    this.pushValidation(code, done)
    this.setStorage({done})
    this.updateValidationBtnColor(done)

    if(allowCountDecrease && !trueSuccess){
      this.decreaseIdeCounter()
    }

    // Reveal if success and not delayed, or if attempts==0 (means last error, are last delayed)
    const doReveal = someToReveal && (this.attemptsLeft===0 || trueSuccess)

    /*If success, a custom final message has to be built:
          - If the revelation already occurred, return no message at all
          - If some profile forbids the revelation, or if nothing to reveal, just congratulate the user.
          - Make sure a success on "delayed" profile doesn't trigger a final message.

      WARNING: someToReveal is different from "already revealed".
     */
    const isSuccessNoReveal = success && this.hiddenDivContent && !isDelayed

    if(doReveal){
      LOGGER_CONFIG.ACTIVATE && jsLogger("[OutCome]", 'reveal!', success)
      runtime.finalMsg = success ? this._buildSuccessMessage(someToReveal, isDelayed)
                                 : this._getSolRemTxt(false)
      this.revealSolutionAndRems({show:trueSuccess})

    }else if(isSuccessNoReveal){
      // Always display the "bravo" message on success, if corr&REMs exist but are not revealable
      runtime.finalMsg = this._buildSuccessMessage(someToReveal, isDelayed)
    }
  }


  /**Decrease the number of attempts left, EXCEPT when:
   *    - the solution is already revealed,
   *    - the number of attempts is infinite,
   *    - there are no attempts left (redundant with revelation condition, but hey...).
   */
  decreaseIdeCounter(){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - decreaseIdeCounter")
    if(!this.hiddenDivContent) return    // already revealed => nothing to change.

    // Allow going below 0 so that triggers once only for failure.
    const nAttempts = Math.max(-1, this.attemptsLeft - 1)

    // Update the GUI counter if needed:
    if(Number.isFinite(nAttempts) && nAttempts >= 0){
      this.setAttemptsCounter(nAttempts)
    }
  }


  /**Reveal corr and/or REMs (VIS or not) contents.
   * When reaching this method, it is already sure by contract that the revelation must occur.
   * The only piece of contract this method is holding is that it flags the revelation as done,
   * and decides if the div content has to be decompressed or not on the way.
   *
   * @options:
   *  .waitForMathJax (=false):
   *      If true, the call is done with profile=="revealed", so mathjax might not be ready yet,
   *      and the update must be delayed.
   *  .show (=false):
   *      If true, deploy the admonition.
   * */
  revealSolutionAndRems(options={}){    // CodCap
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - Enter revealSolutionAndRems")

    const {waitForMathJax, show} = {
      waitForMathJax:false, show:false,
      ...options
    }

    // Need to check here _one more_ time against hiddenDivContent because of the "show"
    // button logic...
    if(this.hiddenDivContent){
      LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - revealed!")

      const sol_div = $(this.solutionH)
      const content = sol_div.text().trim()
      const isCompressed = content.includes(CONFIG.LZW)
      if(isCompressed){
        const unCompressed = decompressLZW(content, "ides.encrypt_corrections_and_rems")
        sol_div.html(unCompressed)
      }
      sol_div.attr('class', '')         // Unhide
      if(show){
        sol_div.children("details").first().prop('open', true)
      }
      this.hiddenDivContent = false     // Never reveal again (last in case of errors...)

      // Enforce formattings of REM contents
      renderMermaidGraphs()

      if(!waitForMathJax){
        perennialMathJaxUpdate()
      }else{
        subscribeWhenReady(
          "revealOnLoad", perennialMathJaxUpdate, {
            waitFor: ()=>CONFIG.subscriptionReady.MathJax,
            ignoreMultipleSubscriptions: true,
            runOnly: true,
            delay: 150,
            maxTries: 200,  // Needs a lot of tries, to make sure everything can be setup
                            // properly if pyodide is starting "too soon".
          }
        )
      }
    }
  }


  /**If @isDelayed is true, there are no tests/secrets, so:
   *    - Do not congratulate the user
   *    - if something revealable, announce the revelation, otherwise say nothing special
   *
   * If @isDelayed is false, build:
   *    - the complete success message if something to reveal
   *    - only the bravo message otherwise.
   */
  _buildSuccessMessage(revealable, isDelayed){
    const moreInfo = revealable ? this._getSolRemTxt(true) : ""
    if(isDelayed){
      return moreInfo && txtFormat.stress(moreInfo)
    }
    const emo = choice(CONFIG.MSG.successEmojis)
    return `${ CONFIG.lang.successHead.msg } ${ emo } ${ CONFIG.lang.successHeadExtra.msg }${ moreInfo }`
  }


  /**Routine building the final success or failure message, assembling the various parts
   * of CONFIG.lang as needed.
   * */
  _getSolRemTxt(isSuccess){
    if(!this.corrRemsMask) return ""

    const hasCorr  = this.corrRemsMask & 1
    const hasRems  = this.corrRemsMask & 2
    const hasBoth  = this.corrRemsMask == 3
    const msg      = []
    const sentence = []

    const pushSentence = (prop,kind='msg') => sentence.push(CONFIG.lang[prop][kind])

    msg.push( isSuccess
      ? "\n"+CONFIG.lang.successTail.msg
      : CONFIG.lang.failHead.msg
    )

    if(hasCorr) pushSentence('revealCorr')
    if(hasBoth) pushSentence('revealJoin')
    if(hasRems) pushSentence('revealRem')

    if(!isSuccess){
      // Ensure capitalization of the beginning of the error feedback
      if(sentence.length){
        sentence[0] = _.capitalize(sentence[0])
      }
      const kind = hasBoth || hasRems ? 'plural':'msg'
      pushSentence('failTail', kind)
    }

    msg.push(...sentence)
    const output = msg.join(' ').trimEnd() + "."

    // console.log("[OutComeSolRemTxt]", JSON.stringify({isSuccess, msg, mask:this.corrRemsMask, sentence, output}))
    return output
  }
}














/**Holds the running/code management logistic for IdeRunner.
 * */
class IdeRunnerLogic extends IdeFeedbackManager {

  /**Is the current action "running the public tests"? (legacy) */
  isPlaying(){  return this.running.isPlaying }

  /**Is the current action "running the validation tests"? (legacy) */
  isValidating(){ return this.running.isValidating }

  /**Does nothing, but catch any call on the parent class, which would raise an error
   * because prefillTerm is undefined, for IDEs.
   * */
  prefillTermIfAny(){}

  // @OVERRIDE
  async applyAutoRun(){
    await this._defaultAutoRun()
  }




  /**Things to display in the terminal at the very beginning of the executions.
   * */
  terminalDisplayOnIdeStart(){
    this.terminalEcho(CONFIG.lang.runScript.msg)
  }



  async setupRuntimeIDE() {
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - setupRuntimeIDE IdeRunner")

    // Fix Chrome bug with terminal width sometimes set to 0px: make sure the terminal width
    // becomes correct whatever the way the user triggered the computations:
    this.terminalAutoWidthOnResize()

    // Save before anything else, in case an error occurs somewhere...
    const editorCode = this.getCodeToTest()
    this.save(editorCode)
    this.storeUserCodeInPython('__USER_CODE__', editorCode)

    this.lockDisplay()
    this.terminalDisplayOnIdeStart()  // Handle the terminal display for the current action
    await sleep(this.delay)           // Terminal "blink", so that the user always sees a change

    return await this.setupRuntimeTrackingEnvRun()
  }


  lockDisplay(){
    super.lockDisplay()
    if(!this.running.isTermCmd && this.clearTerminalWhenLocking){
      this.terminal.clear()   // To clear AFTER pausing... (otherwise, prompt is showing up)
    }
   }


  async teardownRuntimeIDE(runtime) {
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - IdeRunner teardownRuntime")

    // Restore default state first, in case a validation occurred (=> restore stdout behaviors!)
    runtime.refreshStateWith()

    // Handle any extra final message (related to revelation of solutions & REMs)
    if(runtime.finalMsg) this.giveFeedback(runtime.finalMsg, null)

    await this.teardownRuntime(runtime)

    this.storeUserCodeInPython('__USER_CODE__', "")
  }



  /**Build the public tests runner routine.
   * */
  playFactory(runningMan=RunningProfile.PROFILE.play){
    return this.lockedRunnerWithBigFailWarningFactory(
      runningMan,
      this.setupRuntimeIDE,
      this.playThroughRunner,
      this.teardownRuntimeIDE,
    )
  }



  async playThroughRunner(runtime){   // CodCap
    const code = this.getCodeToTest()
    await this.runPythonCodeWithOptionsIfNoStdErr(code, runtime, CONFIG.section.editor)
  }



  /**Build the validation tests runner routine.
   * */
  validateFactory(runningMan=RunningProfile.PROFILE.validate){
    return this.lockedRunnerWithBigFailWarningFactory(
      runningMan,
      this.setupRuntimeIDE,
      this.validateThroughRunner,
      this.teardownRuntimeIDE,
    )
  }



  async validateThroughRunner(runtime){

    // env section is behaving like the editor one (should be changed...?)
    let decrease_count = this.canDecreaseAttempts(CONFIG.section.editor)
    const code = this.getCodeToTest()

    // If an error already occurred, stop everything...
    if(runtime.stopped){

      // ... but decrease the number attempts and run teardown if this was AssertionError.
      if(runtime.isAssertErr){
        this.handleValidationOutcome(runtime, decrease_count, code)
      }

    }else{

      const validation_state = {
        autoLogAssert:    this.autoLogAssert,
        purgeStackTrace:  this.showOnlyAssertionErrorsForSecrets,
        withStdOut:      !this.deactivateStdoutForSecrets,
      }
      const toRun = [
        [code,             CONFIG.section.editor,  {}],
        [this.publicTests, CONFIG.section.public,  validation_state],
        [this.secretTests, CONFIG.section.secrets, validation_state],
      ]

      for(const [code, testSection, state] of toRun){
        LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - Run validation step:", testSection)

        runtime.refreshStateWith(state)
        await this.runPythonCodeWithOptionsIfNoStdErr(code, runtime, testSection)

        if(runtime.stopped){
          decrease_count = this.canDecreaseAttempts(testSection)
          break
        }
      }

      // Reveal solution and REMs on success, or if the counter reached 0 and the corr&REMs content
      // is still hidden, then prepare an appropriate revelation message if needed (`finalMsg`).
      this.handleValidationOutcome(runtime, decrease_count, code)
    }
  }


  /**Return true if the current section allow to decrease the number of attempts,
   * during a validation.
   * */
  canDecreaseAttempts(testSection){
    const wanted      = CONFIG.section[ this.decreaseAttemptsOnUserCodeFailure ]
    const allowedFrom = CONFIG.sectionOrder[ wanted ]
    const currentAt   = CONFIG.sectionOrder[ testSection ]
    const canDecrease = currentAt >= allowedFrom
    return canDecrease
  }



  //--------------------------------------------------------------------


  /**Build the validation tests runner routine.
   * */
  validateCorrFactory(runningMan=RunningProfile.PROFILE.validateCorr){
    return this.lockedRunnerWithBigFailWarningFactory(
      runningMan,
      this.setupRuntimeIDECorr,
      this.validateThroughRunner,
      this.teardownRuntimeIDECorr,
    )
  }


  async setupRuntimeIDECorr() {
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - corr_btn start")

    this._corrConfigSwap = {            // (not defined in the constructor. MEH!  xp )
      currentCode:  this.getCodeToTest(),
      codeGetter:   this.getCodeToTest,
      profile:      this.profile,       // The profile/MODE has to be ignored for the CORR button => store original
    }

    this.getCodeToTest = ()=>this.corrContent
    this.data.profile  = null           // REMINDER: no setter on this.profile!
    return await this.setupRuntimeIDE()
  }


  async teardownRuntimeIDECorr(runtime) {
    LOGGER_CONFIG.ACTIVATE && jsLogger("[CheckPoint] - corr_btn validation done")
    let out
    try{
      out = await this.teardownRuntimeIDE(runtime)
    }finally{
      // Restore normal values:
      const {currentCode, codeGetter, profile} = this._corrConfigSwap
      this.data.profile  = profile
      this.getCodeToTest = codeGetter
      this.save(currentCode)     // Ensure the corr content doesn't stay stored in localStorage
    }
    return out
  }
}














/**Controller. Linking behaviors and UI.
 * */
export class IdeRunner extends IdeRunnerLogic {


  /**Process to "re-initiate" the internal state of the IDE (useful for testing) */
  _init(){
    super._init()
    this.srcAttemptsLeft = this.attemptsLeft
  }


  // @Override
  buildRunners(){
    this.addRunnerIfNotDefinedYet(this.playFactory(), RunningProfile.PROPS.play, true)

    if(this.hasCheckBtn){
      this.addRunnerIfNotDefinedYet(this.validateFactory(), RunningProfile.PROPS.validate)
    }
    if(this.hasCorrBtn){
      this.addRunnerIfNotDefinedYet(this.validateCorrFactory(), RunningProfile.PROPS.validateCorr)
    }
    super.buildRunners()

  }


  // @Override
  build(){
    super.build()

    // Create and define this.editor + define all needed listeners:
    this.setupAceEditor()
    this.bindIdeButtons()

    // Try to restore a previous session, or extract default starting code, but skip localStorage
    // update (this way, the user is not bothered with updates of the starting content of an IDE
    // they didn't even tried yet, when the author is making updates):
    this.setStartingCode({extractFromLocalStorage: true, saveOnceApplied: false})

    this.announceCodeChangeBasedOnSrcHash()

    observeResizeOf(this.global, this)

    // Check for initial actions on page load:
    if(this.profile===CONFIG.PROFILES.revealed){
      this.revealSolutionAndRems({waitForMathJax:true})
    }
    if(this.twoCols){
      this.switchSplitScreenFromButton(null, false)
    }

    this.editor.resize()
  }



  handleResize(obsEntry){
    const width = this.isVert ? (obsEntry.contentRect.width - 3) / 2  // -3px because borders
                              : obsEntry.contentRect.width - 2        // -2px because borders

    const innerTermWidth = this.termWrapper.width()
    if(width != innerTermWidth){
      this.termWrapper.width(width)
    }
    if(this.isInSplit) this.ideScreenModeVerticalResize()
  }


  /**Center the complete IDE or its terminal if the element is too tall.
   * */
  scrollIntoView(){
    const screenSize = window.innerHeight
    const globSize   = this.global.height()
    const target     = globSize < screenSize*1.2 ? this.global : this.termWrapper
    super.scrollIntoView(target[0])
  }




  /**Create and setup the ACE editor for the current Ide instance.
   * */
  setupAceEditor() {
    const options = getIdeOptions(this)
    this.editor   = ace.edit(this.id, options);
    this.gutter   = this.global.find('div.ace_gutter-layer')

    if(CONFIG._devMode) CONFIG.editors[this.id] = this.editor

    // Kbd shortcuts:
    this.editor.commands.bindKey(
        { win: "Ctrl-Space", mac: "Cmd-Space" }, "startAutocomplete"
    )
    this.editor.commands.addCommand({
        name: "commentTests",
        bindKey: { win: "Ctrl-I", mac: "Cmd-I" },
        exec: this.toggleComments.bind(this),
    })
    this.editor.commands.addCommand({
        name: "runPublicTests",
        bindKey: { win: "Ctrl-S", mac: "Cmd-S" },
        exec: this.runners.play.asEvent,
    })
    if(this.hasCheckBtn){
      this.editor.commands.addCommand({
        name: "runValidationTests",
        bindKey: { win: "Ctrl-Enter", mac: "Cmd-Enter" },
        exec: this.runners.validate.asEvent,
      })
    }
    this._buildAutoSaveOnKeyStroke()
  }


  _buildAutoSaveOnKeyStroke(){
    // Content of the editor is saved every `CONFIG.ideKeyStrokesSave` keystrokes:
    let nChange = 0;
    this.editor.addEventListener("input", _=>{
        if(nChange++ >= CONFIG.ideKeyStrokesSave){
          nChange=0
          this.save()
        }
    })
  }


  buildCorrStuff(){ return CONFIG.inServe }



  bindIdeButtons(){

    // (Doesn't work to catch the Esc applying "exit full screen"... :/ )
    this.global.on('keydown', this.respondToKeyDown.bind(this))

    // Add fullscreen activation binding, but NOT through the ACE editor commands
    // cannot control the exit :/ )
    this.global.on('keyup', this.respondToEscapeKeyUp.bind(this))

    // Bind editor extra buttons:
    this.global.find(".comment.tooltip" ).on("click", this.toggleComments.bind(this))
    this.global.find(".ide-full-screen" ).on("click", this.switchFullScreenFromButton.bind(this))
    this.global.find(".ide-split-screen").on("click", this.switchSplitScreenFromButton.bind(this))
                                         .addClass('deactivated')


    // Bind all buttons below the IDE
    const ideThis = this
    const corrStuff = this.buildCorrStuff()

    this.global.find("button").each(function(){

      const btn  = $(this)
      const kind = btn.attr('btn_kind')
      let callback

      switch(kind){
        case 'play':      callback = ideThis.runners.play.asEvent ; break
        case 'check':     ideThis.updateValidationBtnColor()
                          buildJqHistoryBtn(
                            btn,
                            `history_${ ideThis.id }`,
                            ideThis.validations,
                            ideThis.setupHistoryBtn.bind(ideThis),
                          )
                          callback = ideThis.runners.validate.asEvent ; break

        case 'download':  callback = _=>{ ideThis.download() } ; break
        case 'upload':    callback = _=>{ ideThis.upload() } ; break

        case 'restart':   callback = _=>{ ideThis.restart() } ; break
        case 'save':      callback = _=>{ ideThis.save(); ideThis.focusEditor() } ; break
        case 'zip':       callback = ideThis.buildZipExportsToolsAndCbk(btn) ; break

        case 'corr_btn':  if(!corrStuff) return;
                          callback = ideThis.runners.validateCorr.asEvent ; break
        case 'show':      if(!corrStuff) return;
                          callback = ()=>ideThis.revealSolutionAndRems({show:true}) ; break

        default:          throw new Error(`Y'should never get there, mate... (${ kind })`)
      }
      btn.on('click', callback)
    })
  }


  // @Override
  getTerminalBindings(){

    // Ensure the focus is given back to the terminal after an action triggered from it!
    const asyncTerminalFocus=(cbk)=>async e=>{
      await cbk(e)
      this.editor.blur()
      this.focusTerminal()
    }
    const bindings = {
      ...super.getTerminalBindings(),
      'CTRL+I': asyncTerminalFocus(this.toggleComments.bind(this)),
      'CTRL+S': asyncTerminalFocus(this.playFactory()),
      ...(
        this.hasCheckBtn ? {'CTRL+ENTER': asyncTerminalFocus(this.validateFactory())} : {}
      ),
    }
    return bindings
  }




  respondToKeyDown(_event){   // CodCap
    // Doesn't work to catch the Esc applying "exit full screen"... :/
    IdeFullScreenGlobalManager.currentIde = this  // Register the IDE currently in use
  }


  async respondToEscapeKeyUp(event){
    if(
      event.key == 'Escape'
      && !IdeFullScreenGlobalManager.someMenuOpened
      && !this.guiIdeFlags.escapeIdeSearch
      && !somethingFullScreen()
    ){
      this.requestFullScreen()
      // The browser already handles on its own going out of fullscreen with escape => no else needed

    }else if(event.altKey && event.key==':'){
      this.switchSplitScreenFromButton(event)

    }else{
      this.makeDirty()
    }
    this.guiIdeFlags.escapeIdeSearch = false
  }


  //--------------------------------------------------------------



  /**Extract the current content of the given editor, explore it, and toggle all the LOCs
   * found after the `TestToken` token.
   *
   * Rules for toggling or not are:
   *      - leading spaces do not affect the logic.
   *      - comment out if the first non space character is not "#".
   *      - if the first non space char is "#" and there is no spaces after it, uncomment.
   * */
  toggleComments(e) {
    if(e && e.preventDefault) e.preventDefault()

    const codeLines   = this.getCodeToTest().split('\n')
    const pattern     = CONFIG.lang.tests.as_pattern
    const iTestsToken = codeLines.findIndex(s=>pattern.test(s))

    /// No tests found:
    if(iTestsToken<0) return;

    const toggled = codeLines.slice(iTestsToken+1).map(s=>{
        return s.replace(CONFIG.COMMENTED_PATTERN, (_,spaces,head,tail)=>{
            if(head=='#' && tail!=' ') return spaces+tail
            if(head!='#') return spaces+'#'+head+tail
            return _
        })
    })
    codeLines.splice(iTestsToken+1, toggled.length, ...toggled)
    const repl = codeLines.join('\n')
    this.applyCodeToEditorAndSave(repl)
    this.makeDirty()
    this.focusEditor()
  }


  upload(){           // CodCap
    uploader( txt=>{
      this.applyCodeToEditorAndSave(txt)
      this.makeDirty()
      this.focusEditor()
    })
  }

  /**Download the current content of the editor to the download folder of the user.
   * */
  download(content=null){   LOGGER_CONFIG.ACTIVATE && jsLogger("[Download]")    // CodCap

    let ideContent = content ?? this.getCodeToTest() + "" // enforce stringification in any case
    downloader(ideContent, this.pyName)
    this.focusEditor()
  }



  /**Reset the content of the editor to its initial content, and reset the localStorage for
   * this editor on the way.
   *
   * @returns; true if the user confirmed the reset.
   * */
  restart(){                                                      // CodCap
    LOGGER_CONFIG.ACTIVATE && jsLogger("[Restart]")

    const doReset = window.confirm(CONFIG.lang.restartConfirm.msg)
    if(doReset){
      this.resetElement()
    }
    return doReset
  }

  resetElement(){
    super.resetElement()
    this.setStartingCode({extractFromLocalStorage: false, saveOnceApplied: false})
    this.updateValidationBtnColor()
    this.clearValidations()
    if(Number.isFinite(this.srcAttemptsLeft)){
      this.setAttemptsCounter(this.srcAttemptsLeft)
    }
    $("#solution_" + this.id).addClass('py_mk_hidden')
    this.hiddenDivContent = true
    this.focusEditor()
    // clearPyodideScope()    // v4.2.0: no scope cleaning anymore.
  }
}



CONFIG.CLASSES_POOL.Ide = IdeRunner
