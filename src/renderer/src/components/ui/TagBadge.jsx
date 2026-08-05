import { memo } from 'react'
import { resolveTagDisplayColor } from '../../utils/tagColorHelpers'
import { useApp } from '../../context/AppContext'
import { contrastText } from '../../utils/colorUtils'

function TagBadge({ tag, onClick, small = false, customColor, settings: settingsProp }) {
  const appSettings = useApp().state.settings
  const settings = settingsProp ?? appSettings
  const bg = customColor || resolveTagDisplayColor(tag, settings)
  const textColor = contrastText(bg)
  const Tag = onClick ? 'button' : 'span'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      data-tag-badge
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full border border-black/5 font-medium ${
        onClick ? 'transition-opacity hover:opacity-80' : ''
      } ${small ? 'px-2 text-xs' : 'px-2.5 text-xs'}`}
      style={{
        backgroundColor: bg,
        color: textColor,
        textAlign: 'center',
        lineHeight: small ? '20px' : '24px',
        minHeight: small ? 20 : 24,
        paddingTop: 0,
        paddingBottom: 0
      }}
    >
      {tag.name}
    </Tag>
  )
}

export default memo(TagBadge)
