/** Electron file:// 환경에서도 동작하는 public 아이콘 경로 */
export function iconUrl(name) {
  return new URL(`./icons/${name}`, window.location.href).href
}
