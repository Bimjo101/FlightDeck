#!/usr/bin/env node
// Deploys dist/web/ to the gh-pages branch via GitHub REST API
const fs = require('fs')
const path = require('path')
const https = require('https')

const TOKEN = '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'
const REPO = 'Bimjo101/FlightDeck'
const BRANCH = 'gh-pages'
const DIST = path.join(__dirname, 'dist', 'web')

function api(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}${endpoint}`,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'FlightDeck-Deploy',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let out = ''
      res.on('data', c => out += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(out) }) }
        catch { resolve({ status: res.statusCode, body: out }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function getFileSha(filePath) {
  const r = await api('GET', `/contents/${filePath}?ref=${BRANCH}`)
  if (r.status === 200) return r.body.sha
  return null
}

async function putFile(filePath, content, sha) {
  const body = {
    message: `deploy: update ${filePath}`,
    content,
    branch: BRANCH
  }
  if (sha) body.sha = sha
  const r = await api('PUT', `/contents/${filePath}`, body)
  if (r.status !== 200 && r.status !== 201) {
    console.error(`Failed to put ${filePath}: ${r.status}`, r.body.message || '')
    process.exit(1)
  }
  console.log(`  ✓ ${filePath}`)
}

async function deleteFile(filePath, sha) {
  if (!sha) return
  const r = await api('DELETE', `/contents/${filePath}`, {
    message: `deploy: remove old ${filePath}`,
    sha,
    branch: BRANCH
  })
  if (r.status !== 200) {
    console.warn(`  ⚠ could not delete ${filePath}: ${r.status}`)
  } else {
    console.log(`  ✗ removed ${filePath}`)
  }
}

async function listDir(dir) {
  const r = await api('GET', `/contents/${dir}?ref=${BRANCH}`)
  if (r.status === 200 && Array.isArray(r.body)) return r.body
  return []
}

async function main() {
  console.log('Deploying dist/web/ to gh-pages...\n')

  // Read local built files
  const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'))
  const assetsDir = path.join(DIST, 'assets')
  const assetFiles = fs.readdirSync(assetsDir)
  const jsFile = assetFiles.find(f => f.endsWith('.js'))
  const cssFile = assetFiles.find(f => f.endsWith('.css'))

  if (!jsFile) { console.error('No JS file found in dist/web/assets/'); process.exit(1) }

  console.log(`JS:  ${jsFile}`)
  console.log(`CSS: ${cssFile || '(none)'}`)
  console.log()

  // Get current assets on gh-pages
  const remoteAssets = await listDir('assets')
  const remoteJs = remoteAssets.filter(f => f.name.endsWith('.js'))
  const remoteCss = remoteAssets.filter(f => f.name.endsWith('.css'))

  // Delete old JS files that differ from new one
  for (const f of remoteJs) {
    if (f.name !== jsFile) {
      console.log(`Removing old JS: ${f.name}`)
      await deleteFile(`assets/${f.name}`, f.sha)
    }
  }

  // Upload new JS
  const existingJsSha = remoteJs.find(f => f.name === jsFile)?.sha || null
  const jsContent = fs.readFileSync(path.join(assetsDir, jsFile)).toString('base64')
  await putFile(`assets/${jsFile}`, jsContent, existingJsSha)

  // Upload CSS if present
  if (cssFile) {
    const existingCssSha = remoteCss.find(f => f.name === cssFile)?.sha || null
    const cssContent = fs.readFileSync(path.join(assetsDir, cssFile)).toString('base64')
    await putFile(`assets/${cssFile}`, cssContent, existingCssSha)
  }

  // Upload index.html
  const indexSha = await getFileSha('index.html')
  await putFile('index.html', indexHtml.toString('base64'), indexSha)

  console.log('\nDone! https://bimjo101.github.io/FlightDeck/')
}

main().catch(e => { console.error(e); process.exit(1) })
