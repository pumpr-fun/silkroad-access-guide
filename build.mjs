import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const output = "dist";
if (existsSync(output)) rmSync(output, { recursive: true });
mkdirSync(output, { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "phantom.html", "phantom.js", "robots.txt", "vercel.json"]) {
  cpSync(file, `${output}/${file}`);
}
if (existsSync("og.png")) cpSync("og.png", `${output}/og.png`);
if (existsSync("assets")) cpSync("assets", `${output}/assets`, { recursive: true });
console.log("Built static access guide in dist/");
