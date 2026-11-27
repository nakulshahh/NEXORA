
import { execFileSync } from "node:child_process";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" }
)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.startsWith("node_modules/"))
  .filter((file) => !file.startsWith(".next/"))
  .filter((file) => !file.startsWith("dist/"));

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{12,}["']/i,
];

let failed = false;

for (const file of files) {
  try {
    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile(file, "utf8")
    );

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        console.error(`Potential secret found in: ${file}`);
        failed = true;
        break;
      }
    }
  } catch {
    // Ignore binary or unreadable files.
  }
}

if (failed) {
  console.error("Secret check failed. Review the flagged files.");
  process.exit(1);
}

console.log("Secret check passed.");
