import { useApp } from '../context/AppContext'
import { isCoreTab, getPropertyFieldForTab } from '../utils/tabHelpers'
import TagPropertyView from './property/TagPropertyView'
import RatingPropertyView from './property/RatingPropertyView'
import DatePropertyView from './property/DatePropertyView'
import YearPropertyView from './property/YearPropertyView'
import MemoLinkPropertyView from './property/MemoLinkPropertyView'

export default function PropertyTabView({ fieldId }) {
  const { state } = useApp()
  const field = getPropertyFieldForTab(fieldId, state.settings)

  if (!field) {
    return (
      <p className="py-12 text-center text-[var(--color-text-muted)]">
        속성을 찾을 수 없습니다
      </p>
    )
  }

  if (field.type === 'tags') {
    return <TagPropertyView field={field} />
  }
  if (field.type === 'rating') {
    return <RatingPropertyView field={field} />
  }
  if (field.type === 'date') {
    return <DatePropertyView field={field} />
  }
  if (field.type === 'year') {
    return <YearPropertyView field={field} />
  }
  if (field.type === 'memo' || field.type === 'link' || field.type === 'text' || field.type === 'multiline') {
    return <MemoLinkPropertyView field={field} />
  }

  return (
    <p className="py-12 text-center text-[var(--color-text-muted)]">
      {field.label} 뷰는 준비 중입니다
    </p>
  )
}

export { isCoreTab }
