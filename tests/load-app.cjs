const path = require("node:path")
const load = require("./load-typescript.cjs")
module.exports = function appFixture(stubs = {}, globals = {}) {
  const modules = new Map()
  function moduleAt(filename) {
    if (Object.hasOwn(stubs, filename)) return stubs[filename]
    if (modules.has(filename)) return modules.get(filename)
    const exports = load(filename, name => {
      if (Object.hasOwn(stubs, name)) return stubs[name]
      if (name.startsWith("@/")) return moduleAt(name.slice(2) + ".ts")
      if (name.startsWith(".")) return moduleAt(path.posix.normalize(path.posix.join(path.posix.dirname(filename), name)) + ".ts")
      if (name.startsWith("node:") || name.startsWith("@aws-sdk/")) return require(name)
      throw new Error(`Unexpected dependency: ${name}`)
    }, { process, ...globals })
    modules.set(filename, exports)
    return exports
  }
  return moduleAt
}
