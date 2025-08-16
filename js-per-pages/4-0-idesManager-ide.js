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



import { escapePyodideCodeForJsTemplates } from 'functools'
import { RUNNERS_MANAGER } from '2-0-runnersManager-runners'



/** Reexport, so that Ide modules can import this version: this will enforce proper
 * import order of all the modules, while CONFIG.CLASSES_POOL.GlobalRunnersManager
 * will be already defined, and so, can be extended.
 * */
export { RUNNERS_MANAGER }




class GlobalZipExportIdesManager extends CONFIG.CLASSES_POOL.GlobalRunnersManager {

  exportIdesAsZip(){

    const codesToArchive = this._getDataForExportableIdeInPage()
    const zipNameChunks = this._buildZipNameFirstChunks()
    const archiveFromPyCode = this._buildZipExportPythonCode(codesToArchive, zipNameChunks)

    pyodide.runPython(archiveFromPyCode)
  }



  /**Build an array of objects, containing all the needed info to load the archive content
   * back later (IDE's editorId, code and pyName).
   * */
  _getDataForExportableIdeInPage(){
    const toArchive = []
    for (const runner of Object.values(this.allRunners)){
      if(runner.isIde && runner.export){
        const code = runner.getCodeToTest()
        const id   = runner.id
        const pyName = runner.pyName
        toArchive.push({code, id, pyName})
      }
    }
    return toArchive
  }



  _buildZipNameFirstChunks(){
    const zipChunks = []

    if(CONFIG.exportZipPrefix){
      zipChunks.push(CONFIG.exportZipPrefix)
    }
    if(CONFIG.exportZipWithNames){
      let names = ""
      while (!names){
        names = window.prompt(CONFIG.lang.zipAskForNames.msg)
      }
      zipChunks.push(names)
    }
    return zipChunks
  }


  /**Create the zip archive from within pyodide (because no need for new CDNs XD ),
   * then push it back to the JS layer.
   * */
  _buildZipExportPythonCode(codesToArchiveArr, zipNameChunks){

    const jsonArr        = JSON.stringify(codesToArchiveArr)
    const pyodideJsonArr = escapePyodideCodeForJsTemplates(jsonArr)

    return `
@__builtins__.auto_run
def _hack_build_zip():

    import shutil, json
    from pathlib import Path
    from itertools import count

    def unique_name(p:Path):
        while p.exists():
            p = p.with_name(f"{ p.stem }_{ p.suffix }")
        return p

    dirname = unique_name(Path('tmp_zip'))
    dirname.mkdir()

    url    = ${ JSON.stringify(location.href) }
    origin = ${ JSON.stringify(location.origin) }
    chunks = ${ JSON.stringify(zipNameChunks) }

    # Always make sure the url part of the filename is not empty:
    zip_url = url[len(origin):].strip('/').replace('/','_').replace('.','_') or 'home'
    chunks.append(zip_url)

    zip_name = unique_name( Path( '-'.join(chunks) + '.zip') )

    data = json.loads("""${ pyodideJsonArr }""")
    for ide in data:
        name = dirname / (ide['id'] + '${ CONFIG.ZIP.pySep }' + ide['pyName'])
        name.write_text(ide['code'], encoding="utf-8")

    shutil.make_archive(zip_name.with_suffix(''), 'zip', dirname)

    pyodide_downloader(
        zip_name.read_bytes(),
        zip_name.name,
        "application/zip",   # automatically "overridden in" "application/x-zip-compressed" on Windaube...
    )
    shutil.rmtree(dirname)
    zip_name.unlink()
`
  }
}








class GlobalZipImportIdesManager extends GlobalZipExportIdesManager{


  getArchiveFiles(dropEvent){
    const useItems = Boolean(dropEvent.dataTransfer.items)
    const zipFiles = [
      ...dropEvent.dataTransfer[ useItems?'items':'files' ]
    ].filter(this._isArchiveFile).map(
      itemOrFile => useItems ? itemOrFile.getAsFile() : itemOrFile
    )

    if(zipFiles.length != 1){
      console.log([...dropEvent.dataTransfer[ useItems?'items':'files' ]])
    }

    return zipFiles
  }


  _isArchiveFile=(itemOrFile)=>(
    itemOrFile.kind === "file" && [
      "application/zip", "application/x-zip-compressed"
    ].some(type=>type==itemOrFile.type)
  )


  readZipContentAndUpdateIdes(zipArchive){
    const reader = new FileReader();

    reader.onload = function(event){
      const bytesArr = event.target.result
      pyodide.unpackArchive(bytesArr, "zip", {extractDir: CONFIG.ZIP.tmpZipDir})
      pyodide.runPython(`
@__builtins__.auto_run
def _hack_zip_loading():
    from pathlib import Path
    import js

    tmp_dir = Path('${ CONFIG.ZIP.tmpZipDir }')

    for py in tmp_dir.iterdir():
        content = py.read_text(encoding='utf-8')
        js.config().loadIdeContent(py.name, content)
        py.unlink()

    tmp_dir.rmdir()
`)
    }

    reader.readAsArrayBuffer(zipArchive)
  }
}







/** Common top level object.
 * */
class GlobalRunnersManager extends GlobalZipImportIdesManager {}


// Replace the class in the CONFIG object:
CONFIG.CLASSES_POOL.GlobalRunnersManager = GlobalRunnersManager

// Forbid a new CLASSES_POOL registration with this character: }
// (see python_devops/py_codes_updates/html_deps_and_import_map.py:gather_all_scripts_and_css_kinds_and_rebuild_Deps)