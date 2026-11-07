#!/usr/bin/env node
import { runCli } from "./cli/main.js";

process.exitCode = await runCli(process.argv.slice(2), {
  rootDir: process.cwd(),
  env: process.env,
  out: (line) => {
    console.log(line);
  },
  err: (line) => {
    console.error(line);
  },
});
