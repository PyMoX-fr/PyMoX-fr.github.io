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
  cssPx,
  waitForPyodideReady,
  RunningProfile,
} from 'functools'
import { decompressAndConvert, txtFormat } from 'functoolsTxt'
import { storeConfWithProxy, VirtualizedDomManager } from '5-2-virtualizer-ides_test'
import { clearPyodideScope } from '0-generic-python-snippets-pyodide'
import { IdeRunner } from '4-ideRunner-ide'








// Finalize the layout...
;(()=>{

  // Remove the SIDE nav in the general view if a nav exists IN THE HEADER:
  if($('nav.md-tabs').is('*')){
      $('div.md-sidebar--primary').remove()
  }

  // Compute the min width of the results table, to limit horizontal squeezing:
  const filtering    = $('#py_mk_tests_filters')
  const filters      = [...filtering.find('button')]
  const filtersWidth = filters.reduce((s,o)=>s + cssPx($(o),'width'), 0)
  const gridGap      = cssPx(filtering, 'grid-gap') * (filters.length-1)
  const width        = Math.round(filtersWidth + gridGap) + 'px'
  $('#py_mk_tests_right_column').css('min-width', width)

})()
















class IdeTesterGuiManager extends IdeRunner {


  /**Dedicated getter to unify this.assertions implementation.
   * */
  get revealCorrRems(){ return this.conf.reveal_corr_rems }

  get ctrlAll(){ return !this.jCtrlAll.prop('checked') }


  constructor(editorId){
    super(editorId)
    this.globalTestsJq = $("#py_mk_test_global_wrapper")
    this.delay         = 0     // Override: no pause when starting the executions
    this.conf          = null
    this.testing       = false
    this.toSwap        = [this.data, ()=>""]      // nothing to swap, by default...
    this.ides_cache    = {}                       // To cache the URL requests
    this.test_cases    = []                       // All the Conf/ConfProxy objects for all the tests (in order)
    this.std_capture   = []   // Full stdout+stdErr capture. Considering jQTerm formatting:
                              //    * any content coming from pyodide stdout is NOT FORMATTED YET
                              //    * any content coming from JS logistic IS ALREADY FORMATTED.
    this.stopTests     = false
    this.pauseTests    = false
    this.jCtrlAll      = $("#py_mk_tests_ctrl_box")
    this.fullCode      = ""   // Initial loaded code (associated to one conf/test)
    this.visibilities  = Object.values(CONFIG.qcm).reduce( (o,k)=>(o[k]=1,o), {})
    this.virtuose      = new VirtualizedDomManager(this)
    this._extractJsData()
    this.virtuose.initiateTestsResults()
  }

  _extractJsData(){
    // Array of arrays: [IdeTestDump, proxy], to debug troubles with auto extractions or conversions.
    const debug = []
    if(CONFIG._devMode){
      window._CASES_DATA = debug
    }

    const testCasesData = decompressAndConvert(CASES_DATA)

    // Linearize test_cases and build all proxies:
    for(const ideConf of testCasesData){
      const ide_proxy = storeConfWithProxy(this.test_cases, debug, ideConf)
      this.virtuose.register(ide_proxy)
      const subcases = ideConf.subcases??[]
      subcases.forEach( (sub,i)=>{
        const proxy = storeConfWithProxy(this.test_cases, debug, sub, ideConf, i, ide_proxy)
        this.virtuose.register(proxy)
      })
    }
  }

  // @Override
  build(){
    super.build()
    this.bindFilters()
    this.buildTxtFilters()
    this.bindGlobalGlobalButtons()
    this.bindGlobalSelectors()
    this._updateAllCounters()
  }


  async _loadButtonBinding(proxy){
      if(this.testing) return;    // Deactivated during tests (otherwise, big troubles...)

      // Do NOT use the pyodideAsyncLock utility here, so that the call is just cancelled
      // if occurring during a test session (see condition above), instead of being delayed
      // until the tests are done.
      await waitForPyodideReady()

      this.conf = proxy
      this.data = await this.getIdeData(this.conf)   // Update this.conf first! (see getters)

      this.getCodeToTest =()=> this.editor.getSession().getValue()
      this.applyCodeToEditorAndSave(this.conf.loadedCode)
      this._applyConfAndData(true)
  }

  bindFilters(){
    const ideThis = this
    $(".filter-btn").on('click', function(){
      const active = 1 ^ +this.getAttribute('active')
      this.setAttribute('active', active)
      for(const state of this.dataset.states.split('|')){
        ideThis.visibilities[state] = active
      }
      ideThis.virtuose.filterChange()
    })
  }

  buildTxtFilters(){
    const box   = $('#py_mk_tests_regex_box')
    const input = $('#py_mk_tests_txt_search')

    box.on('click', ()=>{
      this._applySearch(input, input.prop('value'), box.prop('checked'))
    })
    input.on('keydown', _.debounce(()=>{
      this._applySearch(input, input.prop('value'), box.prop('checked'))
    }, 300))

    // Automatically trigger the filters, if something is there (may happen on reload):
    if(input.prop('value')){
      this._applySearch(input, input.prop('value'), box.prop('checked'))
    }
  }

  _applySearch(input, txt, useReg){
    let predicate = null
    if(txt){
      if(!useReg){
        predicate = (str)=>str.includes(txt)
      }else{
        try{
          const reg = new RegExp(txt)
          predicate = (src)=>Boolean(reg.exec(src))
          input.attr('data-tip-txt', "")
        }catch(e){
          input.addClass("blink-error").attr('data-tip-txt', "Invalid regexp")
          setTimeout(()=>input.removeClass("blink-error"), 400)
        }
      }
    }
    this.virtuose.txtPredicate = predicate
    this.virtuose.filterChange()
  }

  // Configure "run all" and "stop" buttons:
  bindGlobalGlobalButtons(){
    $('button[btn_kind=test_ides]' ).on('click', ()=>{ this.runAllTests() })
    $('button[btn_kind=test_pause]').on('click', ()=>{
      this.pauseTests = !this.pauseTests ;
      $('button[btn_kind=test_pause]>img').css('--ide-btn-color', this.pauseTests?'gray':'orange')
    })
    $('button[btn_kind=test_stop]' ).on('click', ()=>{
      this.stopTests=true
      $('button[btn_kind=test_pause]>img').css('--ide-btn-color', 'orange')
    })
    this.jCtrlAll.on('click', ()=>{
      const txt = this.ctrlAll ? 'all':'visible'
      $('button#select-all').text('Select '+txt)
      $('button#unselect-all').text('Unselect '+txt)
      $('button[btn_kind=test_ides]').attr('data-tip-txt', `Run ${ txt } tests...`)
    })
  }

  getCasesToHandle(){
    return this.ctrlAll ? this.virtuose.lines : [...this.virtuose.mayBeInDom]
  }


  bindGlobalSelectors(){
    // Configure global buttons (select-all, unselect-all):
    ;[
      '', 'un'
    ].forEach( (prefix) => {
      $(`button#${ prefix }select-all`).on('click', ()=>{
        this.getCasesToHandle().forEach(row=>{
          if(!row.proxy.isRoot){
            this.setSvgAndCounters(row.proxy, prefix+'checked', false)
          }
        })
        this._updateAllCounters()    // once only!
        this.virtuose.filterChange()
      })
    })
    // Configure "human" toggle button:
    $(`button#toggle-human`).on('click', _=>{
      this.getCasesToHandle().forEach(conf=>{
        if(!conf.isRoot && conf.human){
          const state = conf.doSkip ? CONFIG.qcm.checked : CONFIG.qcm.unchecked
          this.setSvgAndCounters(conf, state, false)
        }
      })
      this._updateAllCounters()    // once only!
      this.virtuose.filterChange()
    })
  }



  /**Update the html class of the svg container with the given id. If @newState is null,
   * automatically toggle the current element, based on the current conf.doSkip value.
   * */
  setSvgAndCounters(conf, newState=null, updateCounters=true){
    if(!newState){
      // swapping the state, if not provided:
      newState = conf.doSkip ? CONFIG.qcm.checked : CONFIG.qcm.unchecked
    }
    const parent = conf.parentProxy
    const visibilityChange = this.visibilities[newState] - this.visibilities[conf.state]
    const parentSrcVisibility = visibilityChange && parent && this.getRootVisibility(parent)

    if(updateCounters) this.updateCounter(conf.state, -1)
    conf.doSkip = newState==CONFIG.qcm.unchecked
    conf.state  = newState
    if(updateCounters) this.updateCounter(newState, +1)

    // Update the UI only if it exists already (otherwise, the proxy state will give it the proper
    // value on later creation):
    if(conf.jSvg) conf.jSvg.attr('data-state', newState)

    if(visibilityChange){
      const parentChange = parent && parentSrcVisibility !== this.getRootVisibility(parent)
      this.virtuose.rowVisibilityChange(conf.iRow, visibilityChange, parentChange)
    }
  }

  getRootVisibility(parentConf){
    return Object.entries(parentConf.state).some( ([state,n]) => n && this.visibilities[state] )
  }


  getCounterProp(state){
    switch(state){
      case CONFIG.qcm.correct:
      case CONFIG.qcm.mustFail: return "success"
      case CONFIG.qcm.failTest:
      case CONFIG.qcm.passBad:  return "failed"
      default:                  return state
    }
  }

  updateCounter(state, delta){
    let cntProp = this.getCounterProp(state)
    const cnt = $("#cnt-"+cntProp)
    cnt.text( +cnt.text() + delta )
  }

  /**Update the values of each counter, after a global update, analyzing the states of all confs.
   * */
  _updateAllCounters(){
    const counts = { checked:0, unchecked:0, success:0, failed:0 }
    this.test_cases.forEach(conf=>{
      if(!conf.isRoot){
        const prop = this.getCounterProp(conf.state)
        counts[prop]++
      }
    })
    for(const prop in counts){
      $("#cnt-"+prop).text(counts[prop])
    }
  }


  swapConfAndData(data=null, codeGetter=null){
    if(data!==null){
      this.toSwap = [ data, codeGetter ]
    }
    ;[this.data, this.toSwap[0]]          = [this.toSwap[0], this.data]
    ;[this.getCodeToTest, this.toSwap[1]] = [this.toSwap[1], this.getCodeToTest]
  }

  announceTest(clearTerm){
    if(this.testing){
      if(clearTerm) this.terminal.clear()
      this.terminal.echo(`Testing: ${ this.conf.ide_name }`)
    }
  }


  _applyConfAndData(onLoad=false){

    // Always reset the "done" state, to make tests independent of each others.
    this.storage.done = 0
    if('done' in this.conf){
      this.storage.done = this.conf.done
    }
    this.updateValidationBtnColor()

    const hasSetMaxHide = 'set_max_and_hide' in this.conf
    if(onLoad || hasSetMaxHide){
      this.conf.reveal_corr_rems = false
      this.hiddenDivContent      = true
      this.srcAttemptsLeft       = hasSetMaxHide ? this.conf.set_max_and_hide
                                                 : this.conf.srcAttemptsLeft
      this.data.attempts_left    = this.srcAttemptsLeft
    }

    this.terminal.settings().outputLimit = this.stdoutCutOff
    this.updateStdoutCutFeedback(this.cutFeedback)

    this.setAttemptsCounter(this.attemptsLeft, true)
    this._clearStateIfNeededAndReinit(onLoad)
    this.setupFetchers(this.conf.rel_dir_url, true, this.conf.inputs)
    this.clearLibsIfNeeded()
  }


  clearLibsIfNeeded(){
    if(this.conf.clear_libs){
      pyodide.runPython(`
def _hack_remove_libs():
    import sys, shutil
    from pathlib import Path

    to_clear = ${ JSON.stringify(this.conf.clear_libs) }
    for name in to_clear:
        sys.modules.pop(name, None)
        p = Path(name)
        if p.exists():
            shutil.rmtree(p)
_hack_remove_libs()
del _hack_remove_libs`)
    }
  }


  /**Note: Do NOT clear the scope in teardownRuntime: this would forbid
   * playing with the terminal afterward.
   * */
  _clearStateIfNeededAndReinit(force=false){
    if(force || !this.conf.no_clear){
      clearPyodideScope()
      this._init()
    }
  }

  async runAllTests(rowProxy){
    throw new Error('Not implemented')
  }



  /**Extract the config object for the given IDE, getting rid of the profile data on the way.
   * Data are cached so that a page is requested once only.
   * @returns a copy of the original object (so that it can be modified on the fly by the caller)
   * */
  async getIdeData(conf){

    // Request + store the data for all the IDEs in the related page, if missing:
    if(!this.ides_cache[conf.editor_id]){

      const response = await fetch(conf.page_url)
      const html     = await response.text()

      const reg      = /(?<=PAGE_IDES_CONFIG\s*=\s*['"]).+?(?=["']\s*<\/script>)/
      const compress = html.match(reg)[0]                 // Does always match!
      const fix_comp = compress.replace(/\\x1e/g, "\x1e")
      const configs  = decompressAndConvert(fix_comp)

      Object.entries(configs).forEach( ([editor,data])=>{
        this.ides_cache[editor] = this._dataPostConversion(data)
      })
    }

    // Extract ide's data object, enforcing its existence:
    const data = this.ides_cache[conf.editor_id]

    if(!data) throw new Error(
      `Couldn't extract data for ${ conf.ide_name }.\nIf this is an IDE without python file, `
      +"you should restart mkdocs serve (the ids generator is now out of synch with the "
      +"rendered data). Otherwise, please raise an issue on the project's repository."
    )

    // Update the global values, once only:
    if(!conf.data){
      conf.registerData(data)
    }

    // Send back a copy, to allow runtime mutation while keeping a clean initial state
    // (no need for a deep copy, so far...)
    const freshData = {...data}

    // Must be done each time:
    ;[
      'decrease_attempts_on_user_code_failure',
      'deactivate_stdout_for_secrets',
      'show_only_assertion_errors_for_secrets',
    ].forEach(prop=>{
      if(prop in conf) freshData[prop] = conf[prop]
    })
    if('set_max_and_hide' in conf){
      freshData.attemptsLeft = conf.set_max_and_hide
    }
    return freshData
  }
}














export class IdeTester extends IdeTesterGuiManager {


  // @Override
  buildRunners(){
    super.buildRunners()

    const runCmdTerm = this.buildAsyncPythonExecutors(RunningProfile.PROFILE.testingCmd)
    this.addRunnerIfNotDefinedYet(async ()=>{ await runCmdTerm(this.conf.term_cmd) }, RunningProfile.PROPS.testingCmd)
    this.addRunnerIfNotDefinedYet(this.playFactory(RunningProfile.PROFILE.testingPlay), RunningProfile.PROPS.testingPlay)
    this.addRunnerIfNotDefinedYet(this.validateFactory(RunningProfile.PROFILE.testingValid), RunningProfile.PROPS.testingValid)
    this.addRunnerIfNotDefinedYet(this.validateCorrFactory(RunningProfile.PROFILE.testingCorr), RunningProfile.PROPS.testingCorr)
    this.addRunnerIfNotDefinedYet(this.runners.testingPlay, RunningProfile.PROPS.testingRun)
  }


  announceCodeChangeBasedOnSrcHash(){}        // Override/sink
  save(_){}                                   // Override/sink


  // Override, to capture the 'stdout' from JS
  terminalEcho(content, options){
    const withTail = !options || (options.newline??true) ? content+'\n' : content
    this.std_capture.push(withTail)
    super.terminalEcho(content, options)
  }


  // Override
  terminalDisplayOnIdeStart(){
    this.announceTest(false)
    super.terminalDisplayOnIdeStart()
  }


  // @Override
  /**Reset the content of the editor to its initial content, and reset the localStorage for
   * the editor on the way.
   * */
  restart(){    LOGGER_CONFIG.ACTIVATE && jsLogger("[Testing]", 'Restart IDE')
    let startCode = ""
    if(this.conf){
      startCode = this.conf.loadedCode
      this._applyConfAndData(true)
    }
    this.applyCodeToEditorAndSave(startCode)
    this.updateValidationBtnColor(0)
    this.terminal.clear()
    this.focusEditor()
  }



  buildCodeGetter(){
    const cbk = this.conf.code ? ()=>this.userContent : ()=>this.corrContent
    if(this.conf.run_play){
      return ()=>this._joinCodeAndPublicSections(cbk())
    }
    return cbk
  }


  async setupRuntimeTests(){
    if(!this.testing) return;   // Using the IDE directly, not running tests
    const data = await this.getIdeData(this.conf)
    this.swapConfAndData(data, this.buildCodeGetter())
    this._applyConfAndData()
  }

  static TEST_OUTCOME = Object.freeze([CONFIG.qcm.failTest, CONFIG.qcm.passBad, CONFIG.qcm.correct, CONFIG.qcm.mustFail])

  async teardownRuntimeTests(runtime){
    if(!this.testing) return;   // Using the IDE directly, not running tests

    this.conf.attempts_end = this.attemptsLeft  // Store before swap
    const failedTestMsg    = this._analyzeTestOutcome(runtime)

    const iClass   = 2 * !failedTestMsg + this.conf.doFail
    const newState = IdeTester.TEST_OUTCOME[iClass]
    this.setSvgAndCounters(this.conf, newState)

    this.swapConfAndData()        // must always occur
    this.teardownFetchers()       // Must always occur
    this.std_capture.length = 0   // Always...


    if(failedTestMsg){
      if(runtime){                      // Normal executions
        console.error(failedTestMsg)
      }else{
        throw new Error(failedTestMsg)  // Something went wrong => will trigger BigFail
      }
    }
  }



  // @Override
  async setupRuntimeIDE(){
    await this.setupRuntimeTests()
    return await super.setupRuntimeIDE()
  }

  // @Override
  async teardownRuntimeIDE(runtime){
    try{
      await super.teardownRuntimeIDE(runtime)
    }finally{
      await this.teardownRuntimeTests(runtime)
    }
  }

  // @Override
  async setupRuntimeTerminalCmd(cmdChunk){
    if(this.testing){
      this.announceTest(true)
      await this.setupRuntimeTests()
    }
    const runtime = await super.setupRuntimeTerminalCmd(cmdChunk)
    if(this.testing){
      const cmd = this.conf.term_cmd.split('\n').join('\n'+CONFIG.MSG.promptWait)
      this.terminalEcho(CONFIG.MSG.promptStart + cmd)
    }
    return runtime
  }
  // @Override
  async teardownRuntimeTerminalCmd(runtime){
    try{
      await super.teardownRuntimeTerminalCmd(runtime)
    }finally{
      await this.teardownRuntimeTests(runtime)
    }
  }


  // @Override
  setAttemptsCounter(n, low=false){
    n = Number.isFinite(n) ? n : "∞"
    if(low){
      $(this.counterH+'-low').text(n)
    }
    super.setAttemptsCounter(n)
  }


  // Override
  revealSolutionAndRems(){
    if(!this.conf) return;
    this.conf.reveal_corr_rems = true
    this.hiddenDivContent = false      // Mimic actual behavior, logic-wise (only...)
  }




  // ------------------------------------------------------------




  async runAllTests(rowProxy=null){
    if(this.pauseTests){
      $('button[btn_kind=test_pause]>img').css('--ide-btn-color', 'orange')
      this.pauseTests = false
    }
    if(this.testing) return;

    // Do NOT use the pyodideAsyncLock utility here, so that the call is just cancelled if it
    // occurs during a test session (see above), instead of being delayed until the tests are
    // done. Note that an unlucky click on the IDE buttons _just in between_ two tests might
    // cause a mess in the tests results (of just cause weird display in the terminal: the IDE
    // could be run, then the test, and unless it doesn't clear the scope or the IDE did install
    // something, the test should run fine...), because the Lock is then available.
    await waitForPyodideReady()

    this.terminal.clear()
    const startTime = Date.now()
    this.testing    = true
    this.stopTests  = false
    this.pauseTests = false

    // When the play button is hit directly by the user, the test has to be run even if it is not
    // currently selected:
    const manualRun = Boolean(rowProxy)
    const start     = manualRun && rowProxy.proxy.iStart
    const end       = manualRun && rowProxy.proxy.iEnd
    const range     =!manualRun  ? this.getCasesToHandle()
                    : this.ctrlAll ? this.virtuose.lines.slice(start, end)
                                   : [...this.virtuose.mayBeInDom.iterRows(start, end)]
    let errOrNull   = null
    try{
      for(const row of range){
        if(this.pauseTests){
          while(this.pauseTests && !this.stopTests){
            await sleep(100)
          }
        }
        if(this.stopTests) break

        const conf    = row.proxy
        const skipped = conf.isRoot || conf.doSkip && !manualRun
        if(skipped){
          continue
        }

        this.conf = conf
        LOGGER_CONFIG.ACTIVATE && jsLogger('[Testing] - START', conf.ide_name)

        const hasCmd      = conf.term_cmd !== undefined
        const runningKind = conf.auto_run ? (hasCmd ? RunningProfile.PROPS.testingCmd : RunningProfile.PROPS.testingRun)
                          : hasCmd        ? RunningProfile.PROPS.testingCmd
                          : conf.run_play ? RunningProfile.PROPS.testingPlay
                          : conf.run_corr ? RunningProfile.PROPS.testingCorr
                                          : RunningProfile.PROPS.testingValid
        await this.runners[ runningKind ]()
        LOGGER_CONFIG.ACTIVATE && jsLogger('[Testing] - DONE', conf.ide_name, '\n')
      }
    }catch(e){
      errOrNull = e
    }finally{
      this._endTests(startTime, errOrNull)
    }
  }


  _endTests(start, error=null){
    const txt      = !error ? CONFIG.lang.testsDone.msg : txtFormat.error(String(error))
    const elapsed  = ((Date.now() - start) / 1000).toFixed(1)
    this.terminal.echo(txt)
    this.terminal.echo(txtFormat.info(`(Elapsed time: ${ elapsed }s)`))
    this.conf      = null
    this.testing   = false
    this.stopTests = false
  }



  _analyzeTestOutcome(runtime){
    if(!runtime) return "Probably failed in the env section..."

    const fullOut = this.std_capture.join('')
    let msg = []

    if(runtime.gotBigFail){
      return this._formatErrMsgArray(runtime, ['Got BigFail!!'])
    }

    if(!Number.isFinite(this.srcAttemptsLeft)){
      if(Number.isFinite(this.conf.attempts_end)) msg.push(
        "The number of attempts left should still be infinite, but was: " + this.conf.attempts_end
      )
      if(this.conf.delta_attempts) msg.push(
        `Expected delta_attempts=${ this.conf.delta_attempts } the final number of attempts is: ${ this.conf.attempts_end }`
      )

    }else if(this.conf.delta_attempts!==undefined){
      const actual = this.conf.attempts_end - this.srcAttemptsLeft
      const exp    = this.conf.delta_attempts
      if(exp != actual) msg.push(
        `Delta attempts: ${ actual } should be ${ exp }`
      )
    }


    const failedAssertions = (this.conf.assertions??[]).map(check=>check(this)).join('')
    if(failedAssertions) msg.push(failedAssertions)


    const checkMessageInclusionOrMatch=(prop)=>{
      const data = this.conf[prop]
      if(!data) return;

      const checkInclude = typeof(data) == 'string'

      const present  = !prop.includes('not')
      const announce =  prop.includes('error') ? "error message" : "stdout/stderr"
      const verb     =  checkInclude ? "include" : "match"
      const negation =  present ? '' : 'NOT '
      const outcome  = checkInclude ? runtime.stdErr.includes(data) : data.test(fullOut)

      if(outcome!==present){
        msg.push(`The ${ announce } should ${ negation }${ verb }: ${ prop }="${ data }"`)
      }
    }

    checkMessageInclusionOrMatch('in_error_msg')
    checkMessageInclusionOrMatch('not_in_error_msg')

    checkMessageInclusionOrMatch('std_capture_regex')
    checkMessageInclusionOrMatch('not_std_capture_regex')


    if(!msg.length && runtime.stopped === this.conf.doFail){
      return ""
    }else{
      return this._formatErrMsgArray(runtime, msg)
    }
  }


  _formatErrMsgArray(runtime, msg){
    msg = `Test failed for ${this.conf.ide_link} :

${ runtime.stdErr || "No error raised, but..." }

${ msg.join('\n') }`
    return msg
  }
}


CONFIG.CLASSES_POOL.IdeTester = IdeTester
