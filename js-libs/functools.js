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




/*
-------------------------------------
 Various async synchronization tools
-------------------------------------
*/





/**Create a global async Lock logistic, so that functions/methods involving pyodide will
 * not be able to run concurrently. The Lock value is a simple boolean flag, since the app
 * is single threaded, and its value is protected be defining it within a scope where the
 * "locking" function is also defined (behaves like a python/TS decorator. Kinda... :p ).
 * */
export const withPyodideAsyncLock = (_=>{

  /**Everything is run async but single threaded, so a global lock can be added, using a simple
   * boolean flag, declared inside a closure to avoid a user messing with the variable...
   * */
  let pyodideLocked = false


  /**Function factory ("decorator like"), managing the global pyodide lock.
   * If a call is done while pyodide is locked, it is delayed until the lock is available.
   * Also allow to force some PyodideRunners to wait for the end of the RUNNERS_MANAGER.autoRuns
   * executions, to ensure executions order are always predictable (aka, AUTO_RUN always first).
   *
   * @name: Logging purpose only
   *
   * @asyncCallback: async function or method to wrap with the Lock. The calls are:
   *      - Passing in the current `@this` context.
   *      - And ofc the arguments (any number)
   *
   * @runnerManager=null: if given, this is the RUNNERS_MANAGER instance. See @runner argument.
   *
   * @runner=null: if @runnerManager is given, this is the runner opbject currently "asking for
   * permission" to run. The RUNNERS_MANAGER qill auhorize the execution or not, depending on
   * AUTO_RUNs being completed or not (and if AUTO_RUNs are going on, authorize the current
   * runner).
   * */
  return function withPyodideAsyncLock(
      name,
      asyncCallback,
      runnerManager = null,
      runner = null,
  ){
    const logName = asyncCallback.name || name
    const logData = runner && " - Executing:\n"+(runner.data.prefill_term || runner.data.env_content) || ""

    const wrapper = async function(...args){
      await waitForPyodideReady()

      LOGGER_CONFIG.ACTIVATE && jsLogger("[LOCK?] -", logName, "is waiting:", pyodideLocked)
      while(pyodideLocked || runnerManager && runnerManager.waitForAutoRunFinished(runner)){
        await sleep(60)
        LOGGER_CONFIG.ACTIVATE && jsLogger("[LOCK?] -", logName, "is waiting:", pyodideLocked)
      }
      pyodideLocked = true
      LOGGER_CONFIG.ACTIVATE && jsLogger("[LOCK ACQUIRE] -", logName, logData)
      let ret;
      try{
        ret = await asyncCallback.apply(this, args)
      }catch(e){
        console.error(e)
            // Always keep that to be warned when something goes wrong, otherwise
            // errors in JS are just swallowed (impossible to rethrow them, because
            // of the async context).
      }finally{
        LOGGER_CONFIG.ACTIVATE && jsLogger("[LOCK RELEASE] -", logName)
        pyodideLocked = false
      }
      return ret
    }
    return wrapper
  }
})()




/**Allow to delay the executions of various functions, until the pyodide environment
 * is ready.
 *
 * NOTES:
 *    1. DO NOT use this with subscribeWhenReady, which is expecting a sync callback.
 *    2. WARNING: this tool does NOT hold the async Lock logistic, so use it only in
 *       methods or functions that will themselves call other functions or methods
 *       that are actually locked (otherwise, deadlock!).
 * */
export const waitForPyodideReady = async()=>{

  const maxWaitingTime = 20  // in seconds
  const attempts = 80
  const step_ms = Math.round(1000 * maxWaitingTime / attempts)

  LOGGER_CONFIG.ACTIVATE && jsLogger(`[Wait4Pyodide] with ${ step_ms } ms in between attempts`)
  let counter = 0
  while(!CONFIG.pyodideIsReady){
    await sleep(step_ms);
    counter++
    LOGGER_CONFIG.ACTIVATE && jsLogger("[Wait4Pyodide] -", counter,'/',attempts, "attempts")
    if(counter == attempts){
      throw new Error(`Couldn't access to pyodide environment in time (${maxWaitingTime}s)`)
    }
  }
}




// NOTE: DO NOT convert the `setTimeout+recursive` logic inside subscribeWhenReady to a setInterval
//       thing: it causes troubles when reloading pages (I'm not sure why...)

/**Auto-subscription routine to document changes.
 * If the subscription is not possible yet (readyForSubscription[waitOn] is falsy), try again
 * @delay later until it works.
 *
 * @subscriptionId : Property to observe in readyForSubscription global object.Also used as
 *                   subscription identifier.
 * @callback: Routine to run when the document isReady/conditions are fulfilled.
 * @options : An object with optional fields:
 *      .delay (=50):
 *          Time interval (in ms) to wait in between two subscription attempts.
 *      .now (=false):
 *          If true, ignore the CONFIG.subscriptionReady property and subscribe at call time.
 *          If false, a callback will be returned by the `subscribeWhenReady` function, that
 *          the caller can use to signal when the subscription is ready.
 *      .waitFor (=null):
 *          If given, it must be a boolean provider or a jquery identifier string, which will
 *          result in a function checking for the existence of that element in the DOM.
 *          This function will be called every .delay ms and the subscription will be delayed
 *          until it returns true. This has precedence over the .now option.
 *      .runOnly (=false):
 *          If truthy, run the callback when ready, but do not subscribe to document changes.
 *      .maxTries (=20):
 *          Maximal number of subscription attempts before throwing an error.
 *      .ignoreMultipleSubscriptions (=false):
 *          If false, subscribing several times to the same event throws an error. If true,
 *          just ignore the current subscription call.
 *
 * @throws:
 *      - Error if maxTries subscriptions attempts are done without success.
 *      - Error if the same witId is registered several times and options.ignoreMultipleSubscriptions
 *        is false.
 * */
export function subscribeWhenReady(subscriptionId, callback, options={}){
  LOGGER_CONFIG.ACTIVATE && jsLogger('[Subscribing] - Enter', subscriptionId)


  let {now, delay, waitFor, runOnly, maxTries, ignoreMultipleSubscriptions} = {
      delay: 50,
      now: false,
      waitFor: null,  // or string or boolean provider
      runOnly: false,
      maxTries: 20,
      ignoreMultipleSubscriptions: false, // If true, do not raise if a registration has already been done and skip the current call.
      ...options
  }

  if(subscriptionId in CONFIG.subscriptionReady){
      if(ignoreMultipleSubscriptions){
          return
      }
      throw new Error(`Cannot subscribe several times to "${ subscriptionId }".`)
  }

  now = now && !waitFor                   // Has to wait if waitFor is used (... XD )
  CONFIG.subscriptionReady[subscriptionId] = now

  const waitForProp = typeof (waitFor)=='string'
  const checkReady  = !waitFor    ? ()=>null
                    : waitForProp ? ()=>{ CONFIG.subscriptionReady[subscriptionId] = $(waitFor).length > 0 }
                                  : ()=>{ CONFIG.subscriptionReady[subscriptionId] = waitFor() }

  const isNotReady =()=>{
      checkReady()
      return !( CONFIG.subscriptionReady[subscriptionId] && globalThis.document$ )
  }

  function autoSubscribe(){

    LOGGER_CONFIG.ACTIVATE && jsLogger(
      '[Subscribing] - Attempt', subscriptionId,'Tries:', CONFIG.subscriptionsTries[subscriptionId]
    )
    if(isNotReady()){
      const nTries = CONFIG.subscriptionsTries[subscriptionId]+1 || 1
      if(nTries > maxTries){
          throw new Error(`Impossible to subscribe to ${ subscriptionId } in time: too many tries.`)
      }
      CONFIG.subscriptionsTries[subscriptionId] = nTries
      setTimeout(autoSubscribe, delay)

    }else{
      const wrapper=function(){
        try{
          LOGGER_CONFIG.ACTIVATE && jsLogger(
            '[Subscribing] - Running', subscriptionId, 'runOnly', runOnly,'Tries:', CONFIG.subscriptionsTries[subscriptionId]
          )
          callback()
          CONFIG.subscriptionDone[subscriptionId] = true
        }catch(e){
          console.error(e)
        }
      }
      if(runOnly){
        wrapper()
      }else{
        const subscript = document$.subscribe(wrapper)
        document.addEventListener(CONFIG.onDoneEvent, function(){
          LOGGER_CONFIG.ACTIVATE && jsLogger('[Unsubscribing] -', subscriptionId)
          subscript.unsubscribe()
        })
      }
    }
  }
  autoSubscribe()

  if(!now){
    return ()=>{ CONFIG.subscriptionReady[subscriptionId]=true }
  }
}





/**Flag to allow only one call to waitForClassesPoolReady.
 * */
let classesPoolSubscriptionDone = false


/**Routine to call unconditionally from overlord.js. It is used to make sure all the classes
 * required in the page are actually defined before trying to define the related instances
 * from the DOM content (this has become useful once the JS layer has been moved to JS
 * modules, which are async loaded).
 *
 * Passing in a callback also provides a way for a user customizing the theme to inject their
 * own logic/custom classes in CONFIG.CLASSES_POOL by overriding the call in overlord.js.
 * This way:
 *   - Their callback is called only after all the original classes have been defined.
 *   - The subscriptions are delayed until their callback returns a truthy value.
 *
 * @throws: Error if `applyWhenPoolReady` is given and it returns `undefined`
 *          (to prevent infinite loop).
 * */
export function waitForClassesPoolReady(applyWhenPoolReady=null){

  if(classesPoolSubscriptionDone){
    throw new Error("Cannot call several times waitForClassesPoolReady")
  }
  classesPoolSubscriptionDone = true

  const waitFor=()=>{
    // As long as class names remain in CONFIG.overlordClasses, those are not yet registered:
    if(CONFIG.overlordClasses.length){
      CONFIG.overlordClasses = CONFIG.overlordClasses.filter(
        className => !CONFIG.CLASSES_POOL[className]
      )
    }
    // Separated `if`, to gain 1 async cycle... ( xp )
    if(!CONFIG.overlordClasses.length){
      CONFIG.overlordIsReady = !applyWhenPoolReady || applyWhenPoolReady()
      if(CONFIG.overlordIsReady === undefined){
        throw new Error(
          "`applyWhenPoolReady()` returned undefined: it has to return something."
        )
      }
    }
    return Boolean(CONFIG.overlordIsReady)
  }

  const maxTries = 600    // 600 * 50 ms = 30s
  subscribeWhenReady('Overlord', ()=>null, {waitFor, maxTries, runOnly: true})
}












/*
------------------------------------------------------------------------------
 Various helpers, defined as `function` so that they are visible from Pyodide
------------------------------------------------------------------------------
*/










/**Randomly pick a value from an array.
 * @throws Error if the array is empty.
 * */
export function choice(arr){
  if(!arr.length){
    throw new Error("Cannot pick from an empty array")
  }
  const i = Math.random() * arr.length | 0
  return arr[i]
}


/**Async sleep (time given in milliseconds / must be awaited by the caller)
 * */
export function sleep(ms=0){
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/**To access the global CONFIG object from pyodide (mermaid, cutFeedback, ...).
 * */
export function config(){ return CONFIG }


/**Function telling if the user is currently in light or dark mode. (Assumes the palette
 * buttons is still in the UI).
 * */
export function isDark(){
  return !$('label[for=__palette_0]').attr('hidden')
}


/**Generic routine to call to trigger mermaid renders.
 * */
export function renderMermaidGraphs(removeCodeTags=true){
  if(removeCodeTags){
    $('pre.mermaid').each(function(){
      const code = $(this).children('code')
      if(code.length){
        code.replaceWith(code.text())
      }
    })
  }
  setTimeout(async ()=>{
    try{
      await mermaid.run()
    }catch(e){}
  })
}



let _mathJaxReady = false

/**Generic/common way to test if the whole Mathjax logistic is done loading or not.
 * */
export const checkMathJaxReady =()=> (_mathJaxReady = _mathJaxReady || Boolean(
  window.MathJax.startup
  && window.MathJax.startup.output
  && [
    window.MathJax.startup.output.clearCache,
    window.MathJax.typesetClear,
    window.MathJax.texReset,
    window.MathJax.typesetPromise,
  ].every( f => typeof(f)=='function' )
))


/**Isolated version (as in, unique name), to make sure it doesn't clash with the original one from
 * mathjax-libs.js (which is loaded synch, blabla...).
 * */
export function perennialMathJaxUpdate(){
  // Extra security so that any CDN loading failure doesn't cause crashes when
  // the function is used in IDEs.
  if(_mathJaxReady){
    window.MathJax.startup.output.clearCache()
    window.MathJax.typesetClear()
    window.MathJax.texReset()
    window.MathJax.typesetPromise()
  }
}




// ATTEMPT. Not finished -> archived just in case...
// export function fileContentToDom(content, mime, readerMethod, domQuery, domTemplate, templateRepl="{}", domAppend=false){
//   const elt = $(domQuery)
//   if(!domAppend) elt.html("")

//   const reader = new FileReader()
//   reader.abort = function(e){
//     console.log('ERROR!')
//   }
//   reader.onload = function(e){
//     const data = e.target.result
//     const html = domTemplate.replace(templateRepl, data)
//     elt.append(html)
//   }

//   const blob = new Blob([content], {type: mime})
//   reader[readerMethod](blob)
// }



/**Apply a "download" action, given the content, name and type of the file to download.
 * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
 * about MIME types.
 * */
export function downloader(content, filename, mimeType="text/plain") {
  const blob = new Blob([content], {type: mimeType})
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
  link.remove()
}



/**Routine reusing the very same input[type=file] element (hidden in <head>) to upload content.
 * It must receive a callback that will handle the action to do with the content of the uploaded
 * file.
 * Returns a curried event executor: (cbk)=>(event executor function)
 * */
export var [uploader, uploaderAsync] = (function(){

  // https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications#example_showing_thumbnails_of_user-selected_images

  let jInput         = null
  let readMethod     = null   // readAsText / readAsDataURL / readAsArrayBuffer / readAsBinaryString
  let contentHandler = null   // Replaced on the fly at runtime
  let errorHandler   = null   // first error thrown during the reading process

  const inputId      = 'pyodide-file-uploader'
  const resumeHandler=_=>{ contentHandler = null }

  const applyFilesUpload = (listOfFiles)=>{
    let nFile=1
    for(const file of listOfFiles){

      const reader  = new FileReader();
      const isLast  = listOfFiles.length == nFile++

      reader.onabort = function(event){
        resumeHandler()
        throw errorHandler
      }
      reader.onload = function(event){
        try{
          contentHandler(event.target.result, file.name, isLast)
        }catch(e){
          errorHandler ||= e
          reader.abort()
        }
        if(isLast) resumeHandler()      // to spot end of execution in async way
      }
      reader[readMethod](file)
    }
  }

  ;(_=>{
    // Defined in an isolated scope, to avoid the mistaken use of stuff defined here...
    jInput = $(`<input id="${ inputId }" name="file-uploader" type="file">`)
    $(document.head).append(jInput)

    jInput.on("cancel", resumeHandler)
    jInput[0].addEventListener(         // Doesn't wanna work through jQuery...
      "change",
      function(changeEvent){
        applyFilesUpload(changeEvent.target.files)
      },
      false
    )
  })()


  /**The showPicker method will raise an error, so possible to warn the user about what to do.
   * But it's not compatible with all browsers, so keep the orignal click logic anyway...
   * (but users wont' get any info about what's going wrong, in that case)
   * */
  const triggerInputFile=_=>{
    // NOTE: code managing window.seleniumUploads is inserted on the fly during mkdocs tests builds
    if(!jInput[0].showPicker){
      jInput[0].click()           // This is actually "async" (event!)
      return
    }
    try{
      jInput[0].showPicker()      // This is actually "async" (event!)
    }catch(e){
      // NOTE: Only the showPicker error should ever go there. Other errors aren't thrown
      //       in the same context...
      resumeHandler()     // Ensure release of the terminal, if async call
      if(!e.toString().includes('HTMLInputElement.showPicker')) throw e
      window.alert(CONFIG.lang.pickerFailure.msg)
    }
  }

  const uploader = (cbk, readAs='readAsText', multi=false)=>{
    contentHandler = cbk
    readMethod     = readAs
    jInput.prop('multiple', multi)
    triggerInputFile()
  }

  const uploaderAsync = async (...args)=>{
    errorHandler = null
    uploader(...args)
    // Wait until the upload is done, so that the uploaded content is usable during current run
    while(contentHandler){
      await sleep(200)
    }
    if(errorHandler){
      throw errorHandler  // propagate the error logic to the pyodide runtime environment
    }
  }

  return [uploader, uploaderAsync]
})()




/**Special JS Error: methods calls exclusions are tested from the JS runtime, instead of pyodide.
 * So, JS has to throw a special error that will mimic ("enough", aka starts with Python...) the
 * pattern of pyodide errors and will be considered legit errors from the JS runtime point of
 * view, instead of triggering a BigFail error message.
 * */
export class PythonError extends Error {
  toString() { return "Python" + super.toString() }
}




/**Class centralizing the various "running" configuration.
 * Each time some executions are triggered, an instance is created holding the global config
 * of the executions. This is helping to take some decisions at various points of the executions.
 */
export class RunningProfile {

  static PROFILE = Object.freeze({
    cmd:          'Command',
    btn:          'PyBtn',
    play:         'Play',
    validate:     'Validate',
    validateCorr: 'ValidateCorr',
    testing:      'Testing',
    testingPlay:  'TestingPlay',
    testingValid: 'TestingValidate',
    testingCorr:  'TestingValidateCorr',
    testingCmd:   'TestingCommand',
    testingRun:   'TestingRun',
    zipExport:    'zipExport',
    zipImport:    'zipImport',
  })

  /**Custom initialization of the runners objects for pyodide runners elements
   * (done this way to get autocompletion support when coding in js, without
   * breaking the current implementation logic).
   * */
  static buildDefaultRunnersObject(asProperties=false){
    const obj = {...RunningProfile.PROFILE}
    for(const k in obj) obj[k] = asProperties ? k : undefined
    obj.default = undefined
    return obj
  }

  /**Mirroring PROFILE property names (used for autocompletion hints) */
  static PROPS = RunningProfile.buildDefaultRunnersObject(true)

  static build(profile){
    return Object.freeze({
      name: profile,
      isTermCmd:  profile.includes(RunningProfile.PROFILE.cmd),
      isPlaying:  profile.includes(RunningProfile.PROFILE.play),
      isValidating: profile.includes(RunningProfile.PROFILE.validate),
      isTesting:  profile.includes(RunningProfile.PROFILE.testing),
    })
  }
}











/*
-----------------------------------------------------------------------------------------------
 "Reexport" globally/publicly some functions or classes, so that they are usable from anywhere
-----------------------------------------------------------------------------------------------
*/



// For backward compatibility (hooks and co'):
globalThis.PythonError        = PythonError
globalThis.CONFIG             = CONFIG
globalThis.sleep              = sleep
globalThis.subscribeWhenReady = subscribeWhenReady
LOGGER_CONFIG.ACTIVATE && console.log("async subscriber updated")

// Access from pyodide + IdeZipManager logistic + backward compatibility:
globalThis.config        = config
globalThis.isDark        = isDark
globalThis.downloader    = downloader
globalThis.uploader      = uploader
globalThis.uploaderAsync = uploaderAsync
// globalThis.fileContentToDom = fileContentToDom
