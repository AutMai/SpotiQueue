import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const demoDist = join(root, 'demo-dist')

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', shell: true })
}

rmSync(demoDist, { recursive: true, force: true })
mkdirSync(demoDist, { recursive: true })

console.log('Building guest client (demo)...')
run('npm run build:demo', join(root, 'client'))

console.log('Building admin panel (demo)...')
run('npm run build:demo', join(root, 'admin'))

console.log('Merging demo-dist...')
cpSync(join(root, 'client', 'build'), demoDist, { recursive: true })
mkdirSync(join(demoDist, 'admin'), { recursive: true })
cpSync(join(root, 'admin', 'build'), join(demoDist, 'admin'), { recursive: true })

const indexHtml = readFileSync(join(demoDist, 'index.html'), 'utf8')
writeFileSync(join(demoDist, '404.html'), indexHtml)

const adminIndex = readFileSync(join(demoDist, 'admin', 'index.html'), 'utf8')
writeFileSync(join(demoDist, 'admin', '404.html'), adminIndex)

console.log('Demo build complete:', demoDist)
