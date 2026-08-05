/** Skip layout/paint for off-screen grid cards while preserving scroll size. */
export function offscreenCardHint(width, height) {
  return {
    contentVisibility: 'auto',
    containIntrinsicSize: `${width}px ${height}px`
  }
}
