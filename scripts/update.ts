import { $ } from "bun"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
process.chdir(root)

await $`bun update @opencode-ai/sdk@dev @opencode-ai/server@dev`

const pkg = await Bun.file("node_modules/@opencode-ai/server/package.json").json() as {
  version: string
}
await Bun.write(
  "src/opencode-version.ts",
  `export const OPENCODE_VERSION = ${JSON.stringify(pkg.version)}\n`,
)
console.log(`OpenCode ${pkg.version}`)

await $`bun run check`
await $`bunx wrangler deploy`
