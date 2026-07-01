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




/**Takes a string and cut the "middle chunk" of them if it is considered too long (length > 1750),
 * shortening it in the following way:
 *   - keep the 500 first and 300 last chars
 *   - replace the middle with a message
 * */
export function textShortener(text){
  if(CONFIG.cutFeedback && text.length > CONFIG.feedbackShortener.limit){
    const head = text.slice(0,CONFIG.feedbackShortener.head)
    const tail = text.slice(-CONFIG.feedbackShortener.tail)
    text = `${ head }\n...\n${ CONFIG.feedbackShortener.msg }\n...\n${ tail }`
  }
  return text
}




/**Extract the complete stacktrace from an error message, to show it in a terminal to the user.
 * Used only when something gets VERY wrong, somewhere in the JS layer (generally)...
 * */
export const youAreInTroubles = (err, isError=false) =>{
  if(isError) err = String(err).trimEnd()
  return `${ err }\n\n${ err.stack || '[no stack]' }\n${ CONFIG.MSG.bigFail }`
}




/**Square brackets in "rich text format" must be escaped, otherwise they are messing up the
 * terminal formatting informations.
 * */
export const escapeSquareBrackets=msg=>{
  return msg.replace(CONFIG.ESCAPE_SQ_B, m=>SqBs[m])
}

export const unEscapeSquaredBrackets=msg=>{
  return msg.replace(CONFIG.UNESCAPE_SQ_B, m=>SqBs[m]||m)     // Why ||m ??
}

export const toSnake = (msg) =>{
  return msg.replace(/[A-Z]/g, m=>'_'+m.toLowerCase())
}

/**Ensure the given python code can safely be inserted into a JS template.
 * */
export const escapePyodideCodeForJsTemplates = (code) =>{
  return code.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}



/**Formatting function factory, for messages used in the jquery terminal.
 *
 * WARNING: the input message will be "escapeSquareBrackets"-ed.
 * */
const _richTextFormat = (content, style, color="", background="")=>{
  content = escapeSquareBrackets(content)
  return `[[${ style };${ color };${ background }]${ content }]`;
}

export const txtFormat = {
  error:   (content) => _richTextFormat(content, "b", "red"),
  warning: (content) => _richTextFormat(content, "ib", "orange"),
  info:    (content) => _richTextFormat(content, "i", "grey"),
  italic:  (content) => _richTextFormat(content, "i"),
  stress:  (content) => _richTextFormat(content, "b"),
  success: (content) => _richTextFormat(content, "ib", "green"),
  none:    escapeSquareBrackets,  // To override the defaults, if needed (see process_and_gui.js)
}


// Backward compatibility config (PMT < 2.2.0)
const DEFAULT_FORMATTING_BEFORE_220 = {
  runScript:         'info',
  installStart:      'info',
  installDone:       'info',
  validation:        'info',
  editorCode:        'info',
  publicTests:       'info',
  secretTests:       'info',
  successMsg:        'success',
  successMsgNoTests: 'info',
  unforgettable:     'warning',
  successHead:       'success',
  failHead:          'warning',
}

/** Preformat the various messages to use in the terminals (in the given tongue)
 * */
export const applyLangMessagesFormatting=()=>{
  for(const prop in CONFIG.lang){
    const obj = CONFIG.lang[prop]
    const format = obj.format || DEFAULT_FORMATTING_BEFORE_220[prop]

    if(format){
      obj.msg = txtFormat[ format ]( obj.msg )
    }
  }
}







/**NO_HTML and ALPHA (TOME_BASE in the python source) constants automatically transferred
 * from python during dev_ops/mkdocs_hooks operations.
 *
 * ****************************
 * * !!! DO NOT EDIT HERE !!! *
 * ****************************
 * */
const NO_HTML = '\'"&#><\n\t\r\\'
const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%()*+,-./:;=?@^_`{|}~ "
const TOME_B = [...ALPHA].reduce((o,c,i)=>(o[c]=i,o), {})


const unBase = s => [...s].reduce((v,c)=>v*ALPHA.length + TOME_B[c], 0)


/**@txt: CONFIG.LZW separated lines, with:
 *      1. A dot + dots separated unicode codePoints
 *      2. regular alpha
 *      3. compressed data, size 2
 *      4. ..., size 3,
 *      5. ...
 *
 * The compressed text always has one leading and one trailing dot:
 *      1. they allow to trim safely the encoded content, without any risk to trim spaces from
 *         the encoding alphabet.
 *      2. The leading dot allows to disambiguate the "big" section content of the alphabet,
 *         when no emojis are used in the original content.
 * */
export const decompressLZW=(compressed, compressOptionSrc)=>{
  // console.log(JSON.stringify(compressed))

  const [bigs, smalls, ...chunks] = compressed.trim().slice(0,-1).split(CONFIG.LZW)
  const tome = [
    [...NO_HTML],
    bigs=='.' ? [] : bigs.slice(1).split('.').map(n=>String.fromCodePoint(+n)),
    [...smalls],
  ].flat()

  let txt=[], size=1, out=[]
  chunks.forEach(chunk=>{
    size++
    if(chunk.length%size){
      throw new Error(
        `Wrong chunk during decompression: size=${size}, length=${chunk.length}.\n` +
        `You can deactivate the compression by using setting the pyodide_macros plugin ` +
        `option ${ compressOptionSrc } to false, until the theme gets fixed.`
      )
    }
    for(let i=0 ; i<chunk.length ; i+=size){
      txt.push(unBase(chunk.slice(i,i+size)))
    }
  })
  txt.forEach((iBase,i)=>{
    const s = tome[iBase]
    const fresh = s + (tome[txt[i+1]] || s)[0]
    out.push(s)
    tome.push(fresh)
  })
  return out.join('')
}




/**Decompress PAGE_IDES_CONFIG content if not already done.
 * */
export function decompressPagesIfNeeded(){
  if(typeof(PAGE_IDES_CONFIG)!='string') return;

  LOGGER_CONFIG.ACTIVATE && jsLogger('[CheckPoint] - decompress page LZW')
  globalThis.PAGE_IDES_CONFIG = decompressAndConvert(PAGE_IDES_CONFIG)
}


/**Decompress LZW encoded string to a JSON object.
 * */
export function decompressAndConvert(compressed){
  const decompressed = decompressLZW(compressed, "build.encrypted_js_data")
  const outcome      = JSON.parse(
      decompressed, (key,val)=>key=='attempts_left' && val=="Infinity" ? Infinity : val
  )
  return outcome
}