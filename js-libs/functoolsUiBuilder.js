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



/**Build bare divs from the given strings.
 * @returns: - A jQuery <div> object if only one argument.
 *           - An array of jQuery <div> objects if several arguments.
 * */
export const jDiv = (...elements) =>{
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
    tipBare: false,     // If true, use the "bare tooltips" mechanism

    autoCbk: true,      // If true, automatic event routine added
    disabled: undefined,

    ...options
})


export const buildTipSpan=(options)=>{
    if(!options.tipText || options.bareTip) return ""

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

    const label    = `<label for="${ options.inputId }" style="align-self:center">${ options.label }</label>`
    const tagClass = !classes.length  ? '':`class="${ classes.join(' ') }"`
    const tagId    = !options.tagId   ? '':`id="${ options.tagId }"`
    const tagStyle = getTagStyle(options)
    const tipSpan  = buildTipSpan(options)
    const tagDataTip = !options.bareTip || !options.tipText ? '' : ` data-tip-txt="${ options.tipText }"`+(
        !options.tipWidth ? '' : `data-tip-width="${ options.tipWidth }"`
    )

    const buttonType = ' type="button"'.repeat(tag=='button')
    return $([
        `<${tag} ${ tagId }${ tagClass }${ tagStyle }${ buttonType }${ tagDataTip }>`,
            tipSpan,
            options.noLabel || !options.labelFirst ? '':label,
            content,
            options.noLabel || options.labelFirst  ? '':label,
        `</${tag}>`
    ].join(''))
}



/**Create a button with tooltip, just like the python _html_builder one (no event attached).
 * */
export function buttonWithTooltip(options, content){    // CodCap
    options = defaultOptions(options)
    options.noLabel = true
    return stuffWithTooltip('button', options, content)
}



/**Create a jQuery button WITHOUT bound event, holding the svg of one of the IDE's buttons.
 * No event attached.
 * */
export const makeIdeJqButton = (kind, options) => {     // CodCap
    const img = `<img src="${ CONFIG.buttonIconsDirectory }/icons8-${ kind }-64.png" />`
    return buttonWithTooltip(options, img)
}




/**Generic "change" event factory.
 *
 * @obj: object to mutate
 * @prop: property of the object to update
 * @inputProp; property name of the context object from which to extract the _already updated_ value.
 * */
const valueAssigner=(obj, prop, inputProp='value')=>function(){
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



export function buildJqHistoryBtn(                                  // CodCap
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