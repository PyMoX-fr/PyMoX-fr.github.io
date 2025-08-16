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


import { getIdeOptions } from 'functools'
import { chaining } from 'subscriptions'    // Enforce proper imports resolution order

const options = getIdeOptions()
$('.dev-sandbox').each(function(){
  const editor = ace.edit(this.id, options);

  editor.commands.bindKey(
    { win: "Ctrl-Space", mac: "Cmd-Space" }, "startAutocomplete"
  )
  editor.commands.addCommand({
    name: "runPublicTests",
    bindKey: { win: "Ctrl-S", mac: "Cmd-S" },
    exec: ()=>runPlay(),
  })
  editor.commands.addCommand({
    name: "runValidationTests",
    bindKey: { win: "Ctrl-Enter", mac: "Cmd-Enter" },
    exec: ()=>runValidation(),
  })
})