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
import { PythonError } from 'functools'
import { handlePmtTooltips } from "functoolsUi"
import { Avl } from "5-3-avl-ides_test"










const registerDataOnParent=(o, parent)=>(data)=>{
  const toUse = parent??o
  toUse.data = data
  toUse.srcAttemptsLeft = data.attempts_left
}

const buildCodeToDisplay=(conf)=>{

  const sections = [
    _toSection('env',       conf.data.env_content),
    _toSection('env_term',  conf.data.env_term_content),
    _toSection('code',      conf.data.user_content),
    _toSection('corr',      conf.data.corr_content),
    _toSection('tests',     conf.data.public_tests),
    _toSection('secrets',   conf.data.secret_tests),
    _toSection('post_term', conf.data.post_term_content),
    _toSection('post',      conf.data.post_content),
  ]
  // Extract the section used during the tests (based on the main conf object...):
  const iSection   = 2 + !conf.code
  const codeToTest = sections.splice(iSection, 1)[0]
  const others     = sections.join('').replace(/'''/g, "\\'\\'\\'").trim()
  const commented  = others && `\n\n\n'''\n${ others }\n\n'''\n`
  return codeToTest.trim() + commented
}

/**Build a sub section of the original python file.
 * */
const _toSection=(py_section, content)=>{
  return content && `\n\n# --- PMT:${ py_section } --- #\n${ content }`
}

const convertRegexpStringsToPatterns=(proxy)=>{
  ;['std_capture_regex', 'not_std_capture_regex'].forEach( prop=>{
    try{
      // Warning: subcases may hold an empty string that is cancelling the use of the parent
      // pattern. In that case, keep the empty string instead of a RegExp, to avoid applying
      // the regexp check of the parent on the child test:
      const pattern = proxy[prop]
      if(typeof(pattern)=='string'){
        proxy[prop] = pattern && new RegExp(pattern, 'si')
      }
    }catch(e){
      throw new PythonError(`Invalid Regex generation for ${ prop }, using ${ proxy[prop] }`)
    }
  })
}

const convertAssertionsToPredicates=(proxy)=>{
  // If assertions exist and are already an array, this means the current proxy is a subcase
  // and the parent has already been handled, so nothing to do:
  if(!proxy.assertions || Array.isArray(proxy.assertions)){
    return
  }
  proxy.assertions = proxy.assertions && proxy.assertions.split(' ').map(rule=>{
    const prop = _.camelCase( rule.replace(/^!/, '') )
    const revExpected = rule.startsWith('!')  // Reversing to enforce booleans everywhere
    return (obj) =>{
      if( obj[prop]===undefined ) return prop+' is undefined...'
      return!obj[prop] == revExpected ? "" : `${ prop }: should be ${ !revExpected }\n`
    }
  })
}


/**Convert the given Conf/Case object (recursive) to a proxy which will automatically
 * extract the value of the parent, if it is not defined on the current level.
 * Also store some other infos needed at runtime:
 *  - isIde
 *  - isRoot
 *  - loadedCode function (combine the sections to build the IDE contents)
 *  - parentProxy: ref to the proxy of the root IDE (undefined/Null on IDEs)
 *  - registerData (ref to the data object coming from the loaded page containing the IDEs to test)
 *  - state: track the test feedback. WARNING: this one behave quite differently depending on the
 *    object that is tracked:
 *        - Actual test store the current state of the svg box.
 *        - Root IDEs (aka, with subcases) hold instead a dict/Counter of states.
 *        - When `state` is set on a subcase, it automatically update appropriately the parent.
 *          (this is needed to know when to display or not the root IDE row, when changing filters
 *          or when a row appear or disappear during the tests, if some filters are activated).
 * */
export const storeConfWithProxy=(testCases, debug, conf, parent=undefined, iCase=null, parentProxy=null)=>{

  /**True if the current element is an IDE with subcases (hence, no svg for itself). */
  const isRoot = !parent && Boolean(conf.subcases.length)

  const proxy = new Proxy(conf, {
    get(o, prop){
      switch(prop){
        case "isIde":        return !parent
        case "isRoot":       return isRoot
        case 'loadedCode':   return buildCodeToDisplay(proxy)
        case 'registerData': return registerDataOnParent(o, parent)
        case 'parentProxy':  return parentProxy
        default:             return o[prop] ?? (parent && parent[prop])
      }
    },
    set(o, prop, val){
      // Automatically transmit state changes to the parent proxy when it exists:
      if(prop=='state' && parentProxy && val!=o.state){
        parent.state[o.state]--
        parent.state[val]++
      }
      return Reflect.set(o, prop, val)
    },
    has(o, prop){
      return (prop in o) || Boolean(parent) && (prop in parent)
    },
  })

  testCases.push(proxy)
  debug.push([conf, proxy])

  // Redefine some "complex" values for the current level, considering the parent's if needed:
  proxy.doFail = Boolean(proxy.fail || proxy.in_error_msg || proxy.not_in_error_msg)
  proxy.doSkip = Boolean(proxy.skip || proxy.human)

  // Initiate some states/values:
  proxy.reveal_corr_rems = false

  if(isRoot){
    proxy.state = {
      [QCM.checked]:0, [QCM.unchecked]:0, [QCM.correct]:0, [QCM.mustFail]:0, [QCM.failTest]:0, [QCM.passBad]:0,
    }
  }else{
    proxy.state = proxy.doSkip ? QCM.unchecked : QCM.checked
    // WARNING: the state of the parent (if exists) is handled automatically (see proxy set handler)
  }

  if('set_max_and_hide' in proxy){
    proxy.set_max_and_hide = proxy.set_max_and_hide==1000 ? Infinity : proxy.set_max_and_hide
  }

  // Apply the "no clear between subcases" default logic, not overriding existing (falsy)
  // or parent logic:
  if(iCase!==null && iCase>0){
    proxy.no_clear ??= true
  }

  convertRegexpStringsToPatterns(proxy)
  convertAssertionsToPredicates(proxy)
  return proxy
}

const QCM = CONFIG.qcm













/***Wrapper for an actual row in the DOM.
 * This is an abstraction to help building the virtualization, and allowing to keep track
 * of the DOM elements (detach, reattach later) and their states (proxy, test result, ...).
 * Most of the data are stored on the proxy object, to jeep the compatibility with the
 * IdeTester original implementation.
 * */
class RowProxy {

  /**Get the height of the entire row. If not defined compute it from the current state.
   * NOTE: if not cached, the underlying jQuery element HAS to be mounted somewhere in the
   * page, otherwise the data will go wrong...
   * */
  get height(){
    if(!this.isReady()){
      this._height = Math.max(...[...this._jRow].map( o=>$(o).height() ))
      this.lastBuilt = this.ideTester.LAST_H_RESET
    }
    return this._height
  }
  get iRow()   { return this.proxy.iRow }
  get parent() { return this.ideTester.virtuose.lines[ this.proxy.parentProxy.iRow ] }


  /**The proxy/conf object. */
  proxy = null

  /**The IdeTester instance */
  ideTester = null

  /**Flag to know if the row is currently "mounted" in the DOM. */
  inDom = false

  /**Date.now() value of the last time the height of the _jRow collection has been computed.
   * This allow to automatically recompute heights when needed (after an horizontal resize,
   * typically).
   * */
  lastBuilt = -1

  /**jQuery collection with all the cells for the current row.
   * WARNING: NEVER ACCESS THIS DIRECTLY. Use mount/detached, so that the inDom flag is up to date.
   * */
  _jRow = null

  /**Internal/private value. Use the getter instead. */
  _height = 0

  /**Defined for IDEs rows only. True if the text filtering predicate returned True.
   * (updated when filtering virtuose.lines, hence the parent is always handled first).
   * */
  _hasText = false


  constructor(proxy, ideTester){
    this.proxy = proxy
    this.ideTester = ideTester
  }


  /**If the jquery row collection has not been built already, create it, putting in place
   * the related events listeners.
   * */
  build(){
    if(this._jRow) return;

    this._jRow = $(this.proxy.html)
    this._bindLoadButton()
    this._bindPlayButton()
    this._bindCheckbox()
    handlePmtTooltips(this._jRow)
  }

  _bindLoadButton(){
    this._jRow.find("[btn_kind=load_ide]").on('click', async ()=>{
      await this.ideTester._loadButtonBinding(this.proxy)
    })
  }

  _bindPlayButton(){
    this._jRow.find("[btn_kind=test_1_ide]").on('click', async ()=>{
      await this.ideTester.runAllTests(this)
    })
  }

  _bindCheckbox(){
    this.proxy.jSvg = this._jRow.find("svg.qcm")
    this.ideTester.setSvgAndCounters(this.proxy, this.proxy.state, false)
    this.proxy.jSvg.on('click', ()=>{ this.ideTester.setSvgAndCounters(this.proxy) })
  }


  /**Tell if the cached height is up to date or not.
   * */
  isReady(){
    return this.lastBuilt === this.ideTester.LAST_H_RESET
  }

  /**Check if the current row is visible according to the current filters in the UI (dynamic).
   * */
  isVisible(){
    if(this.proxy.isRoot){
      return this.ideTester.getRootVisibility(this.proxy)
    }
    return Boolean(this.ideTester.visibilities[this.proxy.state])
  }

  /**Check if the parent contains the desired text, or the current element if it's not a subcase.
   * Reminder:
   *    - the text of all the subcases is held on the parent.
   *    - this method is called ONLY if the predicate exists.
   * */
  hasText(predicate){
    if(!this.proxy.isIde){
      return this.parent._hasText   // the parent already registered the result
    }
    return this._hasText = predicate(this.proxy.text)
  }

  /**Build the related jQuery row collection before returning it. Se the `inDom` flag on the way,
   * putting in place the security to not `detach` later a collection that is currently mounter
   * in the visible part of the DOM (defensive programming).
   * */
  mount(toDom=true){
    this.build()
    if(toDom) this.inDom=true
    return this._jRow
  }

  /**Track the inDom value, but DO NOT detach _jRow from here: this will be/has been done from
   * outside, handling all elements at once, to avoid multiple `detach`.
   * */
  detached(){
    this.inDom = false
  }
}





/**Helper managing various requests on the Avl, to compute "precise geometry" to build the view.
 * */
class OkComputer {

  /**Array of `top` values of each row in teh result table, for the elements that could be
   * currently visible in the DOM. This array has one extra value (0 at the start), meaning
   * the very last value is the actual length of the filler element.
   * */
  tops = [0]

  /**Allow quick access to the filler full height, once computed.
   * */
  get fullH(){
    return this.tops[ this.tops.length-1 ]
  }


  /**Compute the top values of each row (possibly keeping the current values up to `recomputeFrom`,
   * to gain a bit of time...).
   * */
  freezeHeights(rows, recomputeFrom=0){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[Virtualizer]", "Compute all heights, from startAt =", recomputeFrom)
    this.tops = recomputeFrom ? this.tops.slice(0,recomputeFrom+1) : [0]  // +1 because leading 0 in this.tops
    let H = this.tops[this.tops.length-1]
    for(const r of rows.iterSlice(recomputeFrom, rows.nTree)){
      this.tops.push( H += r.height )
    }
  }

  /**Find the indices of the rows surrounding appropriately the give scrollTop position, and
   * return them as well as the `top` value of the results table element in the filler one.
   * The returned values are;   [top, iStart, iEnd]   (iEnd exclusive)
   * */
  requestMountData(scrollTop, viewH){
    const iFirst   = this._findHeightIndex(scrollTop - 0.5 * viewH)
    const iLast    = this._findHeightIndex(scrollTop + 1.5 * viewH)
    const topFirst = this.tops[iFirst]
    return [topFirst, iFirst, iLast + 1]    // +1 because iLast is inclusive (bisect left)
  }

  /**Returns the index of the elements whose the top is the closest to the given scrollTop value.
   * (bisection search).
   * */
  _findHeightIndex(scroll){
    const size = this.tops.length-1  // The last one does not exist as index, and h is exclusive!
    let l=0, h=size
    while(l+1 < h){
      const m = (l+h) >>> 1
      const v = this.tops[m]
      if(v<scroll)      l = m
      else if(scroll<v) h = m
      else              return m
    }
    return l
  }
}












/**Create and manage a hidden div mimicking the test results table, way out of the viewport,
 * to compute in advance rendered heights of the rows, while the user is doing something else.
 * Done using `setInterval`, handling one row every XXms.
 * */
class Playground {

  /**Time to wait before beginning to gather the height values (the method called on resize
   * is debounced so that the user finishes the resize operation, hence the computation only
   * start when that"s actually useful).
   * */
  DEBOUNCE_BUILD_DELAY = 400

  /**Amount of ms between two heights computations on unknown rows (setInterval)
   * */
  GATHERING_INTERVAL = 5

  /**Virtualizer instance. */
  virtuose = null

  /**setInterval reference. */
  _intervaler = null

  /**Generator iterating over all the existing RowProxies. */
  _linesIterator = null

  /**jQuery object of the hidden element in which rows are mounted */
  _hiddenArea = null

  /**Allow to pause the interval mechanism (see this.resolveHeightsWithPriority(...)) */
  _wait = false

  /**Debounced version of _gatherHeightsSilently, to circumvent troubles on resize operations:
   * start computing only once the user finished moving the mouse (hopefully...)
   * */
  _gatherHeightsSilentlyDebounced = null


  constructor(virtuose){
    this.virtuose = virtuose
    this._gatherAllDebounced = _.debounce(()=>{
        // Do nothing if one is already going on:
        if(this._intervaler!==null) return;

        LOGGER_CONFIG.ACTIVATE && jsLogger("[Virtualizer]", "Start exploring heights...")
        this._intervaler = setInterval(
          this._gatherAtIntervals.bind(this),
          this.GATHERING_INTERVAL,
        )
      },
      this.DEBOUNCE_BUILD_DELAY
    )

    this._hiddenArea = this.virtuose.testsResults.clone().attr('id', 'tests-playground').css({
      height: "fit-content",
      left: '4500px', top: '-300px',
      // left: '500px', top: '300px', background:"red",        // Uncomment to make it visible in the page
      display: 'float', position: 'absolute',
    })
    this._hiddenArea.children().remove()
    this._hiddenArea.appendTo($('#py_mk_test_global_wrapper').parent())
    this.restart()
  }


  /**Takes precedence on the interval thing to compute the height of the given row right now.
   * The interval resumes working just after.
   * */
  resolveHeightsWithPriority(rowOrRows){
    if(!Array.isArray(rowOrRows)){
      rowOrRows = [rowOrRows]
    }
    rowOrRows = rowOrRows.filter(r=>!r.isReady())
    if(!rowOrRows.length) return;

    this._wait = true
    try{
      for(const row of rowOrRows) this._computeHeight(row)
    }finally{
      this._wait = false
    }
  }

  restart(){
    this.stop()
    this._hiddenArea.css({width: this.virtuose.testsResults.css('width')})
    this.virtuose.commented = null
    this._linesIterator = this.virtuose.lines.values()
    this._gatherAllDebounced()
  }

  /**Get rid of the current interval, once all computations are done.
   * */
  stop(){
    if(this._intervaler!==null){
      clearInterval(this._intervaler)
      this._intervaler = null    // do last
      LOGGER_CONFIG.ACTIVATE && jsLogger("[Virtualizer]", "Stopped exploring heights.")
    }
  }


  //---------------------------------------------------------------------------------------------


  /**Compute the height for the next needed row, if ready for i or skip the current interval.
   * */
  _gatherAtIntervals(){
    const notReady = this._wait || this._hiddenArea.children().is('*')
    if(notReady) return;

    // Find the next RowProxy object whose the height is not known yet (if any):
    let row
    while( (row=this._linesIterator.next().value) && row.isReady());

    // If some left, gather data:
    if(row){
      this._computeHeight(row)

    // Otherwise, signal the computations are done:
    }else{
      this.stop()
      this.virtuose.switchToPreciseComputations()
    }
  }

  /**Mount a row in the hidden playground grid, gather its height, then remove it.
   * */
  _computeHeight(row){
    if(row.inDom){
      row.height    // Just compute the height if the element is in the user's view

    }else{
      this._hiddenArea.append(row.mount(false))
      row.height
      const oops = row.inDom
      row._jRow.detach()
      if(oops){
        throw new Error(
          "DANGER: a Row has been detached while it was marked as visible in the user's view."
        )
      }
    }
  }
}









/**DOM virtualization of the tests results, to avoid any performances troubles.
 * */
export class VirtualizedDomManager {

  /**Archive the date of the last heights computations. This allows to recompute RowProxies heights
   * automatically even if the object got detached/invisible in the meantime.
   * */
  LAST_H_RESET = Date.now()

  /**Some average height for a line in the result table (derived from CodEx, with fontsize=16px) */
  AVG_HEIGHT = 42.2

  /**Time delta (ms) in between two `scroll()` method handling. */
  THROTTLE_DELAY = 40

  // -------------------------------------------------------------------------------------------

  /**All existing RowProxies, in original order. */
  lines = []

  /** All currently "displayable" RowProxies, with the current filters. */
  mayBeInDom = new Avl()

  /** RowProxies currently available in the DOM.  */
  mounted = []

  /**OkComputer object to come. Defined only once the heights are known for every RowProxy. */
  computed = null

  txtPredicate = null


  constructor(ideTester){
    this.ideTester    = ideTester
    this.table        = $('#py_mk_tests_results_view')     // The apparent view/windowed element (the one with scrollTop changing)
    this.tableHeight  = $('#py_mk_tests_view_height_tracker')
    this.filler       = $('#py_mk_tests_results_filler')   // The inner element, faking the complete height
    this.testsResults = $('#py_mk_tests_results_mounted')  // The partial grid filling the table visually
  }

  get scrollTop()   { return this.table.scrollTop()    }
  set scrollTop(top){ return this.table.scrollTop(top) }

  get viewHeight()  { return this.tableHeight.height() }


  /**Create the RowProxy matching the given proxy object, and store it.
   * NOTE: all RowProxies have to be registered before `this.initiateTestsResults()` is called.
   * */
  register(proxy){
    const row = new RowProxy(proxy, this.ideTester)
    this.lines.push(row)
  }

  /**Finalization of the instance, after all RowProxies have been registered + first build
   * of the view+internal data. NEVER CALL OTHERWISE!
   * */
  initiateTestsResults(){
    this.playground = new Playground(this)
    this.table.on('scroll', _.throttle(this._scroll.bind(this), this.THROTTLE_DELAY))
    this.table.on('keydown', this._keyDown.bind(this))
    this._defineHorizontalResizer()
    this.changeDrawables(this.lines)   // Will double the call to setFillerHeight after initView, but...
    this.initView()
  }

  /**Restart the whole view process/logic after an action invalidated the heights of the rows,
   * or at page load time.
   * */
  initView(){
    this.setFillerHeight(this.mayBeInDom)
    this.LAST_H_RESET = Date.now()            // Invalidate all RowProxy heights
    this.playground.restart()                 // Start recomputing everything
    this.updateView()                         // Request a drawing of the current view
  }

  /**Logic to apply after the user changed some filters in the UI.
   * If @initView is false, the caller has to handle this.computed.tops, whose the values
   * might become entirely wrong if this.mayBeInDow is updated.
   * */
  filterChange(fresh=null){
    fresh ??= this.lines.filter(
      row => row.isVisible() && ( !this.txtPredicate || this.txtPredicate(row.proxy.text) )
    )
    const isSame = this.mayBeInDom.isIdenticalToArray(fresh)
    if(!isSame){
      LOGGER_CONFIG.ACTIVATE && jsLogger(
        "[Virtualizer]", 'Changing mayBeInDom:', this.mayBeInDom.nTree, "->", fresh.length, "elements"
      )
      this.changeDrawables(fresh)
      this.updateView(0)
    }
  }


  // -------------------------------------------------------------------------------------------


  /**Check if all the potentially visible Rows are currently mounted in the view.
   * */
  allMounted(){
    return this.mounted.length === this.mayBeInDom.nTree
  }


  /**Pass the Avl as argument, as a reminder for the fact that it HAS to be up to date, when
   * computing the approximate full height.
   * */
  setFillerHeight(avl){
    const fullH = this.computed ? this.computed.fullH : avl.nTree * this.AVG_HEIGHT
    this.filler.height(fullH)
  }


  /**Centralize the actions to apply when the potentially visible elements change:
   * - Replace the current Avl with a fresh one built from the given array (the current Avl
   * is kept if @rowsAsArray is null or undefined).
   * - Recompute all the `top` values of the rows, in order. If @recomputeFrom is given,
   * rebuild only the values after this index (gain a bit of time on Avl insertions/removals).
   * - Update the current height of the filler, making sure the scroll behavior stays consistent.
   * */
  changeDrawables(rowsAsArray, recomputeFrom=0){
    if(rowsAsArray){
      this.mayBeInDom = Avl.fromSortedArray(rowsAsArray)
    }
    if(this.computed){
      this.computed.freezeHeights(this.mayBeInDom, recomputeFrom)
    }
    this.setFillerHeight(this.mayBeInDom)
  }


  /**When the Playground finished gathering every single height, put in place the OkComputer
   * instance and fix the height of the giller element to the exact value.
   * */
  switchToPreciseComputations(){
    this.computed = new OkComputer()
    this.computed.freezeHeights(this.mayBeInDom)
    this.filler.height(this.computed.fullH)
    LOGGER_CONFIG.ACTIVATE && jsLogger(
      "[Virtualizer]", 'Switched to precise view, with fullH =', this.computed.fullH
    )
  }


  /**Unmount the rows currently in the view, applying the needed logic on each of them, and
   * mount the updated array of rows to show to the user.
   * */
  replaceMountedWith(toBeMountedAsArray){
    this.testsResults.children().detach()
    for(const row of this.mounted){
      row.detached()    // Enforce contract
    }
    this.mounted = toBeMountedAsArray
    this.testsResults.append(this.mounted.map(r=>r.mount()))
  }


  /**Remove or add the row at the given index (as in this.lines!), when its state change
   * implies a visibility change. If the row is a subcase, the parent os automatically
   * handled on the way when necessary.
   * The elements are added or removed from the Avl, then the heights/tops are recomputed
   * (see OkComputer).
   * */
  rowVisibilityChange(iRow, change, parentChange){
    let recomputeFrom
    const row    = this.lines[iRow]
    const parent = row.proxy.parentProxy
    const adding = change > 0
    const rows   = !parentChange ? [row] : [this.lines[ parent.iRow ], row]

    // Make sure the heights of the required elements are known upfront:
    this.playground.resolveHeightsWithPriority(rows)

    // Compute the position in the avl BEFORE, if removal...
    if(!adding) recomputeFrom = this.mayBeInDom.getLinearIndex(rows[0])

    const action = adding ? 'insert':'remove'
    for(const row of rows){
      this.mayBeInDom[action](row)
    }

    // ...or AFTER if insertion:
    if(adding) recomputeFrom = this.mayBeInDom.getLinearIndex(rows[0])
    this.changeDrawables(null, recomputeFrom)
    this.updateView()
  }


  // -------------------------------------------------------------------------------------------


  /**Request a frame update for the current view, choosing the appropriate strategy.
   * Always update the internal scrollTop position on each call, so that the value used once
   * the request is resolved, it can use the "proper" scroll position currently stored.
   * */
  updateView(forceScrollTop){
    if(forceScrollTop!==undefined){
      this.scrollTop = forceScrollTop
    }

    // If a frame update has already been requested and not resolved yet, nothing to do:
    if(this._rafId) return;

    // Otherwise, trigger a frame update request...
    this._rafId = requestAnimationFrame( ()=>{
      const scroll = this.scrollTop
      const viewH  = this.viewHeight
      try{
        if(this.computed && this.mayBeInDom.nTree > 100){
          this.updateViewPrecise(scroll, viewH)
        }else{
          this.updateViewApproxOrFull(scroll, viewH)
        }
      }finally{
        this._rafId = null
      }
    })
  }


  /**Compute the exact view to present to the user, with the exact rows computations.
   * */
  updateViewPrecise(scrollTop, viewH){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[Virtualizer]", "Precise view")
    const [hFill, iUp, iDown] = this.computed.requestMountData(scrollTop, viewH)
    this.replaceMountedWith(this.mayBeInDom.slice(iUp, iDown))
    this.testsResults.css('top', hFill+'px')
    this.filler.height(this.computed.fullH)
    this.table.scrollTop(scrollTop)
  }


  /**Compute an approximative view to present to the user, while waiting for the exact heights
   * to be all known. This relies on assumptions, and may cause some visual glitches in some
   * unexpected situations, or when the view if fixed once the heights are actually known.
   *
   * If there are not that many rows, compute the exact layout with all the rows instead.
   * */
  updateViewApproxOrFull(scrollTop, view){
    const fillerH = this.filler.height()
    const fakeH = fillerH - view
    const fractionTop = scrollTop / fakeH
    const fakePos =  fractionTop * this.mayBeInDom.nTree
    const fakeIdx = fakePos | 0
    const remains = fakePos - fakeIdx

    this.playground._wait = true
    try{
      if(this.mayBeInDom.nTree <= 100){
        return this.buildFullView(fractionTop)
      }
      LOGGER_CONFIG.ACTIVATE && jsLogger("[Virtualizer]", "Approximate view")

      const sumH=(i,j) => (
        i===undefined && j===undefined
            ? heights.reduce((a,b)=>a+b, 0)
            : heights.slice(i??0, j??heights.length).reduce((a,b)=>a+b, 0)
      )

      // Estimate the number of rows to display and their positions:
      const halfNeeded = view / (this.AVG_HEIGHT * 2) | 0
      const end     = Math.min(fakeIdx + 3*halfNeeded, this.mayBeInDom.nTree)
      const isAtEnd = end == this.mayBeInDom.nTree
      const start   = Math.max(0, isAtEnd ? end-4*halfNeeded : fakeIdx-halfNeeded)

      this.replaceMountedWith(this.mayBeInDom.slice(start, end))

      const heights = this.mounted.map(r=>r.height)
      const hFill = isAtEnd ? fillerH - sumH()
                            : start && scrollTop - sumH(0,halfNeeded) - remains * heights[halfNeeded]
      this.testsResults.css('top', hFill+'px')

    }finally{
      this.playground._wait = false
    }
  }


  /**Compute a 'simplified" view with all the rows in it, if there aren't that many.
   * This avoids the intermediate steps with approximations and present the true final/correct
   * state directly to the user.
   * NOTE: the `scroll` extra logic will also be deactivated, gaining in performances.
   * */
  buildFullView(fractionTop){
    LOGGER_CONFIG.ACTIVATE && jsLogger("[Virtualizer]", "Full mounting...")
    this.replaceMountedWith([...this.mayBeInDom])
    this.testsResults.css('top', 0)
    const fullH = this.mounted.reduce( (h,r)=>h+r.height, 0)
    this.filler.height(fullH)
    this.scrollTop = fullH * fractionTop
    this.table.scrollTop(this.scrollTop)
    // `this.scrollTop` updated for "consistency" only, because any scroll handling will be
    // skipped anyway (everything is mounted already...).
  }


  // -------------------------------------------------------------------------------------------


  /**Define a resize observer that will reset/restart all the heights computations.
   * The callback is throttled, so that:
   *    - The view update is triggered often enough, but not too often.
   *    - The heights computations will be called regularly during the resize operation.
   *      This  operation is debounced, so it will stay delayed until the user finishes
   *      to resize the window.
   * */
  _defineHorizontalResizer(){
    const target = $('#py_mk_tests_right_column')
    let previousWidth = target.width()

    new ResizeObserver(
      _.throttle(()=>{
        const width = target.width()
        if(previousWidth != width){
          this.initView()
        }
        previousWidth = width
      },
      this.THROTTLE_DELAY, {leading:false}),
    ).observe(target[0])
  }


  /**Modifications to apply (if needed) after the scrollTop value got updated (debounced).
   * */
  _scroll(){
    // No extra scrolling logic needed: the DOM already handles everything.
    if(!this.allMounted()) this.updateView()
  }


  /**Fix the Home/End keys behavior (otherwise, it doesn't go "full way"...)
   * */
  _keyDown(e){
    let position
    switch(e.key){
      case 'End':   position = this.filler.height(); break
      case 'Home':  position = 0; break
      default:      return undefined
    }
    // this.scrollTop = position    // NO! -> The scroll event must be triggered to update the view!
    this.table.scrollTop(position)
    return false
  }
}
