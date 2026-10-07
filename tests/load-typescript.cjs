const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

// Load production modules with explicitly stubbed I/O. No database, login, or
// social-provider requests are allowed from these regression tests.
module.exports = function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath)
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText
  const loadedModule = { exports: {} }
  const sandbox = {
    module: loadedModule, exports: loadedModule.exports, Buffer, URL, Response, TextDecoder, AbortSignal, AbortController,
    setTimeout, clearTimeout, console, ...globals,
    require(name) {
      if (typeof dependencies === "function") return dependencies(name)
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      if (name.startsWith("node:")) return require(name)
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }
  vm.runInNewContext(code, sandbox, { filename })
  return loadedModule.exports
}
