import TableView from './TableView'

/** 연도 — 연도 태그 중심 표 뷰 */
export default function YearView() {
  return (
    <TableView
      columns={[
        { key: 'title', label: '제목' },
        { key: 'year', label: '연도' },
        { key: 'rating', label: '별점', type: 'rating' },
        { key: 'readDate', label: '읽은 날짜', type: 'date' }
      ]}
    />
  )
}
