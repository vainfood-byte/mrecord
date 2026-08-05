export function insertTextAtCursor(editor, text) {
  if (!editor || !text) return false
  editor.focus()

  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) {
      range.deleteContents()
      range.insertNode(document.createTextNode(text))
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
      return true
    }
  }

  editor.appendChild(document.createTextNode(text))
  return true
}
