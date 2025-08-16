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


import { escapePyodideCodeForJsTemplates, youAreInTroubles } from 'functools'






/**Return the plain error message, unless it's an assertion error, where the message is formatted.
 *
 * @returns ([errMessage, isAssertErr]): NOTE: errMessage is NOT formatted for jQuery terminal yet.
 *
 * ---
 *
 * ## Rationals
 *
 * - The argument error can be of any kind (JS or python)
 * - "Legit" errors are those starting with "PythonError".
 * - Any error that isn't considered "legit" will add a specific warning at the end of the error
 *   message, saying to the user to contact the webmaster, because there is a problem in the code
 *   and/or the exercice.
 * - "Legit" errors are studied and cleaned up in various ways. Mostly:
 *   - remove any lines related to pyodide environment (unless the error is identified as "legit",
 *     but also problematic)
 *   - possibly add the assertion code (if allowed) for bare AssertionErrors.
 *   - reduce the size of the stacktrace and/or the error message if they are too big (to avoid
 *     having the terminal lagging like hell...)
 *
 *
 * ## Searching for AssertionError:
 *
 * This is not totally trivial, because it must be made sure that the code finds the actual error
 * type declaration in the string, and not a false positive:
 *
 *      ```python
 *      raise ValueError("should be AssertionError")
 *      ```
 *      -> Forbids simple inclusion checks.
 *
 *      ```python
 *      raise ValueError("""
 *      Hey, the code should have raised:
 *      AssertionError!
 *      """)
 *      ```
 *      -> Forbids simple `startsWith` checks.
 *
 * To avoid this, "AssertionError" is searched at the beginning of a line, with the previous line
 * starting with '  File "<exec>"'.
 *
 * Note: the online REPL show a '  File "<console>"' instead, but the behavior stays the same.
 *
 *
 * ---
 *
 *
 * Example of an input error message in pyodide 0.23.1:
 *
 *      PythonError: Traceback (most recent call last):
 *        File "/lib/python3.10/site-packages/_pyodide/_base.py", line 435, in eval_code
 *          .run(globals, locals)
 *        File "/lib/python3.10/site-packages/_pyodide/_base.py", line 304, in run
 *          coroutine = eval(self.code, globals, locals)
 *        File "<exec>", line 4, in <module>
 *        File "<exec>", line 7, in ecrete
 *        File "<exec>", line 12, in limite_amplitude
 *      ValueError: blabla
 *
 *
 * Example of an input error message in pyodide 0.25.0:
 *
 *      PythonError: Traceback (most recent call last):
 *        File "/lib/python311.zip/_pyodide/_base.py", line 501, in eval_code
 *          .run(globals, locals)
 *           ^^^^^^^^^^^^^^^^^^^^
 *        File "/lib/python311.zip/_pyodide/_base.py", line 339, in run
 *          coroutine = eval(self.code, globals, locals)
 *                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *        File "<exec>", line 1, in <module>
 *      AssertionError: This message...
 *
 *
 * Example of error involving RecursionError with repeated lines:
 *
 *      PythonError: Traceback (most recent call last):
 *        File "/lib/python311.zip/_pyodide/_base.py", line 501, in eval_code
 *          .run(globals, locals)
 *           ^^^^^^^^^^^^^^^^^^^^
 *        File "/lib/python311.zip/_pyodide/_base.py", line 339, in run
 *          coroutine = eval(self.code, globals, locals)
 *                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *        File "<exec>", line 2, in <module>
 *        File "<env>", line 10, in essai
 *        File "<env>", line 10, in essai
 *        File "<env>", line 10, in essai
 *        [Previous line repeated 44 more times]
 *      RecursionError: maximum recursion depth exceeded
 *
 *
 *
 * And it sometimes gets even worse:
 *
 *      PythonError: Traceback (most recent call last):
 *        File "/lib/python311.zip/_pyodide/_base.py", line 501, in eval_code
 *          .run(globals, locals)
 *           ^^^^^^^^^^^^^^^^^^^^
 *        File "/lib/python311.zip/_pyodide/_base.py", line 339, in run
 *          coroutine = eval(self.code, globals, locals)
 *                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *        File "<exec>", line 6, in <module>
 *        File "<exec>", line 5, in meh
 *        File "<exec>", line 5, in meh
 *        File "<exec>", line 5, in meh
 *        [Previous line repeated 992 more times]
 *        File "/lib/python311.zip/random.py", line 312, in randrange
 *          return self._randbelow(istart)
 *                 ^^^^^^^^^^^^^^^^^^^^^^^
 *        File "/lib/python311.zip/random.py", line 239, in _randbelow_with_getrandbits
 *          k = n.bit_length()  # don't use (n-1) here because n can be 1
 *              ^^^^^^^^^^^^^^
 *      RecursionError: maximum recursion depth exceeded while calling a Python object
 *
 * */
export function generateErrorLog(ctx) {

  const { code, autoAssertExtraction, purgeTrace } = {
    code: "",
    autoAssertExtraction: false,
    purgeTrace: false,
    ...ctx.logConfig
  }

  const err = ctx.err
  const msg = String(err).trimEnd()     // Note: err might have a trailing new line x/ => trim it...


  // Return directly non python errors => this allows to also see JS errors as "big fail"(because
  // they should never occur, here!).
  if(!msg.startsWith('PythonError')){
    ctx.stdErr = formatBigFail(msg, ctx)
    return
  }

  const errLines = msg.split("\n")

  /*
  Search for the first line after the pyodide-specific infos, avoiding false positives for
  terminals, where the second line is:
      `  File "<exec>", line \d+, in redirect_cmd`
  Also, in case of SyntaxError, there is no indication after the line number (REMINDER: the
  negative lookahead CANNOT start just after the number or the redirect_cmd thing is matched
  when the line number has more than 1 digit... So, 'must use another strategy).
  */
  const iModule     = errLines.findIndex(s=>CONFIG.MODULE_REG.test(s))
  const iError      = err.type ? guessErrorMsgLine(errLines, err.type) : errLines.length-1
  const isAssertErr = ctx.isAssertErr = err.type == 'AssertionError'


  // If ExclusionError, just throw the last line without anything else:
  if(errLines[iError].includes(CONFIG.MSG.exclusionMarker)){
    const msg  = errLines.slice(iError).join('\n')
    const i    = msg.indexOf(CONFIG.MSG.exclusionMarker)
    ctx.stdErr = msg.slice(i)
    return
  }


  const isMultiLineError = iError+1 < errLines.length
  const cleaned = (errLines[iError] || "").replace("AssertionError","").trim()
  const hasNoMsg = !isMultiLineError && !cleaned

  // WARNING:
  //   The following lines are working by mutation, so the successive splices are done "backward"
  //   (aka, from end to beginning, so that the line numbers stay consistent).

  // Rebuild the automatic assertion message first, if needed, or reformat the error message:
  if( code && isAssertErr && hasNoMsg && autoAssertExtraction ){
    const bigFail = buildAssertionMsg(code, errLines, iError, ctx)
    if(bigFail){
      ctx.stdErr =  bigFail
      return
    }
  } else if(!isAssertErr && purgeTrace){
    const errKind = errLines[iError].split(':')[0]
    errLines.splice(iError, errLines.length)
    errLines.push(`${errKind} has been raised.`)
  }

  // Then shorten the error code section (if multiline assertion message), and then the stacktrace.
  shortenArrSection('err',   errLines, iError, errLines.length-1, iModule, purgeTrace)

  // Then remove pyodide related information from the stacktrace (the user doesn't need to know)
  shortenArrSection('trace', errLines, iModule, iError-1, iModule, purgeTrace)

  ctx.stdErr =  errLines.join('\n')
}






/**Mutate the content of the given array, if the section identified by the original `from` and
 * `to` indices is considered too long.
 * Both indices arguments are inclusive.
 * */
const shortenArrSection=(kind, errLines, from, to, iModule, purgeTrace)=>{

  if(kind=='trace' && purgeTrace){
    errLines.splice(0, to+1)
    return
  }

  if(CONFIG.cutFeedback){

    const [limit, head, tail] = "Limit Head Tail".split(' ').map( prop => CONFIG.feedbackShortener[kind+prop] )
    if(to-from > limit){
      from += head
      to -= tail
      let middle = CONFIG.feedbackShortener.msg
      if(kind=='trace'){
        middle = middle.replace(
          CONFIG.MSG.rightSafeSqbr,
          `, ${ to-from-1 } more lines here...${ CONFIG.MSG.rightSafeSqbr }`
        )
      }
      errLines.splice(from, to-from+1, middle)
    }
  }

  if(kind=='trace'){
    // Then remove or reformat pyodide specific lines (nly if this is the last operation, aka "trace")
    errLines.splice(1, iModule-1)
    errLines[0] = errLines[0].slice( 'PythonError: '.length )
  }
}




/**Since nothing can be sure about how the message is formatted, and some users could add
 * messages containing the error name itself (worst case: at the beginning of a new line...),
 * the following logic is used:
 *    - Start exploring lines from the end.
 *    - Store the index of any line starting with the desired errKind.
 *    - Return the last index found, either when reaching a line matching CONFIG.TRACE_REG (meaning
 *      we've entered the traceback section), or once all the lines have been checked.
 *
 * Tricks & quirks:
 *    - `errKind` can also contain "<>." chars:  `_hack_exclusions_tools.<locals>.ExclusionError`
 *    - `errKind` analysis requires regexp, because the JS error.type might miss "some upper level
 *      packages names". For example:
 *            When `errKind` is `JsException`, the stacktrace actually holds:
 *                  `pyodide.ffi.JsException`
 *
 * @throws: Error if @errKind cannot be found.
 * */
const guessErrorMsgLine=(arr, errKind)=>{
  const specials = errKind.replace(/[\w.]+/g, '')
  const matcher  = new RegExp(`^[\\w.${ specials }]+(?=$|:)`)

  let iErr = -1
  for(let i=arr.length-1 ; i>=0 ; i--){
    const line = arr[i]

    // Attempt at early exit when entering the stacktrace, but might not always be found...
    const isLastTrace = CONFIG.TRACE_REG.test(line)
    if(isLastTrace) break

    const start = matcher.exec(line)
    if(start && start[0].endsWith(errKind)) iErr=i
  }
  if(iErr >= 0){
    return iErr
  }
  throw new Error(
    `Couldn't find the "${ errKind }" error line in the error message.

Matcher: ${matcher}
Message:

${ arr.join('\n') }`
  )
}




/**Get back the full python assertion instruction, by extracting the lines it covers,
 * through the use of the ast module in pyodide, then mutate the array representing
 * the error message accordingly.
 * */
function buildAssertionMsg(code, errLines, iAssertionError, ctx){

  const callLine = errLines[iAssertionError-1] || ""

  const numMatch = callLine.match(CONFIG.TRACE_NUM_LINE)
  if(!numMatch){
    throw new Error(`
Couldn't determine the line number of the assertion in:
      ${ callLine }
    Error message:\n${ errLines.join('\n') }`)
  }

  // The double quotes are all escaped to make sure no multiline string in the code
  // can cause troubles.
  const escapedCode = escapePyodideCodeForJsTemplates(code)
  const lineNo = +numMatch[1]

  const astExplorer = `
def _extract_assertion():
    import ast

    def is_matching_assertion(node):
        return isinstance(node, ast.Assert) and node.lineno <= ${ lineNo } <= node.end_lineno

    code = """${ escapedCode }"""
    tree = ast.parse(code)

    assertNode = next( filter(is_matching_assertion, ast.walk(tree)), None)

    if assertNode:
        i,j = assertNode.lineno-1, assertNode.end_lineno
        return '\\n'.join(code.splitlines()[i:j])

_ = _extract_assertion()
del _extract_assertion
_`
  let assertion
  try{
    assertion = pyodide.runPython(astExplorer)
    if(!assertion) return
      /* Is assertion is null, this means the assertions comes from a function called by
         the user code or the command */

  }catch(e){
    // Any error here must be caught and returned, otherwise it will just
    // be swallowed (somehow...)
    console.log(astExplorer)
    return formatBigFail(e, ctx)
  }
  const assertArr = assertion.split('\n')
  errLines[ errLines.length-1 ] += ':\n' + assertArr.splice(0,1)[0]
  errLines.push(...assertArr)
}



const formatBigFail=(err, ctx)=>{
  ctx.gotBigFail = true
  return youAreInTroubles(err)
}