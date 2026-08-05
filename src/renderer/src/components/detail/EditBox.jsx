import { useRef, useState, useCallback, useEffect, memo } from 'react'

import {

  AlignCenter,

  AlignLeft,

  AlignRight,

  Bold,

  ChevronDown,

  ChevronUp,

  Image as ImageIcon,

  Italic,

  Link,

  List,

  ListOrdered,

  Smile,

  Strikethrough,

  Trash2,

  Type,

  Underline,

  X

} from 'lucide-react'

import { FONT_SIZE_OPTIONS, EDIT_BOX_FONT_OPTIONS, resolveEditBoxFontStack } from '../../data/propertyTypes'

import ColorPickerPopover from '../ui/ColorPickerPopover'

import CharInsertMenu from '../ui/CharInsertMenu'
import { insertTextAtCursor } from '../../utils/insertTextAtCursor'

import { applyEditorFontSize, applyEditorFontFamily } from '../../utils/reviewFormatHelpers'



function TextColorIcon({ color }) {

  return (

    <span className="relative inline-flex h-6 w-6 items-center justify-center">

      <Type size={13} />

      <span

        className="absolute bottom-0 right-0 h-2 w-2 rounded-sm border border-[var(--color-border)]"

        style={{ backgroundColor: color }}

      />

    </span>

  )

}



function BgColorIcon({ color }) {

  return (

    <span

      className="inline-flex h-6 w-6 items-center justify-center rounded border-2 border-[var(--color-border)] text-[11px] font-serif font-bold leading-none"

      style={{ backgroundColor: color }}

    >

      T

    </span>

  )

}



function revokeIfBlobUrl(src) {
  if (typeof src === 'string' && src.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(src)
    } catch {
      /* ignore */
    }
  }
}

function EditBox({

  images = [],

  onImagesChange,

  editorRef,

  onContentChange,

  collapsed,

  onToggleCollapse,

  docked = false,

  editing = true,

  pruneEpoch = 0,

  chapterKey = ''

}) {

  const [textColor, setTextColor] = useState('#3D3830')

  const [bgColor, setBgColor] = useState('#FFFFFF')

  const [fontSize, setFontSize] = useState(14)

  const [fontFamily, setFontFamily] = useState(EDIT_BOX_FONT_OPTIONS[0].value)

  const [colorPicker, setColorPicker] = useState(null)

  const [charMenu, setCharMenu] = useState(null)

  const imageInputRef = useRef(null)

  const scrollRef = useRef(null)

  const savedRangeRef = useRef(null)

  const imagesRef = useRef(images)

  const onImagesChangeRef = useRef(onImagesChange)

  imagesRef.current = images

  onImagesChangeRef.current = onImagesChange

  /** 감상박스 [저장] 시: 본문에 없는 미사용 임시 이미지만 목록에서 제거 + blob URL 해제 */
  useEffect(() => {
    if (!pruneEpoch) return
    const htmlRoot = editorRef?.current
    const list = imagesRef.current || []
    if (!list.length) return

    const used = new Set()
    if (htmlRoot) {
      htmlRoot.querySelectorAll('img').forEach((img) => {
        const attr = img.getAttribute('src')
        if (attr) used.add(attr)
        if (img.src) used.add(img.src)
        if (img.currentSrc) used.add(img.currentSrc)
      })
    }

    const next = []
    let removed = false
    for (const src of list) {
      if (src && (used.has(src) || (htmlRoot?.innerHTML || '').includes(src))) {
        next.push(src)
      } else {
        removed = true
        revokeIfBlobUrl(src)
      }
    }
    if (removed) onImagesChangeRef.current?.(next)
  }, [pruneEpoch, editorRef])

  /** 회차 변경 시 편집박스 로컬 UI만 경량 리셋 (blob 해제는 감상박스 chapter cleanup에서 수행) */
  useEffect(() => {
    setColorPicker(null)
    setCharMenu(null)
    savedRangeRef.current = null
  }, [chapterKey])

  const captureEditorSelection = () => {
    const editor = editorRef.current
    const sel = window.getSelection()
    if (!editor || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange()
    }
  }

  const restoreEditorSelection = () => {
    const editor = editorRef.current
    const saved = savedRangeRef.current
    if (!editor || !saved) return false
    if (!editor.contains(saved.commonAncestorContainer)) return false
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(saved)
    return true
  }



  const handleWheel = (e) => {

    const el = scrollRef.current

    if (!el) return

    const { scrollTop, scrollHeight, clientHeight } = el

    if (scrollHeight <= clientHeight) return

    const atTop = scrollTop <= 0

    const atBottom = scrollTop + clientHeight >= scrollHeight - 1

    if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {

      e.stopPropagation()

    }

  }



  const exec = (cmd, val = null) => {
    if (!editing) return

    editorRef.current?.focus()

    document.execCommand(cmd, false, val)

    onContentChange?.()

  }



  const execFontSize = (size) => {
    if (!editing) return

    setFontSize(size)

    const editor = editorRef.current

    if (!editor) return

    applyEditorFontSize(editor, size)

    onContentChange?.()

  }



  const execFontFamily = (family) => {
    if (!editing) return

    setFontFamily(family)

    const editor = editorRef.current

    if (!editor) return

    applyEditorFontFamily(editor, resolveEditBoxFontStack(family))

    onContentChange?.()

  }



  const insertAtCursor = (text) => {
    if (!editing) return
    const editor = editorRef.current
    if (!editor) return
    restoreEditorSelection()
    insertTextAtCursor(editor, text)
    onContentChange?.()
  }

  const closeCharMenu = useCallback(() => setCharMenu(null), [])

  const openCharMenu = (mode, e) => {
    if (!editing) return
    captureEditorSelection()
    setColorPicker(null)
    const rect = e.currentTarget.getBoundingClientRect()
    setCharMenu({
      mode,
      x: rect.left,
      y: rect.bottom + 4
    })
  }



  const addLink = () => {

    const url = prompt('링크 URL (https://...)')

    if (!url) return

    exec('createLink', url.startsWith('http') ? url : `https://${url}`)

  }



  const handleDragStart = (e, src) => {

    e.dataTransfer.setData('text/plain', src)

    e.dataTransfer.effectAllowed = 'copy'

  }



  const removeImage = (index) => {
    if (!editing) return
    const target = images[index]
    revokeIfBlobUrl(target)
    onImagesChange?.(images.filter((_, i) => i !== index))

  }



  const clearAllImages = () => {
    if (!editing) return

    if (!images.length) return

    if (!window.confirm('편집 박스 목록의 이미지를 모두 삭제할까요?\n(감상 본문의 이미지는 유지됩니다)')) return

    images.forEach(revokeIfBlobUrl)
    onImagesChange?.([])

  }



  const attachImage = (e) => {
    if (!editing) return

    const fileList = e.target.files

    if (!fileList?.length) return

    const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith('image/'))

    if (!imageFiles.length) return

    Promise.all(

      imageFiles.map(

        (file) =>

          new Promise((resolve, reject) => {

            const reader = new FileReader()

            reader.onload = () => {

              if (typeof reader.result === 'string') resolve(reader.result)

              else reject(new Error('invalid image'))

            }

            reader.onerror = () => reject(reader.error)

            reader.readAsDataURL(file)

          })

      )

    )

      .then((results) => {

        onImagesChange?.([...images, ...results])

      })

      .catch(() => {})

    e.target.value = ''

  }



  return (

    <div

      className={`border-t border-[var(--color-border)] bg-[var(--color-bg)] ${

        docked ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-b-xl' : ''

      }`}

      data-export-exclude="true"

      data-edit-box="true"

    >

      {!docked && (

        <button

          type="button"

          onClick={onToggleCollapse}

          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:bg-black/[0.03]"

        >

          <span>편집 박스</span>

          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}

        </button>

      )}



      {(docked || !collapsed) && (

        <div

          ref={scrollRef}

          onWheel={handleWheel}

          className={`space-y-2 px-3 ${

            docked

              ? 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-3'

              : 'max-h-[min(50vh,360px)] overflow-y-auto overscroll-y-contain pb-3'

          } ${editing ? '' : 'pointer-events-none opacity-50'}`}

          aria-disabled={!editing}

          title={editing ? undefined : '감상박스에서 [편집]을 눌러 활성화하세요'}

        >

          <div
            className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1"
            style={{ WebkitAppRegion: 'no-drag' }}
          >

            <button type="button" onClick={() => exec('bold')} className="rounded p-1.5 hover:bg-black/5" title="굵게"><Bold size={13} /></button>

            <button type="button" onClick={() => exec('italic')} className="rounded p-1.5 hover:bg-black/5" title="기울임"><Italic size={13} /></button>

            <button type="button" onClick={() => exec('underline')} className="rounded p-1.5 hover:bg-black/5" title="밑줄"><Underline size={13} /></button>

            <button type="button" onClick={() => exec('strikeThrough')} className="rounded p-1.5 hover:bg-black/5" title="취소선"><Strikethrough size={13} /></button>

            <span className="mx-0.5 h-4 w-px bg-[var(--color-border)]" />

            <button type="button" onClick={() => exec('justifyLeft')} className="rounded p-1.5 hover:bg-black/5"><AlignLeft size={13} /></button>

            <button type="button" onClick={() => exec('justifyCenter')} className="rounded p-1.5 hover:bg-black/5"><AlignCenter size={13} /></button>

            <button type="button" onClick={() => exec('justifyRight')} className="rounded p-1.5 hover:bg-black/5"><AlignRight size={13} /></button>

            <span className="mx-0.5 h-4 w-px bg-[var(--color-border)]" />

            <button type="button" onClick={addLink} className="rounded p-1.5 hover:bg-black/5" title="하이퍼링크"><Link size={13} /></button>

            <button type="button" onClick={() => exec('insertUnorderedList')} className="rounded p-1.5 hover:bg-black/5" title="글머리"><List size={13} /></button>

            <button type="button" onClick={() => exec('insertOrderedList')} className="rounded p-1.5 hover:bg-black/5" title="번호"><ListOrdered size={13} /></button>

            <select value={fontSize} onChange={(e) => execFontSize(Number(e.target.value))} className="ml-1 rounded border border-[var(--color-border)] px-1 py-0.5 text-[10px]">

              {FONT_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}

            </select>

            <select
              value={fontFamily}
              onChange={(e) => execFontFamily(e.target.value)}
              className="ml-1 max-w-[4.5rem] rounded border border-[var(--color-border)] px-1 py-0.5 text-[10px]"
              title="글꼴"
            >
              {EDIT_BOX_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.stack }}>
                  {f.label}
                </option>
              ))}
            </select>

            <div className="ml-1 flex items-center gap-0.5">

              <button

                type="button"

                title="글자색"

                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setColorPicker({
                    kind: 'text',
                    x: rect.right,
                    y: rect.top,
                    anchorBottom: rect.bottom
                  })
                }}

                className="rounded p-0.5 hover:bg-black/5"

              >

                <TextColorIcon color={textColor} />

              </button>

            </div>

            <div className="flex items-center gap-0.5">

              <button

                type="button"

                title="배경색"

                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setColorPicker({
                    kind: 'bg',
                    x: rect.right,
                    y: rect.top,
                    anchorBottom: rect.bottom
                  })
                }}

                className="rounded p-0.5 hover:bg-black/5"

              >

                <BgColorIcon color={bgColor} />

              </button>

            </div>

            <span className="mx-0.5 h-4 w-px bg-[var(--color-border)]" />

            <button

              type="button"

              onPointerDown={(e) => e.preventDefault()}

              onClick={(e) => openCharMenu('special', e)}

              className="rounded px-1.5 py-1 text-[10px] hover:bg-black/5"

              title="특수문자"

            >

              #

            </button>

            <button

              type="button"

              onPointerDown={(e) => e.preventDefault()}

              onClick={(e) => openCharMenu('emoji', e)}

              className="rounded p-1.5 hover:bg-black/5"

              title="이모티콘"

            >

              <Smile size={13} />

            </button>

            <button

              type="button"

              onClick={() => imageInputRef.current?.click()}

              className="rounded p-1.5 hover:bg-black/5"

              title="이미지 첨부"

            >

              <ImageIcon size={13} />

            </button>

            <input

              ref={imageInputRef}

              type="file"

              accept="image/*"

              multiple

              className="hidden"

              onChange={attachImage}

            />

          </div>



          {colorPicker?.kind === 'text' && (

            <ColorPickerPopover
              value={textColor}
              x={colorPicker.x}
              y={colorPicker.y}
              anchorBottom={colorPicker.anchorBottom}
              layoutMode="split"
              showStandardPalette
              paletteOnly
              onChange={(hex) => {
                setTextColor(hex)
                exec('foreColor', hex)
              }}
              onClose={() => setColorPicker(null)}
            />

          )}

          {colorPicker?.kind === 'bg' && (

            <ColorPickerPopover
              value={bgColor}
              x={colorPicker.x}
              y={colorPicker.y}
              anchorBottom={colorPicker.anchorBottom}
              layoutMode="split"
              showStandardPalette
              paletteOnly
              onChange={(hex) => {
                setBgColor(hex)
                exec('hiliteColor', hex)
              }}
              onClose={() => setColorPicker(null)}
            />

          )}



          {charMenu && (

            <CharInsertMenu

              x={charMenu.x}

              y={charMenu.y}

              mode={charMenu.mode}

              onInsert={insertAtCursor}

              onClose={closeCharMenu}

            />

          )}



          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-2">

            <div className="mb-1.5 flex items-center justify-between">

              <p className="text-[10px] text-[var(--color-text-muted)]">

                <ImageIcon size={10} className="mr-1 inline" />

                첨부 이미지 — 본문으로 드래그

              </p>

              {images.length > 0 && (

                <button

                  type="button"

                  onClick={clearAllImages}

                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-500/10"

                  title="편집 박스 목록만 일괄 삭제"

                >

                  <Trash2 size={10} />

                  목록 일괄 삭제

                </button>

              )}

            </div>

            <div className="flex flex-wrap gap-2">

              {images.map((src, i) => (

                <div key={i} className="group relative">

                  <img

                    src={src}

                    alt=""

                    draggable={editing}

                    onDragStart={(e) => handleDragStart(e, src)}

                    className="h-16 w-16 cursor-grab rounded object-cover active:cursor-grabbing"

                    style={{ contain: 'layout paint', willChange: 'transform' }}

                  />

                  <button

                    type="button"

                    onClick={() => removeImage(i)}

                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100"

                    title="목록에서 제거"

                  >

                    <X size={10} />

                  </button>

                </div>

              ))}

              {images.length === 0 && (

                <span className="text-[10px] text-[var(--color-text-muted)]">Ctrl+V 또는 첨부 버튼으로 추가</span>

              )}

            </div>

          </div>

        </div>

      )}

    </div>

  )

}

export default memo(EditBox)


