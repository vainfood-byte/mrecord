import { Heart, Skull, Star } from 'lucide-react'

const ICON_MAP = {
  star: Star,
  heart: Heart,
  skull: Skull
}

const ACTIVE_CLASS = {
  star: 'fill-amber-400 text-amber-400',
  heart: 'fill-rose-500 text-rose-500',
  skull: 'fill-gray-600 text-gray-600'
}

export default function StarRating({
  rating,
  max = 5,
  size = 14,
  interactive = false,
  onChange,
  iconType = 'star'
}) {
  const Icon = ICON_MAP[iconType] || Star
  const activeClass = ACTIVE_CLASS[iconType] || ACTIVE_CLASS.star

  return (
    <span className="inline-flex gap-0.5" data-star-rating data-rating-icon={iconType}>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onChange?.(i + 1)}
          className={interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
        >
          <Icon
            size={size}
            className={i < rating ? activeClass : 'text-gray-300'}
          />
        </button>
      ))}
    </span>
  )
}

export const RATING_ICON_OPTIONS = [
  { id: 'star', Icon: Star, label: '별' },
  { id: 'heart', Icon: Heart, label: '하트' },
  { id: 'skull', Icon: Skull, label: '해골' }
]
