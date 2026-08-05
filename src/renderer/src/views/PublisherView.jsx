import TableView from './TableView'

/** 출판사 — 출판사/출판사 태그 중심 표 뷰 */
export default function PublisherView() {
  return (
    <TableView
      columns={[
        { key: 'title', label: '제목' },
        { key: 'publisher', label: '출판사' },
        { key: 'tags', label: '태그', type: 'tags', tagCategory: '출판사' },
        { key: 'readDate', label: '읽은 날짜', type: 'date' }
      ]}
    />
  )
}
