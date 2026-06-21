import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '../demo-dist')
const PREFIX = '/SpotiQueue'
const PORT = parseInt(process.env.PORT || '3000', 10)

if (!existsSync(dist)) {
  console.error('demo-dist/ not found. Run: npm run build:demo')
  process.exit(1)
}

const app = express()

app.get('/', (_req, res) => {
  res.redirect(`${PREFIX}/`)
})

app.use(PREFIX, express.static(dist, { index: 'index.html' }))

app.get(`${PREFIX}/display`, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

app.get(`${PREFIX}/admin`, (_req, res) => {
  res.sendFile(path.join(dist, 'admin', 'index.html'))
})

app.get(`${PREFIX}/admin/*`, (_req, res) => {
  res.sendFile(path.join(dist, 'admin', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`SpotiQueue demo (matches GitHub Pages paths)`)
  console.log(`  Guest:  http://127.0.0.1:${PORT}${PREFIX}/`)
  console.log(`  Admin:  http://127.0.0.1:${PORT}${PREFIX}/admin/`)
  console.log(`  Display: http://127.0.0.1:${PORT}${PREFIX}/display`)
})
