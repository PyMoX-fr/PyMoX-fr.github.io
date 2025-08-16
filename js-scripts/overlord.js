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

import { waitForClassesPoolReady } from "functools";

export default waitForClassesPoolReady
  // reexport so that importable from subscriptions, to enforce the call of waitForClassesPoolReady

waitForClassesPoolReady()
/*

Can also be `waitForClassesPoolReady( (cbk)=>boolean )`, where cbk is supposed to be a synchronous
boolean provider:
    - `cbk` will be called when all the classes for the current page have been registered in
      CONFIG.CLASSES_POOL, for the current page.
    - If the callback returns a falsy value, it will be called again in the future (the caller
      is using `setTimeout`), until it returns true. This allows the use of asynchronous waiting
      logic if needed.


A (stupid) example, waiting 500ms between the classes registrations in CONFIG.CLASSES_POOL and
their use to build the objects in the page:

```javascript
const time = new Date()
waitForClassesPoolReady(_=> (new Date()-time) > 500 )
```

*/
