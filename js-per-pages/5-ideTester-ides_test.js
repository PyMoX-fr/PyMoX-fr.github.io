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
  decompressAndConvert,
  PythonError,
  txtFormat,
  waitForPyodideReady,
  RunningProfile,
} from 'functools'
import { clearPyodideScope } from '0-generic-python-snippets-pyodide'
import { IdeRunner } from '4-ideRunner-ide'



const TEST_OUTCOME = Object.freeze([CONFIG.qcm.failTest, CONFIG.qcm.passBad, CONFIG.qcm.ok, CONFIG.qcm.failOk])



const confWithProxy=(conf, parent=undefined)=>{
  return new Proxy(conf, {
    get(o, prop, prox){
      switch(prop){
        case "__conf_updated": return o.__conf_updated      // No proxy transmission here...
        case "isIde":          return !parent
        case "hasSubCases":    return !parent && Boolean(o.subcases.length)
        default:               return o[prop] ?? (parent && parent[prop])
      }
    },
    has(o, prop){
      return (prop in o) || Boolean(parent) && (prop in parent)
    }
  })
}








class IdeTesterGuiManager extends IdeRunner {


  /**Dedicated getter to unify this.assertions implementation.
   * */
  get revealCorrRems(){ return this.conf.reveal_corr_rems }


  constructor(editorId){
    super(editorId)
    this.globalTestsJq = $("#py_mk_test_global_wrapper")
    this.delay       = 0     // Override: no pause when starting the executions
    this.conf        = null
    this.testing     = false
    this.toSwap      = [this.data, ()=>""]      // nothing to swap, by default...
    this.ides_cache  = {}                       // To cache the URL requests
    this.test_cases  = []                       // All the Conf/ConfProxy objects for all the tests (in order)
    this.std_capture = []   // Full stdout+stdErr capture. Considering jQTerm formatting:
                            //    * any content coming from pyodide stdout is NOT FORMATTED YET
                            //    * any content coming from JS logistic IS ALREADY FORMATTED.
    this.stopTests   = false
    this.fullCode    = ""   // Initial loaded code (associated to one conf/test)

    this._extractJsData()
  }


  _extractJsData(){
    const test_cases = decompressAndConvert(CASES_DATA)
    const debug = []

    // Linearize test_cases and build all proxies:
    for(const ideConf of test_cases){

      const proxIde = confWithProxy(ideConf)
      this._finalizeConf(proxIde)
      this.test_cases.push(proxIde)
      debug.push([ideConf, proxIde])

      const subcases = ideConf.subcases??[]
      subcases.forEach( (sub,i)=>{
        const proxSub = confWithProxy(sub, ideConf)
        this._finalizeConf(proxSub, i)
        this.test_cases.push(proxSub)
        debug.push([sub, proxSub])
      })
      if(CONFIG._devMode){
        window._CASES_DATA = debug
      }
    }
  }

  /**Initial conversion steps, to finalize the python->JS transfer of the tests data.
   * Also define composed values that are specific to this tests.
   *
   * WARNING: these composed values MUST NEVER override some original properties, otherwise the
   * finalization of the parent may occasionally mess up the finalization of some of the children.
   * */
  _finalizeConf(conf, iCase=null){
    conf.doFail = Boolean(conf.fail || conf.in_error_msg || conf.not_in_error_msg)
    conf.doSkip = Boolean(conf.skip || conf.human)
    conf.reveal_corr_rems = false

    if(iCase!==null && iCase>0){
      conf.no_clear ??= true
    }

    // Convert regexps patterns to RegExp objects:
    const regexps = 'std_capture_regex not_std_capture_regex'.split(' ')
    regexps.forEach( prop=>{
      try{
        // Warning: subcases may hold an empty string that is cancelling the use of the parent
        // pattern. In that case, keep the empty string instead of a RegExp, to avoid applying
        // the regexp check of the parent on the child test:
        const pattern = conf[prop]
        if(typeof(pattern)=='string'){
          conf[prop] = pattern && new RegExp(pattern, 'si')
        }
      }catch(e){
        throw new PythonError(`Invalid Regex generation for ${ prop }, using ${ conf[prop] }`)
      }
    })

    if(Array.isArray(conf.assertions)) return;

    // Convert assertions string to a list of predicates:
    conf.assertions = conf.assertions && conf.assertions.split(' ').map(rule=>{
      const prop = _.camelCase( rule.replace(/^!/, '') )
      const revExpected = rule.startsWith('!')  // Reversing to enforce booleans everywhere
      return (obj) =>{
        if( obj[prop]===undefined ) return prop+' is undefined...'
        return!obj[prop] == revExpected ? "" : `${ prop }: should be ${ !revExpected }\n`
      }
    })
  }

  // @Override
  announceCodeChangeBasedOnSrcHash(){}


  // @Override
  build(){
    super.build()
    const playBtns = $(".py_mk_test_element > [btn_kind=test_1_ide]")

    this.bindLoadButtons(playBtns)
    this.bindPlayButtons(playBtns, this)
    this.bindDivSvgCheckboxesAndFillConfs(playBtns, this)
    const updateIdesVisibility = this.buildIdeRowVisibilityUpdateRoutine(playBtns, this)
    this.bindFilters(updateIdesVisibility, this)
    this.bindGlobalPlayStopButtons()
    this.bindGlobalSelectorButtons(updateIdesVisibility)
  }

  bindLoadButtons(playBtns){
    // Bind load buttons (if they exist):
    playBtns.prev("[btn_kind=load_ide]").on('click', async (e)=>{
      if(this.testing) return;    // Deactivated during tests (otherwise, big troubles...)

      // Do NOT use the pyodideAsyncLock utility here, so that the call is just cancelled
      // if occurring during a test session (see above), instead of being delayed until
      // the tests are done.
      await waitForPyodideReady()

      const plyBtn = $(e.currentTarget).next()
      const iIde   = +plyBtn.data('iIde')
      this.conf    = this.test_cases[iIde]
      this.data    = await this.getIdeData(this.conf)   // Update first (see getters)

      this.getCodeToTest =()=> this.editor.getSession().getValue()
      this.applyCodeToEditorAndSave(this.conf.loadedCode)
      this._applyConfAndData(true)
    })
  }


  bindPlayButtons(playBtns, ideThis){
    playBtns.on('click', async function(){
      const iIde    = +this.dataset.iIde
      const iRow    = +this.dataset.iRow
      const confIde = ideThis.test_cases[iIde]
      const conf    = ideThis.test_cases[iRow]
      const iLast   = conf.hasSubCases ? iIde+confIde.subcases.length : iRow
      await ideThis.runAllTests(iIde, iLast+1, true)
    })
  }

  bindDivSvgCheckboxesAndFillConfs(playBtns, ideThis){

    const iRowOnPlayBtnFromSvgDiv =(jSvgDiv)=> +jSvgDiv.parent().next().find('[btn_kind=test_1_ide]').data('iRow')

    // Associate the jSvg holders with the related conf object:
    const svgDivs = playBtns.parent().prev().find('[data-state]')
    svgDivs.on('click', (e)=>{
      const jSvg = e.currentTarget
      const iRow   = iRowOnPlayBtnFromSvgDiv($(jSvg))
      const conf   = this.test_cases[iRow]
      this.setSvgAndCounters(conf)
    })

    // Assign iRow values and archive the related jDiv holding the svg for each test/conf:
    svgDivs.each(function(){
      const jSvgDiv = $(this)
      const iRow    = iRowOnPlayBtnFromSvgDiv(jSvgDiv)
      const conf    = ideThis.test_cases[iRow]
      conf.jSvg   = jSvgDiv
      conf.iRow     = iRow
    })
  }

  buildIdeRowVisibilityUpdateRoutine(playBtns, ideThis){
    const playBtnsArr = [...playBtns].map(o=>$(o))
    const idesWithChildren = [];
    _.zip(this.test_cases, playBtnsArr).forEach( ([conf, jDiv], iRow) => {
      if(conf.hasSubCases){
        idesWithChildren.push( [jDiv, playBtnsArr.slice(iRow+1, iRow+1+conf.subcases.length)] )
      }
    })

    const updateIdesVisibility=()=>{
      idesWithChildren.forEach(([jIde, jChildren])=>{
        const visible = jChildren.some(jDiv=>jDiv.css('display')!='none')
        ideThis.globalTestsJq.css(`--item-${ jIde[0].dataset.iRow }`, visible ? 'unset':'none')
      })
    }
    return updateIdesVisibility
  }

  bindFilters(updateIdesVisibility, ideThis){
    $(".filter-btn").on('click', function(){
      const active = 1 ^ +this.getAttribute('active')
      this.setAttribute('active', active)
      for(const state of this.dataset.states.split('|')){
        ideThis.globalTestsJq.css(`--display-${ state }`, active?'unset':'none')
      }
      updateIdesVisibility()
    })
  }

  bindGlobalPlayStopButtons(){
    // Configure "run all" and "stop" buttons:
    this.global.parent()
               .find('button[btn_kind=test_ides]')
               .on('click', ()=>{ this.runAllTests() })
               .parent()
               .find('button[btn_kind=test_stop]')
               .on('click', ()=>{ this.stopTests=true })
  }

  bindGlobalSelectorButtons(updateIdesVisibility){

    // Configure global buttons (select-all, unselect-all):
    ;[
      [false, ''],
      [true, 'un']
    ].forEach( ([skipped,prefix]) => {
      $(`button#${ prefix }select-all`).on('click', _=>{
        this.test_cases.forEach(conf=>{
          if(conf.hasSubCases) return;
          conf.doSkip = skipped
          this.setSvgAndCounters(conf, prefix+'checked', false)
        })
        this._updateCounters()
        updateIdesVisibility()
      })
    })

    // Configure "human" toggle button:
    $(`button#toggle-human`).on('click', _=>{
      this.test_cases.forEach(conf=>{
        if(!conf.human || conf.hasSubCases) return;
        conf.doSkip = !conf.doSkip
        const state = conf.doSkip ? CONFIG.qcm.unchecked : CONFIG.qcm.checked
        this.setSvgAndCounters(conf, state, false)
      })
      this._updateCounters()
      updateIdesVisibility()
    })
  }



  updateDisplayCssVar(conf, state){
    this.globalTestsJq.css(`--item-${ conf.iRow }`, `var(--display-${ state })`)
  }



  /**Update the html class of the svg container with the given id.
   * If @newState is null, automatically toggle the current element, based on the current conf.doSkip value.
   * */
  setSvgAndCounters(conf, newState=null, updateCounters=true){
    if(!newState){
      // swapping the state:
      newState = conf.doSkip ? CONFIG.qcm.checked : CONFIG.qcm.unchecked
    }
    this.updateDisplayCssVar(conf, newState)
    if(updateCounters) this.updateCounter(conf.jSvg.attr('data-state'), -1)
    conf.jSvg.attr('data-state', newState)
    if(updateCounters) this.updateCounter(newState, +1)
    conf.doSkip = newState==CONFIG.qcm.unchecked
  }


  updateCounter(state, delta){
    let cntProp = this.getCounterProp(state)
    const cnt = $("#cnt-"+cntProp)
    cnt.text( +cnt.text() + delta )
  }

  getCounterProp(state){
    switch(state){
      case CONFIG.qcm.ok:
      case CONFIG.qcm.failOk:   return "success"
      case CONFIG.qcm.failTest:
      case CONFIG.qcm.passBad:  return "failed"
    }
    return state
  }


  /**Update the values of each counter, after a global update, analyzing the states of all confs.
   * */
  _updateCounters(){
    const counts = { checked:0, unchecked:0, success:0, failed:0 }
    this.test_cases.forEach(conf=>{
      if(conf.hasSubCases) return;
      const state = conf.jSvg.attr('data-state')
      counts[ this.getCounterProp(state) ]++
    })
    for(const prop in counts){
      $("#cnt-"+prop).text(counts[prop])
    }
  }


  // Override
  terminalEcho(content, options){
    const withTail = !options || (options.newline??true) ? content+'\n' : content
    this.std_capture.push(withTail)
    super.terminalEcho(content, options)
  }


  swapConfAndData(data=null, codeGetter=null){
    if(data!==null){
      this.toSwap = [ data, codeGetter ]
    }
    ;[this.data, this.toSwap[0]]          = [this.toSwap[0], this.data]
    ;[this.getCodeToTest, this.toSwap[1]] = [this.toSwap[1], this.getCodeToTest]
  }


  // Override
  terminalDisplayOnIdeStart(){
    this.announceTest(false)
    super.terminalDisplayOnIdeStart()
  }

  announceTest(clearTerm){
    if(this.testing){
      if(clearTerm) this.terminal.clear()
      this.terminal.echo(`Testing: ${ this.conf.ide_name }`)
    }
  }


  // @Override
  /**Reset the content of the editor to its initial content, and reset the localStorage for
   * the editor on the way.
   * */
  restart(){    LOGGER_CONFIG.ACTIVATE && jsLogger("[RestartTester]")
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


  _applyConfAndData(onLoad=false){

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
    this.setupFetchers()
    this.clearLibsIfNeeded()
  }


  // @Override
  setAttemptsCounter(n, low=false){
    n = Number.isFinite(n) ? n : "∞"
    if(low){
      $(this.counterH+'-low').text(n)
    }
    super.setAttemptsCounter(n)
  }


  save(_){}

  async runAllTests(start, end, forceRun=false){ throw new Error('Not implemented') }

  setupFetchers(){ throw new Error('Not implemented') }

  clearLibsIfNeeded(){ throw new Error('Not implemented') }



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
    if(1 || !conf.__conf_updated){
      conf.__conf_updated = 1

      ;`decrease_attempts_on_user_code_failure
        deactivate_stdout_for_secrets
        show_only_assertion_errors_for_secrets
      `.trim()
        .split(/\s+/).forEach(prop=>{
        if(prop in conf) data[prop] = conf[prop]
      })

      if('set_max_and_hide' in conf){
        conf.set_max_and_hide = conf.set_max_and_hide==1000 ? Infinity : conf.set_max_and_hide
      }
      conf.srcAttemptsLeft = data.attempts_left

      const sections = [
        this._toSection('env',       data.env_content),
        this._toSection('env_term',  data.env_term_content),
        this._toSection('code',      data.user_content),
        this._toSection('corr',      data.corr_content),
        this._toSection('tests',     data.public_tests),
        this._toSection('secrets',   data.secret_tests),
        this._toSection('post_term', data.post_term_content),
        this._toSection('post',      data.post_content),
      ]
      // Extract the section used during the tests (based on the main conf object...):
      const [codeToTest] = sections.splice(2 + !conf.code, 1)
      const others       = sections.join('').replace(/'''/g, "\\'\\'\\'").trim()
      const commented    = others && `\n\n\n'''\n${ others }\n\n'''\n`
      conf.loadedCode    = codeToTest.trim() + commented
    }

    // Send back a copy, to allow runtime mutation while keeping a clean initial state
    // (no need for a deep copy, so far...)
    const freshData = {...data}
    if('set_max_and_hide' in conf){
      freshData.attemptsLeft = conf.set_max_and_hide
    }
    return freshData
  }


  /**Build a sub section of the original python file.
   * */
  _toSection(py_section, content){
    return content && `\n\n# --- PMT:${ py_section } --- #\n${ content }`
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


  async runAllTests(start, end, forceRun=false){
    if(this.testing) return;

    // Do NOT use the pyodideAsyncLock utility here, so that the call is just cancelled if
    // occurring during a test session (see above), instead of being delayed until the tests
    // are done. Note that an unlucky click on the IDE buttons _just in between_ two tests
    // might cause a mess in the tests results (of just cause weird display in the terminal:
    // the IDE could be run, then the test, and unless it doesn't clear the scope or the IDE
    // did install something, the test should run fine...), because the Lock is then available.
    await waitForPyodideReady()

    this.terminal.clear()
    const startTime = Date.now()
    this.testing    = true
    this.stopTests  = false

    start ??= 0
    end ??= this.test_cases.length

    /* Running everything in order: it's actually a bit faster (probably because not queueing again
       and again while waiting in getIdeData...?). So don't bother with Promise.all anymore...  */
    let errOrNull = null
    try{
      for(let i=start;i<end;i++){
        if(this.stopTests) break

        const conf    = this.test_cases[i]
        const skipped = conf.doSkip && !forceRun || conf.hasSubCases
        if(skipped){
          continue
        }

        this.conf = conf
        LOGGER_CONFIG.ACTIVATE && jsLogger('[Testing] - start', conf.ide_name)

        const hasCmd      = conf.term_cmd !== undefined
        const runningKind = conf.auto_run ? (hasCmd ? RunningProfile.PROPS.testingCmd : RunningProfile.PROPS.testingRun)
                          : hasCmd        ? RunningProfile.PROPS.testingCmd
                          : conf.run_play ? RunningProfile.PROPS.testingPlay
                          : conf.run_corr ? RunningProfile.PROPS.testingCorr
                                          : RunningProfile.PROPS.testingValid

        await this.runners[ runningKind ]()
        LOGGER_CONFIG.ACTIVATE && jsLogger('[Testing] - done', conf.ide_name, '\n')
      }
    }catch(e){
      errOrNull = e
    }finally{
      this._endTests(startTime, errOrNull)
    }
  }


  _endTests(start, error=null){
    this.testing   = false
    this.stopTests = false
    this.conf      = null
    const txt      = !error ? CONFIG.lang.testsDone.msg : txtFormat.error(String(error))
    const elapsed  = ((Date.now() - start) / 1000).toFixed(1)
    this.terminal.echo(txt)
    this.terminal.echo(txtFormat.info(`(Elapsed time: ${ elapsed }s)`))
  }



  buildCodeGetter(){
    const cbk = this.conf.code ? ()=>this.userContent : ()=>this.corrContent
    if(this.conf.run_play){
      return ()=>this._joinCodeAndPublicSections(cbk())
    }
    return cbk
  }


  async setupRuntimeTests(){
    if(!this.testing) return;
    const data = await this.getIdeData(this.conf)
    this.swapConfAndData(data, this.buildCodeGetter())
    this._applyConfAndData()
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



  async teardownRuntimeTests(runtime){
    if(!this.testing) return;

    this.conf.attempts_end = this.attemptsLeft  // Store before swap
    const failedTestMsg    = this._analyzeTestOutcome(runtime)

    const iClass   = 2 * !failedTestMsg + this.conf.doFail
    const newState = TEST_OUTCOME[iClass]
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




  // ------------------------------------------------------------




  // Override
  revealSolutionAndRems(){
    if(!this.conf) return;
    this.conf.reveal_corr_rems = true
    this.hiddenDivContent = false      // Mimic actual behavior, logic-wise
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
    }
    return this._formatErrMsgArray(runtime, msg)
  }


  _formatErrMsgArray(runtime, msg){
    msg = `Test failed for ${this.conf.ide_link} :

${ runtime.stdErr || "No error raised, but..." }

${ msg.join('\n') }`
    return msg
  }



  /**Setup the pyodide environment so that requests to relative urls are automatically redirected
   * to the correct (original) locations, and setup various sinks to avoids DOM interactions to
   * fail, typically when trying to update img tags through `PyodidePlot` or `mermaid_figure`.
   * */
  setupFetchers(){

    CONFIG.relUrlRedirect = `${ CONFIG.baseUrl }/${ this.conf.rel_dir_url }/`.replace(/[/]{2}/g, '/')

    pyodide.runPython(`

def __hack_pyfetch():
    import re, js
    from functools import wraps
    import pyodide.http as http

    pure_pyfetch = http.pyfetch
    pure_import  = __import__


    @wraps(pure_pyfetch)
    async def pyfetch(url, *a, **kw):
        if isinstance(url,str) and not re.match(r'(https?|ftps?|file)://|www[.]', url):
            url = js.config().relUrlRedirect + url
        #print(url)
        return await pure_pyfetch(url, *a, **kw)
    http.pyfetch = pyfetch


    async def fake_fetch(url, *a):
        if isinstance(url,str) and not re.match(r'(https?|ftps?|file)://|www[.]', url):
            url = js.config().relUrlRedirect + url
        #print(url)
        return await js.fetch(url, *a)


    class JsMock(int):
        """ Extends int so that computations when pyplot tries to update the DOM do not
            crash (even if wrong)
        """

        # ASYNC_CALLS = set('uploaderAsync'.split())

        def __getattr__(self, k):
            if k=='fetch':  return fake_fetch

            # if k in self.ASYNC_CALLS:  return self.async_sink_js

            if self is sink_js or k in ('document',):
                return sink_js
            return getattr(js,k)

        async def async_sink_js(self, *a,**kw):
            return sink_js

        def __call__(self, *a, **kw):
            return sink_js

        def __setattr__(self, k,v):
            setattr(js, k, v)

    fake_js = JsMock(1)
    sink_js = JsMock(1)  # HAS to be another instance than fake_js!

    def fake_import(name, *a, **kw):
        if name == 'js':
            return fake_js
        return pure_import(name, *a, **kw)
    __builtins__.__import__ = fake_import


    def teardown_tests():
        http.pyfetch = pure_pyfetch
        __builtins__.__import__ = pure_import
    __builtins__.teardown_tests = teardown_tests


__hack_pyfetch()
del __hack_pyfetch`)
  }


  teardownFetchers(){
    CONFIG.relUrlRedirect = ''
    pyodide.runPython("teardown_tests()")
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
}


CONFIG.CLASSES_POOL.IdeTester = IdeTester
