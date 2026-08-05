import TableView from './TableView'

/** 생각한줄 — oneLine 필드 중심 표 뷰 */
export default function OneLineView() {
  return (
    <TableView
      columns={[
        { key: 'title', label: '제목' },
        { key: 'oneLine', label: '한마디', wide: true },
        { key: 'readDate', label: '처음 읽은 날', type: 'date' }
      ]}
    />
  )
}
