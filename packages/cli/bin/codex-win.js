#!/usr/bin/env node
import { main } from "../src/main.js";

main(process.argv.slice(2)).catch((error) => {
  if (error?.details) {
    console.error(`Error: ${error.message}`);
    console.error(JSON.stringify(error.details, null, 2));
  } else {
    console.error(`Error: ${error?.message || String(error)}`);
  }
  process.exitCode = 1;
});
