/** contentEditable 본문 — 글자 크기 적용 (중첩 font 태그 정리) */

import { resolveEditBoxFontStack } from '../data/propertyTypes'

function stripFontSizeFromFragment(fragment) {
  fragment.querySelectorAll('font').forEach((font) => {
    font.removeAttribute('size')
    font.style.fontSize = ''
  })
  fragment.querySelectorAll('[style]').forEach((el) => {
    el.style.fontSize = ''
    el.style.removeProperty('font-size')
  })
}

function hasBackgroundStyle(el) {
  if (!el?.style) return false
  const bg = el.style.backgroundColor || el.style.background
  return Boolean(bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)')
}

/** 배경 하이라이트 영역도 글자 크기에 맞게 확장 */
function applyFontSizeDeep(root, size) {
  if (!root) return
  const walk = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node
    el.style.fontSize = size
    if (hasBackgroundStyle(el)) {
      el.style.lineHeight = 'inherit'
      el.style.display = 'inline'
      el.style.boxDecorationBreak = 'clone'
      el.style.webkitBoxDecorationBreak = 'clone'
    }
    el.childNodes.forEach(walk)
  }
  walk(root)
}

export function applyEditorFontSize(editor, sizePx) {
  if (!editor) return

  editor.focus()
  const sel = window.getSelection()
  if (!sel?.rangeCount) return

  const range = sel.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return

  const size = `${sizePx}px`

  if (sel.isCollapsed) {
    document.execCommand('fontSize', false, '7')
    editor.querySelectorAll('font[size="7"]').forEach((font) => {
      font.removeAttribute('size')
      font.style.fontSize = size
    })
    let node = sel.anchorNode
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement
    while (node && node !== editor) {
      if (node.style?.fontSize) node.style.fontSize = size
      if (hasBackgroundStyle(node)) {
        node.style.lineHeight = 'inherit'
        node.style.display = 'inline'
      }
      node = node.parentElement
    }
    return
  }

  const extracted = range.extractContents()
  stripFontSizeFromFragment(extracted)

  const span = document.createElement('span')
  span.style.fontSize = size
  span.appendChild(extracted)
  applyFontSizeDeep(span, size)
  range.insertNode(span)

  const next = document.createRange()
  next.selectNodeContents(span)
  sel.removeAllRanges()
  sel.addRange(next)
}

function stripFontFamilyFromFragment(fragment) {
  fragment.querySelectorAll('font').forEach((font) => {
    font.removeAttribute('face')
  })
  fragment.querySelectorAll('[style]').forEach((el) => {
    el.style.fontFamily = ''
    el.style.removeProperty('font-family')
  })
}

function applyFontFamilyDeep(root, stack) {
  if (!root) return
  const walk = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    node.style.fontFamily = stack
    node.childNodes.forEach(walk)
  }
  walk(root)
}

function normalizeLegacyFontTags(editor) {
  editor?.querySelectorAll('font[face]').forEach((font) => {
    const face = font.getAttribute('face')
    if (!face) return
    const span = document.createElement('span')
    span.style.fontFamily = resolveEditBoxFontStack(face) || face
    while (font.firstChild) span.appendChild(font.firstChild)
    font.replaceWith(span)
  })
}

export function applyEditorFontFamily(editor, fontStack) {
  if (!editor || !fontStack) return

  editor.focus()
  normalizeLegacyFontTags(editor)

  const sel = window.getSelection()
  if (!sel?.rangeCount) return

  const range = sel.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return

  if (sel.isCollapsed) {
    const span = document.createElement('span')
    span.style.fontFamily = fontStack
    span.appendChild(document.createTextNode('\u200B'))
    range.insertNode(span)
    const caret = document.createRange()
    caret.setStart(span.firstChild, 1)
    caret.collapse(true)
    sel.removeAllRanges()
    sel.addRange(caret)
    return
  }

  const extracted = range.extractContents()
  stripFontFamilyFromFragment(extracted)

  const span = document.createElement('span')
  span.style.fontFamily = fontStack
  span.appendChild(extracted)
  applyFontFamilyDeep(span, fontStack)
  range.insertNode(span)

  const next = document.createRange()
  next.selectNodeContents(span)
  sel.removeAllRanges()
  sel.addRange(next)
}

function stripBackgroundFromFragment(fragment) {
  fragment.querySelectorAll('[style]').forEach((el) => {
    el.style.background = ''
    el.style.backgroundColor = ''
    el.style.removeProperty('background')
    el.style.removeProperty('background-color')
  })
  fragment.querySelectorAll('mark').forEach((mark) => {
    mark.style.background = ''
    mark.style.backgroundColor = ''
  })
}

function applyBackgroundDeep(root, color) {
  if (!root) return
  const walk = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (node.tagName === 'IMG') return
    node.style.backgroundColor = color
    node.style.boxDecorationBreak = 'clone'
    node.style.webkitBoxDecorationBreak = 'clone'
    node.childNodes.forEach(walk)
  }
  walk(root)
}

/** contentEditable 본문 — 선택 영역 텍스트 배경색 (글자크기/글꼴과 동일하게 span 적용) */
export function applyEditorBackgroundColor(editor, color) {
  if (!editor || !color) return

  editor.focus()
  const sel = window.getSelection()
  if (!sel?.rangeCount) return

  const range = sel.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return

  if (sel.isCollapsed) {
    try {
      document.execCommand('styleWithCSS', false, true)
      if (!document.execCommand('hiliteColor', false, color)) {
        document.execCommand('backColor', false, color)
      }
    } catch {
      /* ignore */
    }
    return
  }

  const extracted = range.extractContents()
  stripBackgroundFromFragment(extracted)

  const span = document.createElement('span')
  span.style.backgroundColor = color
  span.style.boxDecorationBreak = 'clone'
  span.style.webkitBoxDecorationBreak = 'clone'
  span.appendChild(extracted)
  applyBackgroundDeep(span, color)
  range.insertNode(span)

  const next = document.createRange()
  next.selectNodeContents(span)
  sel.removeAllRanges()
  sel.addRange(next)
}
