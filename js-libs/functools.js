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


let _mathJaxReady = false

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

/**Isolated version, to make sure it doesn't clash with the original one from
 * mathjax-libs.js.
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




export function getTheme(){
    // automatically load current palette
    const palette = __md_get("__palette")
    let curPalette = palette === null ? CONFIG.ACE_COLOR_THEME.customThemeDefaultKey
        : palette.color["scheme"]

    const style = CONFIG.ACE_COLOR_THEME.customTheme[curPalette]
    return "ace/theme/" + CONFIG.ACE_COLOR_THEME.aceStyle[style];
}



export function getIdeOptions(ide={}){
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
     *
     * @name: Logging purpose only
     *
     * @asyncCallback: async function or method to wrap with the Lock. The calls are:
     *      - Passing in the current `@this` context.
     *      - And ofc the arguments (any number)
     * */
    return function withPyodideAsyncLock(name, asyncCallback){
        const logName = asyncCallback.name || name

        const wrapper = async function(...args){
            await waitForPyodideReady()

            LOGGER_CONFIG.ACTIVATE && jsLogger("[LOCK?] -", logName, pyodideLocked)
            while(pyodideLocked){
                await sleep(60)
            }
            pyodideLocked = true
            LOGGER_CONFIG.ACTIVATE && jsLogger("[LOCK ACQUIRE] -", logName)
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





// NOTE: Don't convert the `setTimeout+recursive` logic inside subscribeWhenReady to a setInterval
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
    // Separated `if`, to gain 1 async cycle:
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






/**To access CONFIG data from pyodide (mermaid, cutFeedback, ...).
 * */
export function config(){ return CONFIG }


/**Function telling if the user is currently in light or dark mode. (Assumes the palette
 * buttons is still in the UI).
 * */
export function isDark(){
    return !$('label[for=__palette_0]').attr('hidden')
}



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






/**Square brackets in "rich text format" must be escaped, otherwise they are messing up the
 * terminal formatting informations.
 * */
export const escapeSquareBrackets=msg=>{
    return msg.replace(CONFIG.ESCAPE_SQ_B, m=>SqBs[m])
}

export const unEscapeSquaredBrackets=msg=>{
    return msg.replace(CONFIG.UNESCAPE_SQ_B, m=>SqBs[m]||m)     // Why ||m ??
}

export function toSnake(msg){
    return msg.replace(/[A-Z]/g, m=>'_'+m.toLowerCase())
}

/**Ensure the given python code can safely be inserted into a JS template.
 * */
export function escapePyodideCodeForJsTemplates(code){
    return code.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}


/**Extract full information when something gets VERY wrong... */
export function youAreInTroubles(err, isError=false){
    if(isError) err = String(err).trimEnd()
    return `${ err }\n\n${ err.stack || '[no stack]' }\n${ CONFIG.MSG.bigFail }`
}


/**Takes a string and cut the "middle chunk" of them if it is considered too long (length > 1750),
 * shortening it in the following way:
 *   - keep the 500 first and 300 last chars
 *   - replace the middle with a message
 * */
export function textShortener(text){
    if(CONFIG.cutFeedback && text.length > CONFIG.feedbackShortener.limit){
        const head = text.slice(0,CONFIG.feedbackShortener.head)
        const tail = text.slice(-CONFIG.feedbackShortener.tail)
        text = `${ head }\n...\n${ CONFIG.feedbackShortener.msg }\n...\n${ tail }`
    }
    return text
}



/**Formatting function factory, for messages used in the jquery terminal.
 *
 * WARNING: the input message will be "escapeSquareBrackets"-ed.
 * */
const _richTextFormat = (content, style, color="", background="")=>{
    content = escapeSquareBrackets(content)
    return `[[${ style };${ color };${ background }]${ content }]`;
}

export const txtFormat = {
    error:   (content) => _richTextFormat(content, "b", "red"),
    warning: (content) => _richTextFormat(content, "ib", "orange"),
    info:    (content) => _richTextFormat(content, "i", "grey"),
    italic:  (content) => _richTextFormat(content, "i"),
    stress:  (content) => _richTextFormat(content, "b"),
    success: (content) => _richTextFormat(content, "ib", "green"),
    none:    escapeSquareBrackets,  // To override the defaults, if needed (see process_and_gui.js)
}











/**NO_HTML and ALPHA (TOME_BASE in the python source) constants automatically transferred
 * from python during dev_ops/mkdocs_hooks operations.
 *
 * ****************************
 * * !!! DO NOT EDIT HERE !!! *
 * ****************************
 * */
const NO_HTML = '\'"&#><\n\t\r\\'
const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%()*+,-./:;=?@^_`{|}~ "
const TOME_B = [...ALPHA].reduce((o,c,i)=>(o[c]=i,o), {})


const unBase =s=> [...s].reduce((v,c)=>v*ALPHA.length + TOME_B[c], 0)


/**@txt: CONFIG.LZW separated lines, with:
 *      1. A dot + dots separated unicode codePoints
 *      2. regular alpha
 *      3. compressed data, size 2
 *      4. ..., size 3,
 *      5. ...
 *
 * The compressed text always has one leading and one trailing dot:
 *      1. they allow to trim safely the encoded content, without any risk to trim spaces from
 *         the encoding alphabet.
 *      2. The leading dot allows to disambiguate the "big" section content of the alphabet,
 *         when no emojis are used in the original content.
 * */
export const decompressLZW=(compressed, compressOptionSrc)=>{

    // console.log(JSON.stringify(compressed))

    const [bigs, smalls, ...chunks] = compressed.trim().slice(0,-1).split(CONFIG.LZW)
    const tome = [
        [...NO_HTML],
        bigs=='.' ? [] : bigs.slice(1)
                             .split('.')
                             .map(n=>String.fromCodePoint(+n)),
        [...smalls],
    ].flat()

    let txt=[], size=1, out=[]
    chunks.forEach(chunk=>{
        size++
        if(chunk.length%size){
            throw new Error(
                `Wrong chunk during decompression: size=${size}, length=${chunk.length}.\n` +
                `You can deactivate the compression by using setting the pyodide_macros plugin ` +
                `option ${ compressOptionSrc } to false, until the theme gets fixed.`
            )
        }
        for(let i=0 ; i<chunk.length ; i+=size){
            txt.push(unBase(chunk.slice(i,i+size)))
        }
    })
    txt.forEach((iBase,i)=>{
        const s = tome[iBase]
        const fresh = s + (tome[txt[i+1]] || s)[0]
        out.push(s)
        tome.push(fresh)
    })
    return out.join('')
}


/**Decompress PAGE_IDES_CONFIG content if not already done.
 * */
export function decompressPagesIfNeeded(){
    if(typeof(PAGE_IDES_CONFIG)!='string') return;

    LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - decompress page LZW')
    globalThis.PAGE_IDES_CONFIG = decompressAndConvert(PAGE_IDES_CONFIG)
}


/**Decompress LZW encoded string to a JSON object.
 * */
export function decompressAndConvert(compressed){
    const decompressed = decompressLZW(compressed, "build.encrypted_js_data")
    const outcome      = JSON.parse(
        decompressed, (key,val)=>key=='attempts_left' && val=="Infinity" ? Infinity : val
    )
    return outcome
}













/**Build bare divs from the given strings.
 * @returns: - A jQuery <div> object if only one argument.
 *           - An array of jQuery <div> objects if several arguments.
 * */
export const jDiv=(...elements)=>{
    const out = elements.map( s => $(`<div>${ s }</div>`) )
    return elements.length==1 ? out[0] : out
}



const defaultOptions=(options, prop)=>({

    // Outer html element:
    tagClass: "vertical",
    tagId: prop,
    fontSize: "",
    extraStyles: "",    // For the outer element/tag, as "width:min-content;..."

    // If a label is used:
    label: prop,
    labelFirst: true,
    noLabel: false,

    // If an input element is used:
    inputId: prop+'-input',     // to link the label to the input/element
    inputClass: "",

    tipText: "",
    shift: 50,          // %
    tipWidth: 0,        // em ; 0 => auto
    tipClass: '',       // top bottom left right (default: bottom)

    autoCbk: true,     // If true, automatic event routine added
    disabled: undefined,

    ...options
})


export const buildTipSpan=(options)=>{
    if(!options.tipText) return ""

    const tipClass = ['tooltiptext', options.tipClass || 'bottom'].join(' ')
    const tipWidth = (options.tipWidth??0) > 0 ? options.tipWidth+'em' : 'max-content'
    const tipSpan  = `<span class="${ tipClass }" style="width:${ tipWidth }">${ options.tipText }</span>`
    return tipSpan
}

export const getTagStyle=(options)=>{
    const styles = []
    if(options.tipText)    styles.push(`--tool_shift:${ options.shift }%`)
    if(options.fontSize)   styles.push(`font-size:${ options.fontSize }em`)
    if(options.extraStyle) styles.push(options.extraStyle)
    return ` style="${ styles.join(';') }"`
}


/**Generic jQuery object generator. No event attached.
 * */
const stuffWithTooltip = (tag, options, content) =>{

    const classes = []
    if(tag=='button')    classes.push("header-btn")
    if(options.tagClass) classes.push(options.tagClass)
    if(options.tipText)  classes.push("tooltip")

    const tagClass = !classes.length  ? '':`class="${ classes.join(' ') }"`
    const tagId    = !options.tagId   ? '':`id="${ options.tagId }"`
    const tagStyle = getTagStyle(options)
    const tipSpan  = buildTipSpan(options)
    const label    = `<label for="${ options.inputId }" style="align-self:center">${ options.label }</label>`

    const buttonType = ' type="button"'.repeat(tag=='button')
    return $([
        `<${tag} ${ tagId }${ tagClass }${ tagStyle }${ buttonType }>`,
            tipSpan,
            options.noLabel || !options.labelFirst ? '':label,
            content,
            options.noLabel || options.labelFirst  ? '':label,
        `</${tag}>`
    ].join(''))
}



/**Create a button with tooltip, just like the python _html_builder one (no event attached).
 * */
export function buttonWithTooltip(options, content){
    options = defaultOptions(options)
    options.noLabel = true
    return stuffWithTooltip('button', options, content)
}



/**Create a jQuery button WITHOUT bound event, holding the svg of one of the IDE's buttons.
 * No event attached.
 * */
export const makeIdeJqButton = (kind, options) => {
    const img = `<img src="${ CONFIG.buttonIconsDirectory }/icons8-${ kind }-64.png" />`
    return buttonWithTooltip(options, img)
}




/**Generic "change" event factory.
 *
 * @obj: object to mutate
 * @prop: property of the object to update
 * @inputProp; property name of the context object from which to extract the _already updated_ value.
 * */
export const valueAssigner=(obj, prop, inputProp='value')=>function(){
    obj[prop] = this[inputProp]
    // console.log(JSON.stringify(obj[prop]))
}


/**Create a textarea object automatically updating the @obj[@prop] value.
 * */
export function buildJqTextArea(obj, prop, options={}){
    options = defaultOptions(options, prop)
    const kls     = `class="full-width ${ options.inputClass||"" }"`
    const content = obj[prop]??""
    const nLines  = content.split('\n').length
    const html    = stuffWithTooltip(
        options.tag ?? 'div', options,
       `<textarea id="${ options.inputId }"  ${kls} placeholder="${ options.placeholder??"" }">${ content }</textarea>`,
    )

    const txtArea = html.find('textarea')
    txtArea.css('overflow-y','auto')
    txtArea.attr('rows', nLines)
    if(options.resize) txtArea.css('resize', options.resize)
    if(options.autoCbk) txtArea.on('change', valueAssigner(obj, prop))

    return html
}



/**Create a checkbox object automatically updating the @obj[@prop] value.
 * */
export function buildJqCheckBox(obj, prop, options={}){
    options.tagClass    = ("horizontal "+(options.tagClass??"")).trim()
    options.extraStyles = "grid-template-columns: max-content max-content;grid-gap:5px;"
    options.labelFirst ??= false
    options = defaultOptions(options, prop)
    const kls = options.inputClass ? `class="${ options.inputClass }"`:""
    const html = stuffWithTooltip(
        'div', options,
        `<input type="checkbox" id="${ options.inputId }" ${kls} ${ obj[prop]?'checked':'' }>`,
    )
    if(options.autoCbk) html.on('click', 'input', valueAssigner(obj, prop, 'checked'))
    return html
}



/**Create an input[number]
 * */
export function buildJqNumber(obj, prop, options={}){
    options.tagClass    = ("horizontal "+(options.tagClass??"")).trim()
    options.extraStyles = "grid-template-columns: max-content max-content;grid-gap:5px;"
    options.labelFirst ??= false
    options = defaultOptions(options, prop)
    const kls = options.inputClass ? `class="${ options.inputClass }"`:""
    const html = stuffWithTooltip(
        'div', options,
        `<input type="number" id="${ options.inputId }" ${kls} ${ obj[prop]?'checked':'' }>`,
    )
    if(options.autoCbk) html.on('change', 'input', valueAssigner(obj, prop))
    return html
}



/**Create an input text object automatically updating the @obj[@prop] value.
 * */
export function buildJqText(obj, prop, options={}){
    options = defaultOptions(options, prop)
    const kls  = options.inputClass ? `class="${ options.inputClass }"`:""
    const html = stuffWithTooltip(
        'div', options,
        `<input type="text" id="${ options.inputId }" ${kls} value="${ obj[prop]??"" }" placeholder="${ options.placeholder??"" }">`
    )
    if(options.autoCbk) html.on('change', 'input', valueAssigner(obj, prop))
    return html
}



/**Create a select object automatically updating the @obj[@prop] value.
 * At creation time, the current value of @obj[@prop] is automatically selected.
 *
 * @valuesArr: array of strings, for all the possible choices (in desired order).
 *             Keep in mind if there are other types ni there, they will be converted
 *             automatically to strings at DOM level...
 * */
export function buildJqSelect(obj, prop, valuesArr, options={}){
    options = defaultOptions(options, prop)

    const kls    = options.inputClass ? `class="${ options.inputClass }"`:""
    const select = `<select id="${ options.inputId }" ${kls}>`+valuesArr.map( v=>
        `<option value="${ v }"${ v!==obj[prop] ? '' : ' selected="selected"' }>${ v }</option>`
    ).join('')+"</select>"

    const html = stuffWithTooltip('div', options, select)
    if(options.autoCbk)  html.on('change', 'select', valueAssigner(obj, prop))
    return html
}





export const cancelEvent=(e)=>{
    if(!e) return;
    if(e.originalEvent) e=e.originalEvent
    if(e.stopPropagation) e.stopPropagation()
    if(e.preventDefault)  e.preventDefault()
}



export function buildJqHistoryBtn(
    jHolder,        // jQuery element holding the contextmenu
    historyId,      // Id if the "contextmenu" element
    historyArr,     // [data]
    itemSetupCbk,   // Additional things to do with each jQuery/html item in this history, at creation time
                    // (jBtn, data) => void
){

    const appendHistory=()=>{
        if(!historyArr.length || $('#'+historyId).length) return;

        // Use button instead of div, so that focusout and co' are actually working...
        const jHist = $(
            `<button id="${ historyId }" class="history-box"></button>`
        )

        jHist.append(
            historyArr.map(data=>{
                const btn = $(`<button class="history-btn">${ itemSetupCbk?"":data }</button>`)
                if(itemSetupCbk) itemSetupCbk(btn, data)
                return btn
            })
        )

        // Forbid going full screen and close if not needed anymore.
        jHist.on('keydown', function(e){
            cancelEvent(e)
            if(e.key=='Escape') jHist.off().remove()
        })

        // Remove the window if left or clicking somewhere else:
        jHist.on('focusout mouseleave', function(e){ jHist.off().remove() })

        // Once entered, clicking on a button would close the window if the focusout event is
        // still defined, so remove it:
        jHist.on('mouseenter', function(e){ jHist.off('focusout') })

        // Make sure events are not transferred to upper level, (whatever they are)
        jHist.on('click keyup', function(e){ cancelEvent(e) })  // wrapper so that jQ.off() works

        jHist.appendTo(jHolder)     // Mount...
        jHist.trigger('focus')      // Force focus to activate focusout, in case the user never enters the panel.
    }

    return jHolder.on('contextmenu', function(e){
        cancelEvent(e)
        appendHistory()
    })
}











// ATTEMPT. Not finished -> archived just in case...
// export function fileContentToDom(content, mime, readerMethod, domQuery, domTemplate, templateRepl="{}", domAppend=false){
//     const elt = $(domQuery)
//     if(!domAppend) elt.html("")

//     const reader = new FileReader()
//     reader.abort = function(e){
//       console.log('ERROR!')
//     }
//     reader.onload = function(e){
//       const data = e.target.result
//       const html = domTemplate.replace(templateRepl, data)
//       elt.append(html)
//     }

//     const blob = new Blob([content], {type: mime})
//     reader[readerMethod](blob)
//   }






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

    ;(_=>{
        // Defined in an isolated scope, to avoid the mistaken use of stuff defined here...
        jInput = $(`<input id="${ inputId }" name="file-uploader" type="file">`)
        $(document.head).append(jInput)

        jInput.on("cancel", resumeHandler)
        jInput[0].addEventListener(         // Doesn't wanna work through jQuery...
            "change",
            function(changeEvent){
                let iFile=1
                for(const file of changeEvent.target.files){

                    const reader  = new FileReader();
                    const isLast  = changeEvent.target.files.length==iFile++

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
            },
            false
        )
    })()


    /**The showPicker method will raise an error, so possible to warn the user about what to do.
     * But it's not compatible with all browsers, so keep the orignal click logic anyway...
     * (but users wont' get any info about what's going wrong, in that case)
     * */
    const triggerInputFile=_=>{
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
 * So, JS has to throw a special error that will mimic ("enough"...) the pattern of pyodide errors
 * and hance, will be considered legit errors.
 */
export class PythonError extends Error {
    toString() { return "Python" + super.toString() }
}


/**Note: the behavior of this in pyodide is a bit weird: because defined as a const, it is not
 * visible in pyodide from a terminal because it stays "hidden" even after assigning it to
 * getStorage/setStorage...
 * */
export const noStorage = function () {
    throw new PythonError(
        `Cannot read localStorage: no data available (looks like executions are stopped already).`
    )
}





/**Forbid writing these properties from pyodide.
 * */
export const PMT_LOCAL_STORAGE_KEYS_WRITE = Object.freeze(`
    code
    done
    hash
    name
`.trim().split(/\s+/))



/**Extract the given ID data from the localStorage, checking if it's not an outdated
 * or invalid structure.
 * @returns: [storage_data, upToDate]
 *
 * WARNING:
 *  1) Redactors might store extra fields in the LocalStorage, so DO NOT cleanup the thing...
 *  2) This function is used in CodEx.
 * */
export function getIdeDataFromStorage(editorId, ide=null){

    // Originally, the storage value was just the user's code, so keep extracting as this:
    let codeOrStorageAsStr = localStorage.getItem(editorId) || ""

    let obj  = {}
    let code = codeOrStorageAsStr
    try{
      obj = JSON.parse(codeOrStorageAsStr || "{}")
      code = obj.code ?? ""
    }catch(_){}

    const upToDate = PMT_LOCAL_STORAGE_KEYS_WRITE.every(k=> k in obj)
    const storage  = upToDate ? obj : freshStore(code, obj, ide)

    return [storage, upToDate]
}



/**Build a default IDE storage object, taking care of the logic involved in various PMT versions.
 *
 * WARNING: Redactors might store extra fields in the LocalStorage, so DO NOT cleanup the thing...
 * */
export function freshStore(code, storage={}, ide=null){

    storage.code = code || ""
    storage.done ??= 0              // -1: fail, 0: unknown, 1:success
    if(ide) ide.updateGenericStorageData(storage)
    return storage
}










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

  /**Mirroring PROFILE property names (giving autocompletion hints) */
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








// For backward compatibility (hooks and co'):
globalThis.PythonError        = PythonError
globalThis.CONFIG             = CONFIG
globalThis.sleep              = sleep
globalThis.subscribeWhenReady = subscribeWhenReady
LOGGER_CONFIG.ACTIVATE && console.log("async subscriber updated")

// Access from pyodide + IdeZipManager logistic + backward compatibility:
globalThis.getStorage    = noStorage
globalThis.setStorage    = noStorage
globalThis.delStorage    = noStorage
globalThis.keysStorage   = noStorage
globalThis.config        = config
globalThis.isDark        = isDark
globalThis.downloader    = downloader
globalThis.uploader      = uploader
globalThis.uploaderAsync = uploaderAsync
// globalThis.fileContentToDom = fileContentToDom
