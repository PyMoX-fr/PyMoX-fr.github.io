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

import { PythonError } from "functools"




/**Forbid writing these properties from pyodide.
 * */
export const PMT_LOCAL_STORAGE_KEYS_WRITE = Object.freeze(`
    code
    done
    hash
    name
    project
`.trim().split(/\s+/))





/**Holds references to the IDE and the local storage object causing id collisions with projects.
 * Mutated from... where needed (subscriptions).
 * */
const SHARED_ID_COLLISIONS = []


export const showIdCollisionsIfAny=()=>{
  if(!SHARED_ID_COLLISIONS.length) return;

  const msg = [
    CONFIG.lang.storageIdCollision.msg,
    '',
    '-----------------------------',
    '',
    `Current project id: ${ JSON.stringify(CONFIG.projectId) }`,
    `Page: ${ document.location }`,
    '',
    "IDEs that are sources of collisions are:",
    ...SHARED_ID_COLLISIONS.flatMap(([ide,storage])=> [
      "---",
      `  Html id: ${ ide.id }`,
      `  IDE: py_name = "${ ide.pyName }"`,
      `  Collides with py_name = "${ storage.name }" in project ${ JSON.stringify(storage.project) }`,
    ])
  ]
  SHARED_ID_COLLISIONS.length = 0
  window.alert(msg.join('\n'))
}





/**Extract the given ID data from the localStorage, checking if it's not an outdated or invalid
 * structure. If a `freshStore` is built on the way and the call is done from an Ide instance,
 * the new storage object will automatically be saved in the local storage.
 * @returns: storage_data
 *
 * WARNING:
 *  1) Redactors might store extra fields in the LocalStorage, so DO NOT cleanup the thing...
 *  2) This function is used in CodEx.
 * */
export function getIdeDataFromStorage(editorId, ide=null){      // CodCap

  // Originally, the storage value was just the user's code, so keep extracting as this:
  let codeOrStorageAsStr = localStorage.getItem(editorId) || ""

  let obj  = {}
  let code = codeOrStorageAsStr
  try{
    obj = JSON.parse(codeOrStorageAsStr || "{}")

    // Handle ultra old/outdated localStorage data for PMT:
    //    when the local storage stored a code string that could be converted to JSON without error
    if(typeof(obj)!=='object') obj = {code}

  }catch(_){
    // Handle ultra old/outdated localStorage data for PMT:
    // Here, the code was not "JSON compatible".
    obj = {code}
  }
  obj.code ??= ""

  // If the update to 5.4.0 has occurred before the `project.id` was filled by the author,
  // users might have the localStorage updated with a `project: null` entry. This is to be
  // considered "up to date", to avoid bazillions of warning for the users (1 per IDE!).
  const pmt_540_ready = (obj.project??null) !== null
  const considerOk    = pmt_540_ready && PMT_LOCAL_STORAGE_KEYS_WRITE.every(k=> k in obj)
  const storage       = considerOk ? obj : freshStore({storage:obj, ide})

  const isCollisionId = ide && !CONFIG.projectNoJsWarning && storage.project !== CONFIG.projectId
  if(isCollisionId){
    SHARED_ID_COLLISIONS.push([ide, storage])
  }
  return storage
}




/**Build a default IDE storage object, taking care of the logic involved in various PMT versions.
 *
 * @options: {storage, ide}
 *
 * WARNING: Redactors might store extra fields in the LocalStorage, so DO NOT cleanup the storage
 *          entry...
 * */
export function freshStore(options){

  const {storage, ide} = {storage:{}, ide: null, ...options}

  storage.done ??= 0                        // -1: fail, 0: unknown, 1:success
  storage.project ??= CONFIG.projectId
    /*
      Always force-update the project value if not defined yet and the redactor provided a value.

      WARNING: DO NOT put that as default value in @options, otherwise null values that have been
      previously stored in the local storage would stay at NONAME, even if the redactor defined
      a project.id value.
     */

  if(ide){
    storage.name = ide.pyName
    storage.hash ??= ide.srcHash
      /*
        The `hash` is stored only when the IDE is run, so that codes changes done by a  redactor
        are not triggering "outdated codes" messages on the user sides, for IDE they never executed
        before.
       */

    // Always update the current ide object and the corresponding local storage entry, when
    // defining a "fresh" storage:
    ide.setStorage(storage)
  }

  return storage
}




/**Extract all the cmd histories and the IDEs data from the localStorage.
 * */
const getStorageEntries=()=>{

  const somethingWrong = []
  const data  = Object.entries(localStorage)
  const cmds  = data.filter( ([id,_]) => /^\d+_commands$/.test(id) )
  const ides  = data.filter( ([id,_])=>/^editor_[\da-f]{16,}$/.test(id) )
                    .map( ([k,s])=>{
                      try{
                        return [k, getIdeDataFromStorage(k)]
                          // NOTE: no localStorage updates at this point, because the IDE object
                          // is not available yet, to properly update the data
                      }catch(_){
                        somethingWrong.push([k,s])
                        localStorage.removeItem(k)
                      }
                  })

  if(somethingWrong.length){
    const msg = `
Some invalid data have been found in the localStorage and have been removed.
Please contact the author of Pyodide-MkDocs-Theme, opening an issue on the repository with the data you may find in the console of your browser (F12).

Repository:
  ${ CONFIG.pmtUrl }
`
    console.error('\nInformation to give on the PMT repository:\n')
    console.log(somethingWrong.map(([k,s])=>'\n---\n  '+k+' with content:\n'+JSON.stringify(s)).join('\n'))
    window.alert(msg)
  }
  return {cmds, ides}
}




export const moveLocalStorageEntriesFromOlderProjectId=(toUpdate)=>{
  const {ides} = getStorageEntries()
  ides.forEach(([k,o])=>{
    if(o.project === toUpdate){
      o.project = CONFIG.projectId
      localStorage.setItem(k, JSON.stringify(o))
    }
  })
}




export const trashLocalStorage=()=>{

  const {cmds, ides} = getStorageEntries()

  // 1) Handle terminals history:
  //-----------------------------

  // jQuery.terminal history management is mostly trash (no difference between terminals
  // in different pages: terminals are only identified by their number in the current page,
  // in order...), so always remove unconditionally:
  cmds.forEach( ([k,_])=>localStorage.setItem(k,"[]") )


  // 2) Handle IDEs data:
  //---------------------

  const getMsg = (langProp, n)=>{
    const singularOrPlural = n==1 ? 'msg':'plural'
    return CONFIG.lang[langProp][singularOrPlural].replace('{N}',n)
  }

  // All ides entries for the current project id
  let codes = ides.filter( ([_,obj]) => obj.project===CONFIG.projectId)

  // Number of ides entries for other projects ids
  let nUnknown = ides.filter( ([_,obj]) => obj.project!==CONFIG.projectId).length

  // Various messages chunks:
  let unknownsInfos = !nUnknown ? '' : `\n(${ getMsg('complementTrash', nUnknown) })`
  let msg = getMsg('removeTrash', codes.length) + unknownsInfos

  // Here, `project.id` is not configured, or just got configured, or entries of the current
  // project already got removed: suggest to remove everything, whatever the source project:
  if(nUnknown && !codes.length){
    codes = ides
    msg = getMsg('allOthersTrash', codes.length)
  }

  if(!codes.length){
    window.alert(CONFIG.lang.noCodesTrash.msg + unknownsInfos)

  }else{
    const todo = window.confirm(msg)
    if(todo){
      codes.forEach( ([k,_])=>localStorage.removeItem(k) )
    }
  }
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

globalThis.getStorage  = noStorage
globalThis.setStorage  = noStorage
globalThis.delStorage  = noStorage
globalThis.keysStorage = noStorage