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

/**Swallow any kind of call left in a previous version of the theme, in scripts
 * loaded synchronously.
 * */
const jsLogger =()=> null
//*
globalThis.LOGGER_CONFIG = {}
/*/
globalThis.LOGGER_CONFIG = {ACTIVATE:true, all:1}
//*/



/**Defined for backward compatibility, incase the user is still using the function from the
 * original synch implementation of subscribeWhenReady.
 *
 * Facts:
 *  1. MathJax subscription is now done from the js-scripts/subscriptions.js module, so any
 *     call for mathjax coming from a user override is totally useless and can just be skipped.
 *  2. If ever another subscription is done, just directly transmit the call to the module
 *     version, to unify the implementations/logics.
 * */
function subscribeWhenReady(subscriptionId, ...args){

    if(subscriptionId.toLowerCase() == 'mathjax'){
        // Make sure anything defined by the user won't ever have any effect (by contract, the
        // user should never have changed it, so I can do whatever I want about it... :p )
        window.mathJaxUpdate = function(){}

    }else{
        // Any other subscription has to be transferred to the module version.
        // NOTE: anything relying on the returned value may break!
        import('functools').then(module=>{
            module.subscribeWhenReady(subscriptionId, ...args)
        })
    }

    return ()=>0        // SINK! (the default mathjax override _will_ call a fonction)
}