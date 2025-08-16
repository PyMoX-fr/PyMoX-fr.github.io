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


import { PyodideSectionsRunner } from "2-pyodideSectionsRunner-runner-pyodide"
import { RunningProfile } from 'functools'




export class BtnRunner extends PyodideSectionsRunner {

  get isPyBtn(){ return true }

  // @Override
  build(){
    super.build()
    $('#'+this.id).find("button").on('click', this.runners.default.asEvent)
  }


  // @Override
  buildRunners(){
    this.addRunnerIfNotDefinedYet(
      this.lockedRunnerWithBigFailWarningFactory(
        RunningProfile.PROFILE.btn,
        this.setupRuntimeBtn,
        async ()=>null,             // No "user" action! (only env stuff)
        this.teardownRuntime,
      ),
      RunningProfile.PROPS.btn,
      true,
    )
  }


  async setupRuntimeBtn(){
    // Can get an argument (eventOrCmd), depending on how it's run/called.
    //    => Override to not transmit it
    return await this.setupRuntime()
  }


  scrollIntoView(){
    super.scrollIntoView( $('#'+this.id)[0] )
  }
}

CONFIG.CLASSES_POOL.PyBtn = BtnRunner
