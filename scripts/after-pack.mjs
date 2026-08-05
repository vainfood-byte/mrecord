import { join } from 'path'
import { rcedit } from 'rcedit'

/** electron-builder afterPack — exe 아이콘을 rcedit으로 직접 삽입 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exePath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = join(context.packager.projectDir, 'resources/icons/app-icon.ico')

  await rcedit(exePath, { icon: iconPath })
  console.log(`Embedded app icon: ${exePath}`)
}
