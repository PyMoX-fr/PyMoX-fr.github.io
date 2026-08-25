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
/*
-------------------------------------------------------------------------------------
Using a .mjs file so that I can use "hand made" tests from the command line
(=> pure hack, but enough for this. See `tests/avl_tests.mjs`).

NOTE: to have this file properly linted in VSC, add this to `.vscode/settings.json`:

    "files.associations": {
        "*.mjs": "javascript"
    }
-------------------------------------------------------------------------------------
*/

const LEFT = -1, RIGHT = 1
const SIDE = {'-2':'left', '-1':'left', '1':'right', '2':'right'}
const OTHER_SIDE = {left:'right', right:'left'}






export class Avl {

  h = 0       // height of the current tree
  nTree = 0   // Number of elements in the current tree (helps for OkComputer indices)

  constructor(row, left, right){
    this.value = row    // Undefined for empty Avl
    this.left  = left   // Undefined for empty Avl
    this.right = right  // Undefined for empty Avl
  }

  /**Compute the current balance of the children:
   *  - deeper left:   < 0
   *  - balanced:     == 0
   *  - deeper right:  > 0
   * */
  get balance() { return this.right.h - this.left.h }
  get isEmpty() { return !this.value }
  get isLeaf()  { return this.h == 1 }    // (Assumes the contract on h is always fulfilled...)


  //-------------------------------------------------------------------------------------

  /**Build the Avl matching the given array of RowProxies, in linear time (no rotations).
   * */
  static fromSortedArray(arr){
    const visit=(low, high)=>{
      if(low===high){
        return new Avl()
      }
      const m = low+high >>> 1
      return new Avl(arr[m], visit(low, m), visit(m+1, high))._updateStates()
    }
    return visit(0, arr.length)
  }

  isIdenticalToArray(freshRows){
    if(freshRows.length != this.nTree) return false
    let i=0
    for(const row of this){
      if(freshRows[i++]!==row) return false
    }
    return true
  }

  //-------------------------------------------------------------------------------------


  /**Mutate the current Avl instance with the given values. If no arguments provided, this
   * empties the current Avl.
   * */
  mutate(row=undefined, left=undefined, right=undefined){
    this.value = row
    this.left  = row ? left ?? new Avl() : undefined
    this.right = row ? right ?? new Avl() : undefined
    return this._updateStates()
  }

  /**Recompute `h` and `nTree` for the current Avl.
   * */
  _updateStates(){
    this.h     = this.isEmpty ? 0 : 1 + Math.max(this.left.h, this.right.h)
    this.nTree = this.isEmpty ? 0 : 1 + this.left.nTree + this.right.nTree
    return this
  }

  /**Yield all RowProxies in order.
   * */
  *[Symbol.iterator]() {
    if(!this.isEmpty){
      yield* this.left
      yield this.value
      yield* this.right
    }
  }


  //----------------------------------------------------------------------------------------------


  /**Returns a generator that will yield the RowProxies that would be inside `range(start,end)`,
   * where start and end are indices in the linear array equivalent to the current Avl.
   * If @reverse=true, if will yield the same elements, but in reverse order.
   * Note: @start and @end are always given in "left to right" reading order (@end exclusive).
   * */
  iterSlice(start, end, reverse=false){
    const [first, second, sign] = !reverse ? ['left','right', 1] : ['right','left', -1]

    const visit=function*(node, nBefore){
      if(
        node.isEmpty
        || nBefore + node.nTree < start     // Branch & bound: too far on the left
        || end < nBefore - node.nTree       // Branch & bound: too far on the right
      ) return;

      yield* visit(node[first], nBefore)
      nBefore += node[first].nTree * sign
      if(start <= nBefore && nBefore < end){
        yield node.value
      }
      yield* visit(node[second], nBefore + sign)
    }
    return reverse ? visit(this, this.nTree-1) : visit(this, 0)
  }


  /**Build an array with all the RowProxies whose the index _in the ARRAY equivalent to the Avl_
   * would be in the range(i,j).
   * */
  slice(start, end){
    return [...this.iterSlice(start,end)]
  }


  /**Return the equivalent index of the given RowProxy in a linearized version of the Avl.
   * (@seen used for a "kinda tail call" implementation, because easier to reason with...)
   * */
  getLinearIndex(row, seen=0){
    if(this.isEmpty){
      throw new Error(`Couldn't find an index for RowProxy(iRow=${ row.iRow }): not in the Avl.`)
    }
    if(row.iRow < this.value.iRow) return this.left.getLinearIndex(row, seen)
    if(row.iRow > this.value.iRow) return this.right.getLinearIndex(row, seen + 1 + this.left.nTree)
    else                           return seen + this.left.nTree
  }


  //----------------------------------------------------------------------------------------------


  /**Yield the RowProxies objects whose the iRow value falls into the `range(iRowStart, iRowEnd)`,
   * with iRowEnd exclusive.
   * */
  *iterRows(iRowStart, iRowEnd){
    if(this.isEmpty) return

    if(iRowStart < this.value.iRow){
      yield* this.left.iterRows(iRowStart, iRowEnd)
    }
    if(iRowStart <= this.value.iRow && this.value.iRow < iRowEnd){
      yield this.value
    }
    if(this.value.iRow < iRowEnd){
      yield* this.right.iterRows(iRowStart, iRowEnd)
    }
  }


  //----------------------------------------------------------------------------------------------


  /**Insert the give RowProxy object in the tree, based on its iRow property.
   * Duplicate values would go on the right (but won't ever happen in the current context).
   * */
  insert(row){
    if(this.isEmpty){
      this.mutate(row)
    }else if(row.iRow < this.value.iRow){
      this.left.insert(row)
    }else{
      this.right.insert(row)
    }
    return this.equilibrium()
  }

  /**Remove the given row element, based on its iRow property.
   * */
  remove(row){
    if(this.isEmpty){
      throw new Error(`Couldn't remove RowProxy(iRow=${ row.iRow }): not in the Avl.`)
    }

    if(row.iRow < this.value.iRow){
      this.left.remove(row)

    }else if(this.value.iRow < row.iRow){
      this.right.remove(row)

    }else if(!this.isLeaf){
      // Choose the deepest side for extraction (more likely to avoid rotations / possible
      // because there are no duplicates in the tree):
      const first  = SIDE[ this.balance < 0 ? LEFT : RIGHT ]
      const then   = OTHER_SIDE[first]
      const newVal = this[first]._extract(then)
      this.value   = newVal

    }else{
      return this.mutate()    // Just remove the leaves...
    }
    return this.equilibrium()
  }

  /**Extract the minimum ('left') or maximum ('right') RowProxy of the current Avl, depending
   * on the given @(direction, and returns the extracted RowProxy instance.
   * Automatically balance the branch on the way up.
   * */
  _extract(direction){
    // Defensive: contract verification
    // if(this.isEmpty){
    //   throw new Error(`Cannot extract from empty tree.`)
    // }
    let out, next = this[direction]
    if(!next.isEmpty){
      out = next._extract(direction)

    }else{
      out = this.value
      const otherSide = OTHER_SIDE[direction]
      const next = this[otherSide]
      this.mutate(next.value, next.left, next.right)
    }
    this.equilibrium()
    return out
  }


  _rotate(isLeft, A, B, C, D, E){
    const b=B.value, c=C.value
    B.mutate(c, ...(isLeft ? [C,E] : [E,C]) )
    C.mutate(b, ...(isLeft ? [A,D] : [D,A]) )
  }

  /**Automatically reorganize the tree, enforcing the AVL contracts.
   * Rotations are performed using these notations for rotation to the left:
   *
   *        (B)                (C)         (X) -> Avl instance that is mutated (stays as "root").
   *       /   \              /   \
   *      A    [C]    =>    {B}    E       [X] -> Avl instance moved to become {X}.
   *           / \          / \
   *          D   E        A   D            X  -> Avl|undefined nodes, moved during the process.
   *
   * NOTES:
   *    - The chosen implementation guarantees A,D and E will always exists (being Avl or undefined).
   *    - The right rotation applies the very same logic, but reversing the letters and the
   *      left/right properties, in the implementation.
   *
   * Heights-wise:
   *                      h+2                h+2
   *                     /   \              /   \
   *  deltaH == 2 ->   h-1   h+1    =>    h+1    h    <- deltaH == 1
   *                         / \          / \
   *                        h   h       h-1  h        <- deltaH == 1
   *
   * BUT, still needs to recompute heights, because the following may happen:
   *
   *        h+2                     h+1
   *          \                    /   \
   *          h+1       ->        h     h
   *            \
   *             h
   * */
  equilibrium(){
    if(this.isEmpty) return this

    // Defensive: contract verification
    // if(Math.abs(this.balance) > 2){
    //   throw new Error(`Balance is too big on iRow=${ this.value.iRow }: ${ this.balance }`)
    // }
    const balance = this.balance
    if(balance == 2){             // Rotate left
      this._rotate(true, this.left, this, this.right, this.right.left, this.right.right)
    }else if(balance == -2){      // Rotate right
      this._rotate(false, this.right, this, this.left, this.left.right, this.left.left)
    }
    this._updateStates()    //*
    return this             /*/
    // Defensive: contract verification
    if(Math.abs(this.balance) > 1) throw new Error(
      'The Avl should always be balanced enough at this point. Error on iRow='
      + (this.value ? this.value.iRow:"??") + ' with balance='+this.balance
    )
    return this             //*/
  }


  /**Testing purpose.
   * */
  toString(){
    if(this.isEmpty) return '∅'

    const lines = []
    const visit = (node, prefix, branch) => {
      if (node.isEmpty) return
      const childPrefix = prefix + '   '
      visit(node.right, childPrefix, '┌─ ')
      lines.push(`${prefix}${branch}\x1b[33;1m${node.value.iRow}\x1b[0m (h=${node.h}, b=${node.balance}, N=${node.nTree})`)
      visit(node.left,  childPrefix, '└─ ')
    }
    visit(this, '', '')
    return "---\nTree:\n" + lines.join('\n') + "\n---"
  }

  /**Testing purpose: yields the Avl instances.
   * */
  *_dfs(){
    if(!this.isEmpty){
      yield* this.left._dfs()
      yield  this
      yield* this.right._dfs()
    }
  }
}
