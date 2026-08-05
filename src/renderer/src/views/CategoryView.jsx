import TableView from './TableView'

/** 장르 — 장르 태그 중심 표 뷰 */
export default function CategoryView() {
  return (
    <TableView
      filterCategory="장르"
      columns={[
        { key: 'title', label: '제목' },
        { key: 'tags', label: '장르', type: 'tags', tagCategory: '장르' },
        { key: 'rating', label: '별점', type: 'rating' },
        { key: 'tags', label: '상태', type: 'tags', tagCategory: '상태' }
      ]}
    />
  )
}
