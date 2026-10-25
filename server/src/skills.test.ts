// Paczka skilli: archiwum tar.gz rozpakowuje się systemowym tar, a pliki mają tę samą treść co na dysku.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import zlib from "node:zlib";
import { makeTar } from "./skills.ts";

test("makeTar tworzy archiwum czytelne dla systemowego tar", () => {
  const files = [
    { path: "predator-a/SKILL.md", data: Buffer.from("---\nname: predator-a\n---\nZażółć gęślą jaźń\n") },
    { path: "predator-a/reference.md", data: Buffer.alloc(1300, "x") },
    { path: "predator-b/SKILL.md", data: Buffer.alloc(0) },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tar-"));
  const tgz = path.join(dir, "a.tar.gz");
  fs.writeFileSync(tgz, zlib.gzipSync(makeTar(files)));
  const out = path.join(dir, "out");
  fs.mkdirSync(out);
  execFileSync("tar", ["-xzf", tgz, "-C", out]);
  for (const f of files) assert.deepEqual(fs.readFileSync(path.join(out, f.path)), f.data, f.path);
});

test("paczka z repozytorium rozpakowuje się i zawiera skille Predatora", async () => {
  const { default: express } = await import("express");
  const { skillsRouter } = await import("./skills.ts");
  const app = express();
  app.use("/skills", skillsRouter);
  const server = app.listen(0);
  try {
    const port = (server.address() as { port: number }).port;
    const r = await fetch(`http://127.0.0.1:${port}/skills/predator-skills.tar.gz`);
    assert.equal(r.status, 200);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    fs.writeFileSync(path.join(dir, "p.tgz"), Buffer.from(await r.arrayBuffer()));
    execFileSync("tar", ["-xzf", path.join(dir, "p.tgz"), "-C", dir]);
    for (const s of ["predator-studio-mcp", "predator-3d-building", "predator-lua-scripting", "predator-game-templates"]) assert.ok(fs.existsSync(path.join(dir, s, "SKILL.md")), s);
    const j = (await (await fetch(`http://127.0.0.1:${port}/skills/pack.json`)).json()) as { files: { path: string }[] };
    assert.ok(j.files.some((f) => f.path === "predator-studio-mcp/SKILL.md"));
  } finally {
    server.close();
  }
});
