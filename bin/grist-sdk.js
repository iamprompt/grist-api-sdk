#!/usr/bin/env node
import { runCli } from '../dist/cli/index.mjs';

runCli().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
