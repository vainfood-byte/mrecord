import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { countByTraceSource } from '../../utils/recordHelpers'
import {
  countByTraceWidget,
  countKeywordRecords,
  countPropertyRecords,
  cycleTraceGraphColorMode,
  getKeywordsForProperty,
  getPropertyField,
  getTopTagStat,
  isLegacyTraceWidget,
  resolveTraceWidget,
  widgetKeywordNone
} from '../../utils/traceHelpers'
import { TraceCoverBlock } from '../detail/CoverBlock'
import TraceGraphPaletteButton from '../trace/TraceGraphPaletteButton'
import TraceStatGraph from '../trace/TraceStatGraph'
function TraceWidgetDialog({ widget, onClose, onSave, onDelete }) {
  const { state } = useApp()
  const isEdit = Boolean(widget?.id)
  const legacy = isLegacyTraceWidget(widget)
  const propertyFields = state.settings.propertyFields || []

  const initialFieldId =
    widget?.sourceId ||
    propertyFields.find((f) => f.type === 'tags')?.id ||
    propertyFields[0]?.id ||
    ''

  const [sourceId, setSourceId] = useState(initialFieldId)
  const [keywordId, setKeywordId] = useState(widget?.keywordId ?? widgetKeywordNone())
  const [formatType, setFormatType] = useState(widget?.formatType || 'number')
  const [prefixText, setPrefixText] = useState(widget?.prefixText || '')
  const [suffixText, setSuffixText] = useState(widget?.suffixText || '권의 책을 읽었어요')
  const [statPrefixText, setStatPrefixText] = useState(widget?.statPrefixText || '가장 많이 읽은 장르는')
  const [statSuffixText, setStatSuffixText] = useState(widget?.statSuffixText || '예요')
  const [graphType, setGraphType] = useState(widget?.graphType || 'none')
  const [graphColorMode, setGraphColorMode] = useState(widget?.graphColorMode || 'theme')
  const [graphColorSeed, setGraphColorSeed] = useState(widget?.graphColorSeed || 0)
  const [coverUrl, setCoverUrl] = useState(widget?.coverUrl || '')
  const [propExpanded, setPropExpanded] = useState(true)

  const selectedField = getPropertyField(propertyFields, sourceId)
  const keywords = useMemo(
    () => getKeywordsForProperty(state.records, state.tags, selectedField, propertyFields),
    [state.records, state.tags, selectedField, propertyFields]
  )

  const propertyCounts = useMemo(
    () =>
      propertyFields.map((f) => ({
        field: f,
        count: countPropertyRecords(state.records, state.tags, f.id, propertyFields)
      })),
    [propertyFields, state.records, state.tags]
  )

  const keywordOptions = useMemo(() => {
    const noneCount = countKeywordRecords(
      state.records,
      state.tags,
      sourceId,
      widgetKeywordNone(),
      propertyFields
    )
    const items = keywords.map((kw) => ({
      ...kw,
      count: countKeywordRecords(state.records, state.tags, sourceId, kw.id, propertyFields)
    }))
    return [{ id: widgetKeywordNone(), name: '선택 안함', count: noneCount }, ...items]
  }, [keywords, sourceId, state.records, state.tags, propertyFields])

  const previewWidget = {
    sourceId,
    keywordId,
    formatType,
    prefixText,
    suffixText,
    statPrefixText,
    statSuffixText,
    graphType
  }

  const previewCount = countByTraceWidget(state.records, state.tags, previewWidget, propertyFields)
  const previewStat = formatType === 'stat'
    ? getTopTagStat(state.records, state.tags, sourceId, keywordId, propertyFields, state.settings)
    : null
  const canUseStat = selectedField?.type === 'tags'

  const cycleGraphColors = () => {
    setGraphColorMode((prev) => cycleTraceGraphColorMode(prev))
    setGraphColorSeed((prev) => prev + 1)
  }

  const handleFieldSelect = (fieldId) => {    setSourceId(fieldId)
    setKeywordId(widgetKeywordNone())
    const field = getPropertyField(propertyFields, fieldId)
    if (field?.type !== 'tags' && formatType === 'stat') setFormatType('number')
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
    >
      <div
        data-trace-dialog
        className="max-h-[90vh] w-96 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{isEdit ? '흔적 박스 편집' : '흔적 박스 추가'}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>

        {legacy && (
          <p className="mb-3 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-800">
            이전 형식 위젯입니다. 저장하면 새 속성·키워드 형식으로 변환됩니다.
          </p>
        )}

        <div className="mb-3">
          <button
            type="button"
            onClick={() => setPropExpanded(!propExpanded)}
            className="mb-1 flex w-full items-center justify-between text-xs font-medium text-[var(--color-text-muted)]"
          >
            <span>속성</span>
            {propExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {propExpanded && (
            <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--color-border)] p-1">
              {propertyCounts.map(({ field, count }) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => handleFieldSelect(field.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                    sourceId === field.id
                      ? 'bg-[var(--color-accent)]/15 font-medium text-[var(--color-accent)]'
                      : 'hover:bg-black/5'
                  }`}
                >
                  <span>{field.label}</span>
                  <span className="text-[var(--color-text-muted)]">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">키워드</label>
        <select
          value={keywordId}
          onChange={(e) => setKeywordId(e.target.value)}
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
        >
          {keywordOptions.map((kw) => (
            <option key={kw.id} value={kw.id}>
              {kw.name} ({kw.count})
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">형식</label>
        <div className="mb-3 flex gap-1">
          <button
            type="button"
            onClick={() => setFormatType('number')}
            className={`flex-1 rounded-lg border py-1.5 text-xs ${
              formatType === 'number'
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'border-[var(--color-border)]'
            }`}
          >
            숫자
          </button>
          <button
            type="button"
            onClick={() => canUseStat && setFormatType('stat')}
            disabled={!canUseStat}
            title={canUseStat ? '' : '태그형 속성에서만 사용 가능'}
            className={`flex-1 rounded-lg border py-1.5 text-xs ${
              formatType === 'stat'
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'border-[var(--color-border)]'
            } ${!canUseStat ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            통계
          </button>
        </div>

        {formatType === 'number' ? (
          <>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">앞 문구 (선택)</label>
            <input
              value={prefixText}
              onChange={(e) => setPrefixText(e.target.value)}
              className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
              placeholder="예: 로맨스"
            />
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">뒤 문구</label>
            <input
              value={suffixText}
              onChange={(e) => setSuffixText(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
              placeholder="권의 책을 읽었어요"
            />
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">앞 문구</label>
            <input
              value={statPrefixText}
              onChange={(e) => setStatPrefixText(e.target.value)}
              className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
              placeholder="가장 많이 읽은 장르는"
            />
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">뒤 문구</label>
            <input
              value={statSuffixText}
              onChange={(e) => setStatSuffixText(e.target.value)}
              className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
              placeholder="예요"
            />
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">그래프</label>
            <select
              value={graphType}
              onChange={(e) => setGraphType(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
            >
              <option value="none">아이콘 이미지</option>
              <option value="pie">원형 그래프</option>
              <option value="bar">막대 그래프</option>
            </select>
          </>
        )}

        {formatType === 'stat' && graphType !== 'none' ? (
          <div className="relative mb-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2">
            <div className="flex justify-center">
              <TraceStatGraph
                distribution={previewStat?.distribution || []}
                type={graphType}
                size={120}
                graphColorMode={graphColorMode}
                graphColorSeed={graphColorSeed}
              />
            </div>
            <TraceGraphPaletteButton mode={graphColorMode} onCycle={cycleGraphColors} />
          </div>
        ) : (          <div className="mb-3 overflow-hidden rounded-lg border border-[var(--color-border)]">
            <TraceCoverBlock
              coverUrl={coverUrl}
              placeholder="아이콘 이미지"
              onChange={setCoverUrl}
              onDelete={() => setCoverUrl('')}
            />
          </div>
        )}

        <p className="mb-3 rounded-lg bg-[var(--color-bg)] p-2 text-center text-xs leading-relaxed">
          {formatType === 'stat' && previewStat ? (
            <>
              {statPrefixText && <span>{statPrefixText} </span>}
              <span className="font-bold">
                {previewStat.tag}({previewStat.percent}%)
              </span>
              {statSuffixText && <span> {statSuffixText}</span>}
            </>
          ) : (
            <>
              {prefixText && <span>{prefixText} </span>}
              <span className="font-bold">{previewCount}</span>
              {suffixText && <span> {suffixText}</span>}
            </>
          )}
        </p>

        <div className="flex gap-2">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center justify-center rounded-lg border border-red-300 px-3 py-2 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onSave({
                id: widget?.id || `trace-${Date.now()}`,
                type: 'stat',
                coverUrl,
                sourceId,
                keywordId,
                formatType,
                prefixText,
                suffixText,
                statPrefixText,
                statSuffixText,
                graphType,
                graphColorMode,
                graphColorSeed
              })            }
            className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-white hover:opacity-90"
          >
            저장하기
          </button>
        </div>
      </div>
    </div>
  )
}

function TraceWidgetDisplay({
  widget,
  onEditContext,
  dragging,
  dragHandleProps,
  onDragOver,
  onDrop,
  onDragEnd
}) {
  const { state, dispatch } = useApp()
  const propertyFields = state.settings.propertyFields || []
  const w = resolveTraceWidget(widget)

  const count = useMemo(
    () =>
      isLegacyTraceWidget(widget)
        ? countByTraceSource(state.records, state.tags, widget.sourceType, widget.sourceId)
        : countByTraceWidget(state.records, state.tags, w, propertyFields),
    [state.records, state.tags, widget, w, propertyFields]
  )

  const stat = useMemo(
    () =>
      w.formatType === 'stat'
        ? getTopTagStat(state.records, state.tags, w.sourceId, w.keywordId, propertyFields, state.settings)
        : null,
    [state.records, state.tags, w, propertyFields, state.settings]
  )

  const showGraph = w.formatType === 'stat' && w.graphType !== 'none' && stat

  const cycleGraphColors = () => {
    dispatch({
      type: 'UPDATE_TRACE_WIDGET',
      payload: {
        id: widget.id,
        data: {
          graphColorMode: cycleTraceGraphColorMode(w.graphColorMode),
          graphColorSeed: (w.graphColorSeed || 0) + 1
        }
      }
    })
  }

  return (    <div
      data-trace-widget
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        onEditContext()
      }}
      className={`relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] ${
        dragging ? 'opacity-50' : ''
      }`}
      title="드래그: 순서 변경 · 우클릭: 편집"
    >
      <div
        {...dragHandleProps}
        className="absolute left-1 top-1 z-10 cursor-grab rounded bg-black/10 p-0.5 text-[var(--color-text-muted)] active:cursor-grabbing"
        title="드래그하여 순서 변경"
      >
        <GripVertical size={12} />
      </div>
      {showGraph ? (
        <div className="relative bg-[var(--color-bg)] p-2">
          <div className="flex justify-center">
            <TraceStatGraph
              distribution={stat.distribution}
              type={w.graphType}
              size={120}
              graphColorMode={w.graphColorMode}
              graphColorSeed={w.graphColorSeed}
            />
          </div>
          <TraceGraphPaletteButton mode={w.graphColorMode} onCycle={cycleGraphColors} />
        </div>
      ) : (        <TraceCoverBlock
          coverUrl={w.coverUrl}
          placeholder=""
          onChange={(url) =>
            dispatch({
              type: 'UPDATE_TRACE_WIDGET',
              payload: { id: widget.id, data: { coverUrl: url } }
            })
          }
          onDelete={() =>
            dispatch({
              type: 'UPDATE_TRACE_WIDGET',
              payload: { id: widget.id, data: { coverUrl: '' } }
            })
          }
        />
      )}
      <div className="p-2 text-center text-xs leading-snug">
        {w.formatType === 'stat' && stat ? (
          <>
            {w.statPrefixText && <span>{w.statPrefixText} </span>}
            <span className="font-bold">
              {stat.tag}({stat.percent}%)
            </span>
            {w.statSuffixText && <span> {w.statSuffixText}</span>}
          </>
        ) : (
          <>
            {w.prefixText && <span>{w.prefixText} </span>}
            <span className="font-bold">{count}</span>
            {w.suffixText && <span> {w.suffixText}</span>}
          </>
        )}
      </div>
    </div>
  )
}

export default function TraceBox() {
  const { state, dispatch } = useApp()
  const [hoverBar, setHoverBar] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const collapsed = state.settings.traceBoxCollapsed
  const widgets = (state.settings.traceWidgets || []).filter((w) => w.type === 'stat')
  const editWidget = widgets.find((w) => w.id === state.traceEditId)

  const toggleTraceBox = () => dispatch({ type: 'TOGGLE_TRACE_BOX' })

  const handleDrop = (toId) => {
    if (dragIdx === null) return
    const fromWidget = widgets[dragIdx]
    if (!fromWidget || fromWidget.id === toId) return
    dispatch({ type: 'REORDER_TRACE_WIDGETS', payload: { id: fromWidget.id, toId } })
    setDragIdx(null)
  }

  const handlePanelClick = (e) => {
    if (e.target.closest('[data-trace-widget]')) return
    if (e.target.closest('[data-trace-toggle]')) return
    toggleTraceBox()
  }

  return (
    <>
      <aside
        data-export-hide
        data-trace-box
        className={`relative hidden shrink-0 cursor-pointer flex-col border-l border-[var(--color-border)] bg-[var(--color-sidebar)] transition-all xl:flex ${
          collapsed ? 'w-3' : 'w-[200px]'
        }`}
        onClick={handlePanelClick}
        onMouseEnter={() => setHoverBar(true)}
        onMouseLeave={() => setHoverBar(false)}
        title={collapsed ? '클릭하여 펼치기' : '빈 영역 클릭하여 접기'}
      >
        <button
          type="button"
          data-trace-toggle
          onClick={(e) => {
            e.stopPropagation()
            toggleTraceBox()
          }}
          className={`absolute -left-3 top-1/2 z-10 flex h-12 w-3 -translate-y-1/2 cursor-pointer flex-col items-center justify-center rounded-l-md border border-r-0 border-[var(--color-border)] bg-[var(--color-bg-panel)] transition-opacity ${
            hoverBar || collapsed ? 'opacity-100' : 'opacity-0'
          }`}
          title={collapsed ? '펼치기' : '접기'}
        >
          {collapsed ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
        </button>

        {!collapsed && (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {widgets.map((w, idx) => (
              <TraceWidgetDisplay
                key={w.id}
                widget={w}
                dragging={dragIdx === idx}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: (e) => {
                    e.stopPropagation()
                    setDragIdx(idx)
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(w.id)
                }}
                onDragEnd={() => setDragIdx(null)}
                onEditContext={() => dispatch({ type: 'SET_TRACE_EDIT', payload: w.id })}
              />
            ))}

            <button
              type="button"
              data-trace-widget
              onClick={(e) => {
                e.stopPropagation()
                dispatch({ type: 'SET_TRACE_ADD_OPEN', payload: true })
              }}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-black/5"
            >
              <Plus size={24} />
            </button>
          </div>
        )}
      </aside>

      {state.traceAddOpen && (
        <TraceWidgetDialog
          onClose={() => dispatch({ type: 'SET_TRACE_ADD_OPEN', payload: false })}
          onSave={(widget) => dispatch({ type: 'ADD_TRACE_WIDGET', payload: widget })}
        />
      )}

      {editWidget && (
        <TraceWidgetDialog
          widget={editWidget}
          onClose={() => dispatch({ type: 'SET_TRACE_EDIT', payload: null })}
          onSave={(widget) => {
            dispatch({ type: 'UPDATE_TRACE_WIDGET', payload: { id: widget.id, data: widget } })
            dispatch({ type: 'SET_TRACE_EDIT', payload: null })
          }}
          onDelete={() => {
            dispatch({ type: 'DELETE_TRACE_WIDGET', payload: editWidget.id })
            dispatch({ type: 'SET_TRACE_EDIT', payload: null })
          }}
        />
      )}
    </>
  )
}
