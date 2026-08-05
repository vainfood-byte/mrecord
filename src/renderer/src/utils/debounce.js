export function debounce(fn, delay) {
  let timer
  const debounced = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
  debounced.cancel = () => clearTimeout(timer)
  debounced.flush = (...args) => {
    clearTimeout(timer)
    fn(...args)
  }
  return debounced
}
