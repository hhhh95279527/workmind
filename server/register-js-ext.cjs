// server/register-js-ext.cjs
// dev 环境专用：让相对 require('./x.js') 在只有 x.ts 时回退到 .ts
// 原因：源码统一用 ESM 风格的 .js 后缀（TS 官方推荐，编译后路径一致），
// 但 ts-node 的 CJS loader 默认不会把不存在的 .js 重写到 .ts。
// 生产用 tsc 产物（dist/），真实 .js 文件存在，无需此钩子。
const Module = require('node:module')
const fs = require('node:fs')

const originalResolve = Module._resolveFilename
Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  try {
    return originalResolve.call(this, request, parent, isMain, options)
  } catch (err) {
    if (request.startsWith('.') && request.endsWith('.js')) {
      const tsRequest = request.slice(0, -3) + '.ts'
      const baseDir = parent?.filename ? require('node:path').dirname(parent.filename) : process.cwd()
      const tsPath = require('node:path').resolve(baseDir, tsRequest)
      if (fs.existsSync(tsPath)) {
        return originalResolve.call(this, tsRequest, parent, isMain, options)
      }
    }
    throw err
  }
}
