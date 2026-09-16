// server/scripts/copy-js.js
// 把 src 下保留的 JS 业务文件（services/config/utils）转译为 CJS 并输出到 dist
// 这些文件是 ESM 语法的纯 JS，不参与 TS 编译（LangChain 类型图太大会 OOM），
// 用 esbuild 做纯语法转译（不做类型检查，毫秒级完成）
const fs = require('fs')
const path = require('path')
const { transformSync } = require('esbuild')

const SRC = path.join(__dirname, '..', 'src')
const DIST = path.join(__dirname, '..', 'dist')

function processJsFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      processJsFiles(from)
    } else if (entry.name.endsWith('.js')) {
      const source = fs.readFileSync(from, 'utf-8')
      const { code } = transformSync(source, {
        format: 'cjs',
        target: 'node20',
        loader: 'js',
      })
      const to = path.join(DIST, path.relative(SRC, from))
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.writeFileSync(to, code)
      console.log(`transpiled: ${path.relative(SRC, from)}`)
    }
  }
}

processJsFiles(SRC)
console.log('✓ JS 文件转译完成')
