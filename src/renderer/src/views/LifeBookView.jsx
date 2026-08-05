import TableView from './TableView'

/** 인생책 — isLifeBook 표시된 기록만 */
export default function LifeBookView() {
  return (
    <TableView
      filterFn={(rec) => rec.isLifeBook}
      columns={[
        { key: 'title', label: '제목' },
        { key: 'author', label: '저자' },
        { key: 'rating', label: '별점', type: 'rating' },
        { key: 'oneLine', label: '한마디', wide: true }
      ]}
    />
  )
}
