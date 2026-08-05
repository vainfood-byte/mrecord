import { useEffect, useState } from 'react'

import { Trash2 } from 'lucide-react'

import { useApp } from '../context/AppContext'

import { resetInteractionLocks } from '../utils/restoreFocusAfterDialog'

import DeleteConfirmDialog from '../components/ui/DeleteConfirmDialog'



export function useRecordContextMenu() {

  const { dispatch } = useApp()

  const [menu, setMenu] = useState(null)

  const [pendingDeleteId, setPendingDeleteId] = useState(null)



  useEffect(() => {

    const close = () => setMenu(null)

    const onKey = (e) => e.key === 'Escape' && close()

    document.addEventListener('click', close)

    document.addEventListener('keydown', onKey)

    return () => {

      document.removeEventListener('click', close)

      document.removeEventListener('keydown', onKey)

    }

  }, [])



  const bind = (recordId) => ({

    onContextMenu: (e) => {

      e.preventDefault()

      e.stopPropagation()

      setMenu({ x: e.clientX, y: e.clientY, recordId })

    }

  })



  const confirmDelete = () => {

    if (!pendingDeleteId) return

    dispatch({ type: 'DELETE_RECORD', payload: pendingDeleteId })

    setPendingDeleteId(null)

    resetInteractionLocks()

    window.mrecord?.focusWindow?.()

  }



  const portal =

    menu &&

    (

      <div

        className="fixed z-[100001] min-w-[120px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-xl"

        style={{ left: menu.x, top: menu.y, WebkitAppRegion: 'no-drag' }}

        onClick={(e) => e.stopPropagation()}

      >

        <button

          type="button"

          onClick={() => {

            setPendingDeleteId(menu.recordId)

            setMenu(null)

          }}

          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-500/10"

        >

          <Trash2 size={14} />

          삭제하기

        </button>

      </div>

    )



  const deleteDialog = pendingDeleteId ? (

    <DeleteConfirmDialog

      message="이 작품을 삭제할까요?"

      showSkipAsk={false}

      onConfirm={confirmDelete}

      onCancel={() => setPendingDeleteId(null)}

    />

  ) : null



  return { bind, portal, deleteDialog }

}


