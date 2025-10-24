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

import { IdeRunner } from '4-ideRunner-ide'


const divs =$('.dev-sandbox')

const SECTIONS_IN_ORDER = [
  "env_content",
  "env_term_content",
  "user_content",
  "corr_content",
  "public_tests",
  "secret_tests",
  "post_term_content",
  "post_content",
]

const toSectionName = {
    env_content:       "env",
    env_term_content:  "env_term",
    user_content:      "code",
    corr_content:      "corr",
    public_tests:      "tests",
    secret_tests:      "secrets",
    post_term_content: "post_term",
    post_content:      "post",
}

const fromSectionName = Object.entries(toSectionName).reduce((o,[k,v])=>(o[v]=k,o), {})

const get=(id)=>ace.edit(id).getSession().getValue()

const set=(id, content="")=>ace.edit(id).getSession().setValue(content)

const toSection=(id, code)=>`
# --- PMT:${ toSectionName[id] } --- #

${ code }
`







class IdePlayground extends IdeRunner {

  constructor(id){
    super(id)
    const ide = this
    window.runValidation = async function(){ await ide.runners.validate() }
    window.runPlay = async function(){ await ide.runners.play() }
    this.archiveCodeGetter = null
  }

  buildCorrStuff(){ return true }


  async setupRuntimeIDE() {
    this.getAll()

    // WARNING: this.getCodeToTest may have been rotated by the corrBtn already, but not a problem...
    this.archiveCodeGetter = this.getCodeToTest;
    this.getCodeToTest = ()=>{
      const code  = this.archiveCodeGetter()
      const tests = get(fromSectionName.tests)
      const roRun = code+"\n\n"+tests
      return roRun
    }
    return await super.setupRuntimeIDE()
  }

  async teardownRuntimeIDE(runtime) {
    await super.teardownRuntimeIDE(runtime)
    this.getCodeToTest = this.archiveCodeGetter
  }


  getAll(){
    const ideThis = this
    divs.each(function(){
        const code = get(this.id)
        ideThis.data[this.id] = code
    })
  }

  resetAll(){
    divs.each(function(){
        set(this.id, "")
    })
  }

  setStartingCode(options={}){
    this.resetAll()
    super.setStartingCode(options)
  }

  download(){
    const content = this._buildPythonFileContent()
    super.download(content)
  }

  upload(){
    uploader(txt=>{
        this._applyAllCodesFromFileContent(txt)
        this.makeDirty()
        this.focusEditor()
    })
  }

  save(_){
    const content = this._buildPythonFileContent()
    this.setStorage({code: content, hash: this.srcHash})
  }

  getCodeFromStorage(){
    return this._applyAllCodesFromFileContent(this.storage.code)
  }

  _buildPythonFileContent(){
    this.getAll()
    const contents = []
    for(const section of SECTIONS_IN_ORDER){
      const code = section=='user_content' ? get(this.id) : this.data[section]
      if(!code) continue
      contents.push(toSection(section, code))
    }
    const content = contents.join('')
    return content
  }

  _applyAllCodesFromFileContent(txt){
    const parts = txt.split(/#\s*-+\s*(?:PMT|PYODIDE):(\w+)\s*-+\s*#/)
    parts.splice(0,1)   // remove leading empty element
    let codeContent=""

    const pairs = _.chunk(parts, 2)
    pairs.forEach( ([section,code])=>{
      code = code.replace(/^\n+|\n+$/g, "")
      if(section=='code'){
        this.applyCodeToEditorAndSave(code)
        codeContent = code
      }else if(section in fromSectionName){
        const id = fromSectionName[section]
        if(id===undefined) return;    // Skip REMs
        set(id, code)
      }
    })
    return codeContent
  }
}


CONFIG.CLASSES_POOL.IdePlayground = IdePlayground
