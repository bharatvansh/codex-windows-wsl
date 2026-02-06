const BOOLEAN_FLAGS = new Set([
  "reuse",
  "json",
  "no-launch",
  "cache-only",
  "no-prepare"
]);

const FLAG_ALIASES = {
  dmg: "dmgPath",
  workdir: "workdir",
  "codex-cli": "codexCliPath",
  "log-level": "logLevel",
  reuse: "reuse",
  json: "json",
  "no-launch": "noLaunch",
  "cache-only": "cacheOnly",
  "prepare-manifest": "prepareManifest",
  out: "outPath",
  "no-prepare": "noPrepare"
};

function mapFlagName(flag) {
  if (FLAG_ALIASES[flag]) {
    return FLAG_ALIASES[flag];
  }

  return flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  const positionals = [];

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const raw = token.slice(2);

    if (raw === "help") {
      options.help = true;
      continue;
    }

    const [name, directValue] = raw.split("=");
    const key = mapFlagName(name);

    if (directValue !== undefined) {
      options[key] = directValue;
      continue;
    }

    if (BOOLEAN_FLAGS.has(name)) {
      options[key] = true;
      continue;
    }

    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return {
    command,
    options,
    positionals
  };
}
