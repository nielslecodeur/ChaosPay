import { rmSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, basename } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const output = resolve(root, "dist");
// Only remove this package's generated output; never a caller-supplied path.
if (dirname(output) !== root || basename(output) !== "dist") throw new Error("Invalid build output path");
rmSync(output, { recursive: true, force: true });
const require = createRequire(import.meta.url);
const compiler = resolve(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const result = spawnSync(process.execPath, [compiler, "-p", resolve(root, "tsconfig.build.json")], {
  cwd: root, stdio: "inherit", windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
