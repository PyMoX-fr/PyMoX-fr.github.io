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


import {
    decompressLZW,
    makeIdeJqButton,
    perennialMathJaxUpdate,
    renderMermaidGraphs,
} from 'functools'






const shuffleDomInPlace=(shufflable)=>{

    const parent = $($(shufflable.shuffleParentPath)[0])
    const items  = [...parent.find(shufflable.shuffleChildrenPath).detach()]

    const shuffledItems = _.shuffle(items)
    shuffledItems.forEach(item=>parent.append(item))
}

const removeEmptyParagraphsFrom = rule => $(rule).filter(':empty').remove()




class QCM {

    static buildQcms(){

        const questions        = ".py_mk_questions_list_qcm > li.py_mk_question_qcm "
        const questionItems    = "ul.py_mk_item_qcm > li.py_mk_item_qcm"

        // Clean up empty <p>, that are messing the layout, BUT, beware that the md rendered
        // qcm description, or the questions descriptions ALSO will contain some, and those
        // shouldn't be removed, to not interact with the user's md rendering choices.
        removeEmptyParagraphsFrom('.py_mk_questions_list_qcm > p')
        removeEmptyParagraphsFrom('ul.py_mk_item_qcm p')

        $('.py_mk_questions_list_qcm').prev('p:empty').remove()
            // Get rid of the last empty <p> before questions, if any (left over of </p KEEP>)

        $(CONFIG.element.qcm_admos).each(function(){

            const qcmThis        = $(this)
            const classes        =  qcmThis.attr('class').split(' ')
            const shuffle        =  qcmThis.hasClass('qcm_shuffle')
            const no_admo        =  qcmThis.hasClass('qcm_no_admo')
            const reveal_results = !qcmThis.hasClass('qcm_hidden')
            const multi_behavior =  qcmThis.hasClass('qcm_single') + 2 * qcmThis.hasClass('qcm_multi')
            const qcmId          =  classes.find(kls=>kls.startsWith("py_mk_qcm_id"))

            const qcmObj = new CONFIG.CLASSES_POOL.Qcm(qcmId, shuffle, reveal_results)
            const owner  = qcmObj.createInnerLayoutButtonsAndCounter(no_admo)

            let iQuest=-1
            owner.find(questions)
                .each(function(){
                iQuest++; let iItem=0;

                const jQuest           = $(this)
                const q_multi_behavior = 2*jQuest.hasClass('qcm_multi') + jQuest.hasClass('qcm_single')
                const q_shuffled       = jQuest.hasClass('qcm_shuffle')
                const answers          = jQuest.attr('correct') || ""
                jQuest.removeAttr('correct')

                if(!answers){
                    console.warn(
                        "[Pyodide-Mkdocs - QCM]\nCorrect answer(s) unknown for this question:"
                    + `\n\t"${ jQuest.text() }"`
                    )
                }
                const ansArr = answers.split(",").map(Number)
                const isMulti = ansArr.length>1 || (
                    q_multi_behavior ? q_multi_behavior&2 : multi_behavior&2
                )
                if(ansArr.length==1 && !q_multi_behavior && !multi_behavior){
                    console.warn(
                        "[Pyodide-Mkdocs - QCM]\nA qcm question has only one correct answer, but the "
                    + `multi/single choice aspect is unknown.\nQuestion: ${ jQuest.text() }`
                    )
                }

                const question = new CONFIG.CLASSES_POOL.Question(jQuest, qcmId, iQuest, ansArr, isMulti, q_shuffled)
                $(this).find(questionItems).each(function(){
                    question.registerItem($(this), iItem++)
                })
                qcmObj.addQuestion(question)        // Done last, to be sure everything is up to date
            })

            qcmObj.randomize()
        })
    }

    //------------------------------------------------------------------------

    constructor(id, shuffle, reveal){
        this.qcmClass     = id      // this class is actually used only once, so equivalent to an id
        this.shuffle      = shuffle
        this.reveal       = reveal
        this.questions    = []      // Question[]
        this.locked       = false

        this.counterPath  = `.${ id } p${ CONFIG.element.qcmCounterCls }`
        this.shuffleParentPath = `.${ id } .py_mk_questions_list_qcm`
        this.shuffleChildrenPath = "> li.py_mk_question_qcm"
    }

    //------------------------------------------------------------------------

    addQuestion(question){
        this.questions.push(question)
        question._inject(this)
    }


    /**Reset all questions, and reshuffle the QCM is this.shuffle is true.
     * */
    restart(){
        this.locked = false
        this.questions.forEach(q=>q.resetAllItems(true))
        this.updateCounter()
        this.randomize()
    }

    /**Check the current answers of the user, revealing the correct answers or not.
     * */
    check(){
        if(this.reveal){
            this.questions.forEach(quest=>quest._reveal())
            perennialMathJaxUpdate()
            renderMermaidGraphs()
        }
        const [good,all] = this.questions.reduce( (track,quest)=>quest._validate(...track), [0,0])
        this.updateCounter(`${good}/${all}`)
        this.locked = true
    }

    updateCounter(content=""){
        $(this.counterPath).text(content)
    }


    /**Shuffle the questions and their items, if this.shuffle is true
     * */
    randomize(){
        if(this.shuffle){
            shuffleDomInPlace(this)
        }
        this.questions.forEach(quest=>{
            if(quest.shuffle) shuffleDomInPlace(quest)
        })
    }


    createInnerLayoutButtonsAndCounter(no_admo){

        const divAdmo    = $('.'+this.qcmClass)
        const innerDiv   = $(`<div class="inner"></div>`)
        const classes    = divAdmo.attr('class').replace('admonition ','').split()
        innerDiv.addClass(classes)

        const btnWrapper = $(`<div class="${ CONFIG.element.qcmWrapper.slice(1) } ${ this.reveal?'give-away':'hidden' }"></div>`)
        const counter    = $(`<p class="${ CONFIG.element.qcmCounterCls.slice(1) }"></p>`)
        const mask       = $(createSvgMask(95, 1.1, CONFIG.lang.qcmMaskTip.msg, CONFIG.lang.qcmMaskTip.em))
        const checkBtn   = makeIdeJqButton('check',   {shift:95, tipWidth: CONFIG.lang.qcmCheckTip.em, tipText: CONFIG.lang.qcmCheckTip.msg})
        const restartBtn = makeIdeJqButton('restart', {shift:95, tipWidth: CONFIG.lang.qcmRedoTip.em,  tipText: CONFIG.lang.qcmRedoTip.msg })
        btnWrapper.append(counter, mask, checkBtn, restartBtn)

        checkBtn.on('click', this.check.bind(this))
        restartBtn.on('click', this.restart.bind(this))

        // Detach all "non admonition" elements (aka, skip the summary/title element):
        const children   = [...divAdmo.children()]
        const no_title   = children.slice(1)
        const detached   = no_title.map(child => $(child).detach() )
        innerDiv.append(...detached)

        const layoutWrapper = $(`<div class="layout-qcm-wrapper"></div>`)
        layoutWrapper.append(innerDiv, btnWrapper)

        if(no_admo){
            divAdmo.replaceWith(layoutWrapper)
            return layoutWrapper
        }else{
            divAdmo.append(layoutWrapper)
            return divAdmo
        }
    }
}



const createSvgMask=(shift,fontSize, tipText, tipWidth) => `
<div class="tooltip mask-svg" style="--tool_shift:${ shift }%; font-size:${ fontSize }em;">
<span class="tooltiptext bottom" style="width:${ tipWidth }em;">${ tipText }</span>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
viewBox="0 130 512 250" xml:space="preserve">
<path style="fill:var(--md-primary-fg-color)" d="M508.692,167.211c-14.625,0.984-64.391,5.859-128.781,5.859c-90.734,0-96.594,32.188-123.922,32.188 c-31.203,0-29.25-32.188-123.906-32.188c-64.391,0-114.156-4.875-128.781-5.859c-10.531-0.703,3.906,103.406,46.828,142.438 c32.5,29.547,111.234,54.656,172.703,13.656c23.422-18.516,33.156-18.516,33.156-18.516s9.781,0,33.188,18.516 c61.453,41,140.203,15.891,172.688-13.656C504.786,270.617,519.239,166.508,508.692,167.211z M202.442,255.305 c-45.656,50.922-120.297,15.797-121.172-35.141C165.552,207.008,205.755,251.602,202.442,255.305z M309.552,255.305 c-3.313-3.703,36.875-48.297,121.172-35.141C429.849,271.102,355.224,306.227,309.552,255.305z"></path>
</svg></div>`








class Question {

    constructor(jQuest, baseLiId, iQ, answers, isMulti, q_shuffled){
        this.jThis = jQuest
        this.questId = baseLiId+'-'+iQ
        jQuest.attr('id', this.questId)         // Add the id to the Question <li> tag on the fly
        jQuest.attr('added-id', "on-the-fly")   // Add a warning... (to not search for it in python code...)

        this.answers = answers
        this.isMulti = isMulti
        this.shuffle = q_shuffled
        this.qcm     = null
        this.byId    = {}       /* itemId: { checked:boolean, correct:boolean } */

        this.shuffleParentPath=`#${ this.questId }>ul.py_mk_item_qcm`
        this.shuffleChildrenPath = ">li.py_mk_item_qcm"

        this.comment = this.jThis.find(".py_mk_comment_qcm")
        if(this.comment.length){
            this.comment.detach()
        }else{
            this.comment = null
        }
        if(this.comment && this.comment.is('.py_mk_encrypted_qcm')){
            const summary = this.comment.find('summary').detach()
            const txt = this.comment.text().trim()
            const unCompressed = decompressLZW(txt, "qcms.encrypt_comments")
            this.comment.html(unCompressed).prepend(summary)
        }
    }

    _clickFactory(itemId){
        return _=>{
            if(this.qcm.locked) return;
            const checked = !this.byId[itemId].checked
            if(!this.isMulti) this.resetAllItems()
            this.updateItem(itemId, checked)
        }
    }

    _validate(goods, all){
        const values = Object.values(this.byId)

        /*
        // Count per item:
        goods += values.reduce( (s,o)=>s+(o.checked === o.correct), 0)
        all += values.length

        /*/
        // Count per question:
        goods += values.every( o => o.checked === o.correct )
        all++
        //*/

        return [goods, all]
    }

    _reveal(){
        if(this.comment){
            this.jThis.append(this.comment)
        }
        Object.entries(this.byId).forEach(([itemId,it])=>{
            const classes = []
            if(it.checked) classes.push(it.correct ? CONFIG.qcm.ok : CONFIG.qcm.wrong)
            else if(it.correct) classes.push(CONFIG.qcm.missed)

            if(classes.length){
                this._setLabelClasses(itemId, ...classes)
            }
        })
    }

    _inject(qcm){ this.qcm = qcm }

    _getLabelClasses(itemId, ...classes){
        classes.push(this.isMulti ? CONFIG.qcm.multi : CONFIG.qcm.single)
        return `${ itemId } ${ classes.join(' ') }`
    }

    _setLabelClasses(itemId, ...classes){
        const kls = this._getLabelClasses(itemId, ...classes)
        $(`label.${ itemId }`).attr('class', kls)
    }


    resetAllItems(always=false){
        if(this.comment) this.comment.detach()
        Object.entries(this.byId).forEach(([itemId,it])=>{
            if(always || it.checked) this.updateItem(itemId, false)
        })
    }

    updateItem(itemId, checked){
        this.byId[itemId].checked = checked
        this._setLabelClasses(itemId, checked ? CONFIG.qcm.checked : CONFIG.qcm.unchecked)
        $(`input.${ itemId }`).attr('checked', checked)      // for page semantic only...
    }


    registerItem(jLiItem, iItem){
        const itemId = this.questId + '-'+iItem

        // Build the new/augmented <li> tag, bind behaviors and replace the original with it:
        const newLi = $(this._wrapHtmlWithQcmLogistic(jLiItem, itemId))
        newLi.find('label').on('click', this._clickFactory(itemId))
        jLiItem.replaceWith(newLi)

        // Register data for later user's actions:
        this.byId[itemId] = {
            checked: false,
            correct: this.answers.includes(iItem+1),
        }
    }

    _wrapHtmlWithQcmLogistic(jLiItem, itemId){

        const inputId       = `"${ itemId }-input"`
        const qcm_class     = ` class="qcm ${itemId}" `
        const label_classes = this._getLabelClasses(itemId, 'unchecked')
        const finalHtml     = `
<li id="${ itemId }" class="py_mk_item_qcm">
<input type="checkbox" id=${ inputId } ${ qcm_class } >
<label for=${ inputId } class="${ label_classes }" >
  ${ CONFIG.QCM_SVG }
  <div class="content">${ jLiItem.html() }</div>
</label>
</li>`
//.replace(/\s+/g, " ")      // DON'T DO THAT! (it messes up pre/code tags display)

        return finalHtml
    }
}


CONFIG.CLASSES_POOL.Question = Question
CONFIG.CLASSES_POOL.Qcm      = QCM
