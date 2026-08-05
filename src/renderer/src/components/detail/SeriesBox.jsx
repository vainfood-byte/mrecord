import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Layers, PenLine, Plus, Trash2, X } from 'lucide-react'
import { SERIES_UNITS } from '../../data/defaults'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'
import { useApp, useSelectedRecord } from '../../context/AppContext'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'
import DeleteConfirmDialog from '../ui/DeleteConfirmDialog'
import { flushPendingSaves } from '../../utils/storage'

function VolumeContextMenu({ x, y, onDelete, onClose }) {
  useEffect(() => {
    const ignoreTarget = (target) => target?.closest?.('[data-series-volume-menu]')

    const onPointerDown = (e) => {
      if (e.button === 2) return
      if (ignoreTarget(e.target)) return
      onClose()
    }
    const onContext = (e) => {
      if (ignoreTarget(e.target)) return
      onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('contextmenu', onContext, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('contextmenu', onContext, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 148)
  const top = Math.min(y, window.innerHeight - 80)

  return createPortal(
    <div
      data-series-volume-menu
      data-popup-root
      className="fixed min-w-[128px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{
        left,
        top,
        zIndex: OVERLAY_ABOVE_SIDE_PANEL,
        WebkitAppRegion: 'no-drag'
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
        onClick={() => {
          onDelete?.()
          onClose()
        }}
      >
        삭제하기
      </button>
    </div>,
    document.body
  )
}

export default function SeriesBox() {
  const { state, dispatch } = useApp()
  const record = useSelectedRecord()
  const unitRef = useRef(null)
  const [unitOpen, setUnitOpen] = useState(false)
  const [addingUnit, setAddingUnit] = useState(false)
  const [newUnit, setNewUnit] = useState('')
  const [editingUnit, setEditingUnit] = useState(null)
  const [editUnitValue, setEditUnitValue] = useState('')
  const [bulkCount, setBulkCount] = useState('')
  const [selectDeleteMode, setSelectDeleteMode] = useState(false)
  const [checkedVols, setCheckedVols] = useState([])
  const [volumeMenu, setVolumeMenu] = useState(null)
  const [pendingDeleteVols, setPendingDeleteVols] = useState(null)

  useOutsideDismiss(unitRef, unitOpen, () => {
    setUnitOpen(false)
    setAddingUnit(false)
    setNewUnit('')
    setEditingUnit(null)
  })

  useEffect(() => {
    setSelectDeleteMode(false)
    setCheckedVols([])
    setVolumeMenu(null)
    setPendingDeleteVols(null)
  }, [record?.id])

  useEffect(() => {
    if (!selectDeleteMode) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSelectDeleteMode(false)
        setCheckedVols([])
        setVolumeMenu(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectDeleteMode])

  if (!record) return null

  const series = record.series || { enabled: false, unit: '권', volumes: [1], disabledVolumes: [] }
  const disabledVolumes = series.disabledVolumes || []
  const customUnits = state.settings.customSeriesUnits || []
  const allUnits = [...SERIES_UNITS, ...customUnits.filter((u) => !SERIES_UNITS.includes(u))]

  const exitSelectDeleteMode = () => {
    setSelectDeleteMode(false)
    setCheckedVols([])
    setVolumeMenu(null)
  }

  const updateSeries = (patch, extraRecordPatch = {}) => {
    dispatch({
      type: 'UPDATE_RECORD',
      payload: { ...record, ...extraRecordPatch, series: { ...series, ...patch } }
    })
  }

  const migrateUnitOnRecords = (from, to) => {
    state.records.forEach((rec) => {
      if (rec.series?.unit === from) {
        dispatch({
          type: 'UPDATE_RECORD',
          payload: { ...rec, series: { ...rec.series, unit: to } }
        })
      }
    })
  }

  const addVolume = () => {
    const next = (series.volumes.at(-1) || 0) + 1
    updateSeries({ volumes: [...series.volumes, next] })
  }

  const addBulkVolumes = () => {
    const n = parseInt(bulkCount, 10)
    if (!n || n < 1 || n > 500) return
    const volumes = Array.from({ length: n }, (_, i) => i + 1)
    updateSeries({ volumes, disabledVolumes: disabledVolumes.filter((v) => v <= n) })
    setBulkCount('')
  }

  const toggleVolumeDisabled = (vol) => {
    const next = disabledVolumes.includes(vol)
      ? disabledVolumes.filter((v) => v !== vol)
      : [...disabledVolumes, vol]
    updateSeries({ disabledVolumes: next })
    if (disabledVolumes.includes(vol) === false && state.selectedVolume === vol) {
      flushPendingSaves()
      dispatch({ type: 'SET_VOLUME', payload: null })
    }
  }

  const applyDeleteVolumes = (vols) => {
    const targets = [...new Set(vols)].filter((v) => series.volumes.includes(v))
    if (!targets.length) return

    const remove = new Set(targets)
    const nextVolumes = series.volumes.filter((v) => !remove.has(v))
    const nextDisabled = disabledVolumes.filter((v) => !remove.has(v))
    const nextReviews = { ...(record.volumeReviews || {}) }
    targets.forEach((v) => {
      delete nextReviews[v]
    })

    flushPendingSaves()
    updateSeries(
      { volumes: nextVolumes.length ? nextVolumes : [], disabledVolumes: nextDisabled },
      { volumeReviews: nextReviews }
    )

    if (state.selectedVolume != null && remove.has(state.selectedVolume)) {
      dispatch({ type: 'SET_VOLUME', payload: null })
    }
    exitSelectDeleteMode()
    setPendingDeleteVols(null)
  }

  const deleteVolumes = (vols) => {
    const targets = [...new Set(vols)].filter((v) => series.volumes.includes(v))
    if (!targets.length) return

    setVolumeMenu(null)
    if (state.settings.confirmBeforeDeleteSeriesVolume === false) {
      applyDeleteVolumes(targets)
      return
    }
    setPendingDeleteVols(targets)
  }

  const confirmDeleteVolumes = (skipAsk) => {
    if (skipAsk) {
      dispatch({
        type: 'UPDATE_SETTINGS',
        payload: { confirmBeforeDeleteSeriesVolume: false }
      })
    }
    if (pendingDeleteVols?.length) applyDeleteVolumes(pendingDeleteVols)
    else setPendingDeleteVols(null)
  }

  const selectVolume = (vol) => {
    if (disabledVolumes.includes(vol)) return
    flushPendingSaves()
    dispatch({
      type: 'SET_VOLUME',
      payload: state.selectedVolume === vol ? null : vol
    })
  }

  const toggleCheckedVolume = (vol) => {
    setCheckedVols((prev) =>
      prev.includes(vol) ? prev.filter((v) => v !== vol) : [...prev, vol]
    )
  }

  const handleVolumeClick = (e, vol) => {
    if (selectDeleteMode) {
      e.preventDefault()
      toggleCheckedVolume(vol)
      return
    }
    selectVolume(vol)
  }

  const openVolumeMenu = (e, vol) => {
    e.preventDefault()
    e.stopPropagation()

    if (selectDeleteMode) {
      const targets = checkedVols.includes(vol)
        ? checkedVols.filter((v) => series.volumes.includes(v))
        : [vol]
      setVolumeMenu({
        x: e.clientX,
        y: e.clientY,
        targets: targets.length ? targets : [vol]
      })
      return
    }

    setVolumeMenu(null)
    toggleVolumeDisabled(vol)
  }

  const enterSelectDeleteMode = () => {
    setVolumeMenu(null)
    setSelectDeleteMode(true)
    setCheckedVols([])
  }

  const selectUnit = (unit) => {
    updateSeries({ unit })
    setUnitOpen(false)
  }

  const addCustomUnit = () => {
    const name = newUnit.trim()
    if (!name || allUnits.includes(name)) return
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { customSeriesUnits: [...customUnits, name] }
    })
    updateSeries({ unit: name })
    setNewUnit('')
    setAddingUnit(false)
    setUnitOpen(false)
  }

  const renameCustomUnit = (oldName) => {
    const name = editUnitValue.trim()
    if (!name || name === oldName) {
      setEditingUnit(null)
      return
    }
    if (allUnits.includes(name) && name !== oldName) return

    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        customSeriesUnits: customUnits.map((u) => (u === oldName ? name : u))
      }
    })
    migrateUnitOnRecords(oldName, name)
    if (series.unit === oldName) updateSeries({ unit: name })
    setEditingUnit(null)
    setEditUnitValue('')
  }

  const deleteCustomUnit = (name) => {
    if (!window.confirm(`"${name}" 단위를 삭제할까요?`)) return
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { customSeriesUnits: customUnits.filter((u) => u !== name) }
    })
    migrateUnitOnRecords(name, '권')
    if (series.unit === name) updateSeries({ unit: '권' })
    if (editingUnit === name) {
      setEditingUnit(null)
      setEditUnitValue('')
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={series.enabled}
            onChange={(e) => {
              flushPendingSaves()
              updateSeries({ enabled: e.target.checked })
              if (!e.target.checked) dispatch({ type: 'SET_VOLUME', payload: null })
              exitSelectDeleteMode()
            }}
          />
          시리즈
        </label>

        <div className="relative" ref={unitRef}>
          <button
            type="button"
            onClick={() => {
              setUnitOpen(!unitOpen)
              setAddingUnit(false)
              setNewUnit('')
              setEditingUnit(null)
            }}
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs hover:bg-black/5"
          >
            <Layers size={12} />
            {series.unit}
          </button>
          {unitOpen && (
            <div
              data-popup-root
              className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              {allUnits.map((unit) => {
                const isCustom = customUnits.includes(unit)
                if (editingUnit === unit) {
                  return (
                    <div key={unit} className="flex items-center gap-1 px-2 py-1">
                      <input
                        autoFocus
                        value={editUnitValue}
                        onChange={(e) => setEditUnitValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameCustomUnit(unit)
                          if (e.key === 'Escape') {
                            setEditingUnit(null)
                            setEditUnitValue('')
                          }
                        }}
                        className="min-w-0 flex-1 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs outline-none"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        onClick={() => renameCustomUnit(unit)}
                        className="shrink-0 rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] text-white"
                      >
                        OK
                      </button>
                    </div>
                  )
                }

                return (
                  <div key={unit} className="group flex items-center gap-0.5 px-1">
                    <button
                      type="button"
                      onClick={() => selectUnit(unit)}
                      className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-xs hover:bg-black/5 ${
                        series.unit === unit ? 'font-semibold text-[var(--color-accent)]' : ''
                      }`}
                    >
                      {unit}
                    </button>
                    {isCustom && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUnit(unit)
                            setEditUnitValue(unit)
                            setAddingUnit(false)
                          }}
                          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-black/5 hover:text-[var(--color-text)]"
                          title="단위 이름 변경"
                        >
                          <PenLine size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCustomUnit(unit)}
                          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-red-50 hover:text-red-500"
                          title="단위 삭제"
                        >
                          <X size={10} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
              <div className="border-t border-[var(--color-border)] pt-1">
                {addingUnit ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      autoFocus
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCustomUnit()
                        if (e.key === 'Escape') {
                          setAddingUnit(false)
                          setNewUnit('')
                        }
                      }}
                      placeholder="단위"
                      className="min-w-0 flex-1 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs outline-none"
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      onClick={addCustomUnit}
                      className="shrink-0 rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] text-white"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingUnit(true)
                      setEditingUnit(null)
                    }}
                    className="flex w-full items-center justify-center gap-1 px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-black/5"
                    title="사용자 단위 추가"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {series.enabled && (
        <>
          {selectDeleteMode && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-2 py-1.5">
              <span className="text-[10px] font-medium text-[var(--color-accent)]">
                선택삭제 모드 · 클릭으로 회차 선택 ({checkedVols.length}개)
              </span>
              <button
                type="button"
                disabled={!checkedVols.length}
                onClick={() => deleteVolumes(checkedVols)}
                className="rounded-md border border-red-200 bg-white/70 px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 삭제
              </button>
              <button
                type="button"
                onClick={exitSelectDeleteMode}
                className="rounded-md border border-[var(--color-border)] bg-white/70 px-2 py-0.5 text-[10px] hover:bg-black/5"
              >
                취소
              </button>
            </div>
          )}

          {/* 회차 3줄까지 표시, 초과 시 내부 스크롤 */}
          <div
            className="mb-2 flex max-h-[calc(3*1.625rem+2*0.375rem)] flex-wrap content-start items-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5"
            style={{ WebkitAppRegion: 'no-drag' }}
            onWheel={(e) => e.stopPropagation()}
          >
            {series.volumes.map((vol) => {
              const disabled = disabledVolumes.includes(vol)
              const active = !selectDeleteMode && state.selectedVolume === vol
              const checked = selectDeleteMode && checkedVols.includes(vol)
              return (
                <button
                  key={vol}
                  type="button"
                  onClick={(e) => handleVolumeClick(e, vol)}
                  onContextMenu={(e) => openVolumeMenu(e, vol)}
                  className={`shrink-0 rounded-md border px-2.5 py-1 text-xs leading-4 transition-colors ${
                    disabled
                      ? 'border-[var(--color-border)] bg-black/5 text-[var(--color-text-muted)] line-through opacity-60'
                      : active
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:bg-black/5'
                  } ${
                    checked
                      ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg)]'
                      : ''
                  }`}
                  title={
                    selectDeleteMode
                      ? '클릭: 삭제 대상 선택/해제 · 우클릭: 삭제하기'
                      : '클릭: 회차 감상 · 다시 클릭: 작품 감상 · 우클릭: 활성/비활성'
                  }
                >
                  {vol} {series.unit}
                </button>
              )
            })}
            <button
              type="button"
              onClick={addVolume}
              className="flex shrink-0 items-center gap-0.5 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-xs leading-4 hover:bg-black/5"
            >
              <Plus size={12} /> 추가
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectDeleteMode) exitSelectDeleteMode()
                else enterSelectDeleteMode()
              }}
              className={`flex shrink-0 items-center gap-0.5 rounded-md border px-2 py-1 text-xs leading-4 ${
                selectDeleteMode
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-black/5 hover:text-[var(--color-text)]'
              }`}
              title="선택삭제 모드"
            >
              <Trash2 size={12} /> 선택삭제
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={500}
              value={bulkCount}
              onChange={(e) => setBulkCount(e.target.value)}
              placeholder="회차수"
              className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs outline-none"
            />
            <button
              type="button"
              onClick={addBulkVolumes}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-black/5"
            >
              회차 지정
            </button>
            <span className="text-[10px] text-[var(--color-text-muted)]">예: 5 → 1~5권</span>
          </div>
        </>
      )}

      {volumeMenu && (
        <VolumeContextMenu
          x={volumeMenu.x}
          y={volumeMenu.y}
          onDelete={() => deleteVolumes(volumeMenu.targets)}
          onClose={() => setVolumeMenu(null)}
        />
      )}

      {pendingDeleteVols && (
        <DeleteConfirmDialog
          title="회차 삭제"
          message="해당 회차를 삭제하겠습니까?"
          skipAskLabel="다시는 묻지 않음"
          onCancel={() => setPendingDeleteVols(null)}
          onConfirm={confirmDeleteVolumes}
        />
      )}
    </div>
  )
}
