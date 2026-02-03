import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  execSync("npm run tauri icon", { stdio: "inherit" });

  const keepFiles = [
    "32x32.png",
    "128x128.png",
    "128x128@2x.png",
    "icon.icns",
    "icon.ico",
  ];

  const iconDir = path.resolve(__dirname, "../src-tauri/icons");

  const files = fs.readdirSync(iconDir);

  for (const file of files) {
    if (!keepFiles.includes(file)) {
      if (fs.statSync(path.join(iconDir, file)).isDirectory()) {
        fs.rmSync(path.join(iconDir, file), { recursive: true });
      } else {
        fs.unlinkSync(path.join(iconDir, file));
      }
    }
  }
}

main();
