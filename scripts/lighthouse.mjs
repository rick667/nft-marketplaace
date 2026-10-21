// Medições de Lighthouse reproduzíveis: build otimizado, cenário padrão do mock, 3 execuções por página/perfil.
// Uso: npm run lighthouse   (variáveis: LH_RUNS=3, LH_PORT=4180, LH_URL=https://... para medir um deploy; saída em lighthouse/producao)
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const remote = process.env.LH_URL?.replace(/\/+$/, '')
const outDir = path.join(root, 'lighthouse', remote ? 'producao' : '')
const runs = Number(process.env.LH_RUNS ?? 3)
const port = Number(process.env.LH_PORT ?? 4180)
const base = remote ?? `http://127.0.0.1:${port}`
const goals = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 90 }
const demo = { email: 'demo@kurio.app', password: 'KurioDemo123!' }

const pages = [
  { id: 'home', path: '/' },
  { id: 'detalhe', path: '/nft/42' },
  { id: 'perfil', path: '/profile' },
]
const profiles = [
  { id: 'mobile', config: undefined, formFactor: 'mobile' },
  { id: 'desktop', config: desktopConfig, formFactor: 'desktop' },
]

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: true })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} saiu com ${code}`))))
  })
}

async function waitFor(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch { /* servidor ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Servidor não respondeu em ${url}`)
}

// O perfil exige sessão: entra uma vez no mesmo Chrome e as medições reutilizam o localStorage.
async function signIn(debugPort) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
  const context = browser.contexts()[0] ?? await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${base}/profile`)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('E-mail').fill(demo.email)
  await dialog.getByLabel('Senha', { exact: true }).fill(demo.password)
  await dialog.locator('form').getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('heading', { name: 'Alterar senha' }).waitFor()
  await page.close()
  await browser.close()
}

let server
if (remote) {
  console.log(`> medindo URL publicada ${base}`)
} else {
  console.log('> build de produção')
  await run('npm', ['run', 'build'])
  console.log(`> preview em ${base}`)
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, shell: true, stdio: 'ignore' })
}
const stopServer = () => {
  if (server) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' })
}

let chrome
try {
  await waitFor(`${base}/`)
  const userDataDir = path.join(os.tmpdir(), `kurio-lh-${Date.now()}`)
  await mkdir(userDataDir, { recursive: true })
  chrome = await launch({
    chromePath: chromium.executablePath(),
    userDataDir,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-allow-origins=*'],
  })
  await signIn(chrome.port)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const summary = []
  let version = ''
  let userAgent = ''

  for (const profile of profiles) {
    for (const target of pages) {
      const results = []
      for (let index = 1; index <= runs; index += 1) {
        const flags = { port: chrome.port, output: ['json', 'html'], logLevel: 'error', disableStorageReset: true }
        if (profile.formFactor === 'mobile') flags.formFactor = 'mobile'
        const result = await lighthouse(`${base}${target.path}`, flags, profile.config)
        const [json, html] = result.report
        const lhr = result.lhr
        version = lhr.lighthouseVersion
        userAgent = lhr.environment.hostUserAgent
        const metric = (id) => lhr.audits[id].numericValue
        const entry = {
          json,
          html,
          scores: Object.fromEntries(Object.entries(lhr.categories).map(([id, category]) => [id, Math.round(category.score * 100)])),
          lcp: metric('largest-contentful-paint'),
          cls: metric('cumulative-layout-shift'),
          tbt: metric('total-blocking-time'),
          fcp: metric('first-contentful-paint'),
        }
        results.push(entry)
        console.log(`  ${profile.id}/${target.id} #${index}: perf ${entry.scores.performance} a11y ${entry.scores.accessibility} bp ${entry.scores['best-practices']} seo ${entry.scores.seo} LCP ${Math.round(entry.lcp)}ms CLS ${entry.cls.toFixed(3)} TBT ${Math.round(entry.tbt)}ms`)
      }
      const medianScores = Object.fromEntries(Object.keys(goals).map((id) => [id, median(results.map((item) => item.scores[id]))]))
      const representative = [...results].sort((a, b) => Math.abs(a.scores.performance - medianScores.performance) - Math.abs(b.scores.performance - medianScores.performance))[0]
      const name = `${target.id}-${profile.id}`
      await writeFile(path.join(outDir, `${name}.html`), representative.html)
      await writeFile(path.join(outDir, `${name}.json`), representative.json)
      summary.push({
        page: target.id,
        path: target.path,
        profile: profile.id,
        runs: results.map((item) => ({ scores: item.scores, lcpMs: Math.round(item.lcp), cls: Number(item.cls.toFixed(4)), tbtMs: Math.round(item.tbt), fcpMs: Math.round(item.fcp) })),
        median: {
          ...medianScores,
          lcpMs: Math.round(median(results.map((item) => item.lcp))),
          cls: Number(median(results.map((item) => item.cls)).toFixed(4)),
          tbtMs: Math.round(median(results.map((item) => item.tbt))),
          fcpMs: Math.round(median(results.map((item) => item.fcp))),
        },
      })
    }
  }

  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const environment = {
    generatedAt: new Date().toISOString(),
    lighthouse: version,
    chrome: userAgent,
    node: process.version,
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpus: os.cpus().length,
    runsPerPage: runs,
    build: remote ? `deploy publicado em ${base}` : 'vite build (produção) servido por vite preview',
    scenario: 'default (mocks MSW ativos, sem latência artificial)',
    throttling: 'padrão do Lighthouse (mobile: Slow 4G + CPU 4x; desktop: preset desktop)',
    app: `${pkg.name}@${pkg.version}`,
    goals,
  }
  await writeFile(path.join(outDir, 'summary.json'), JSON.stringify({ environment, results: summary }, null, 2))

  const row = (item) => {
    const m = item.median
    const ok = Object.entries(goals).every(([id, goal]) => m[id] >= goal)
    return `| ${item.page} | ${item.profile} | ${m.performance} | ${m.accessibility} | ${m['best-practices']} | ${m.seo} | ${m.lcpMs} | ${m.cls} | ${m.tbtMs} | ${ok ? 'sim' : 'não'} |`
  }
  const markdown = [
    '# Relatório Lighthouse',
    '',
    `Gerado em ${environment.generatedAt} com Lighthouse ${version} (${userAgent}).`,
    `Ambiente: ${environment.os}, ${environment.cpus} CPUs, Node ${environment.node}.`,
    `Cada linha é a **mediana de ${runs} execuções**. Build: ${environment.build}. Cenário: ${environment.scenario}.`,
    `Throttling: ${environment.throttling}.`,
    '',
    `Metas: Performance ≥ ${goals.performance}, Accessibility ≥ ${goals.accessibility}, Best Practices ≥ ${goals['best-practices']}, SEO ≥ ${goals.seo}.`,
    '',
    '| Página | Perfil | Perf. | A11y | Best Pr. | SEO | LCP (ms) | CLS | TBT (ms) | Metas atingidas |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...summary.map(row),
    '',
    'Relatórios HTML/JSON da execução mais próxima da mediana: `lighthouse/<página>-<perfil>.html|json`. Todas as execuções estão em `summary.json`.',
    '',
  ].join('\n')
  await writeFile(path.join(outDir, 'README.md'), markdown)
  console.log(`\n${markdown}`)
  if (summary.some((item) => !Object.entries(goals).every(([id, goal]) => item.median[id] >= goal))) process.exitCode = 1
} finally {
  await chrome?.kill()
  stopServer()
}
