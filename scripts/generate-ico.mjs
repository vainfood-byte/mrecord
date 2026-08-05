import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pngPath = join(root, 'resources/icons/app-icon.png')
const icoPath = join(root, 'resources/icons/app-icon.ico')

const icoBuffer = await pngToIco(pngPath)
writeFileSync(icoPath, icoBuffer)
console.log(`Created ${icoPath} (${icoBuffer.length} bytes)`)
