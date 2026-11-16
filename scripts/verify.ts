/**
 * Checks the files with sway and i3 themselves, in Docker: sway 1.9 and
 * i3 4.23 (Ubuntu 24.04), sway 1.11 and i3 4.25 (Ubuntu 26.04).
 *
 *   pnpm verify                  both releases
 *   pnpm verify -- 26.04         one Ubuntu release
 *
 * 1. Every color in themes/mistpine.conf and themes/swaynag.conf is the
 *    spec color its role calls for (the README's tables), read from the
 *    files the way sway and swaynag read them.
 * 2. sway -C and i3 -C load mistpine.conf and the bar example with no
 *    errors. Both exit 0 even when a line fails, so any error fails here.
 * 3. sway and i3 report the bar colors over IPC exactly as the spec says,
 *    and swaynag starts with the config for each message type.
 *
 * The window colors have no IPC; pnpm render checks them on screen.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpec } from "@mistpine/port-kit";
import { image } from "@mistpine/port-kit/docker";

const ROOT = join(import.meta.dirname, "..");

const RELEASES = { "24.04": ["1.9", "4.23"], "26.04": ["1.11", "4.25"] } as const;
type Release = keyof typeof RELEASES;

const asked = process.argv.slice(2).filter((a) => a !== "--");
const releases = (asked.length ? asked : Object.keys(RELEASES)) as Release[];
for (const r of releases) if (!(r in RELEASES)) fail(`unknown release ${r}: use 24.04 or 26.04`);

function fail(message: string): never {
  console.error(`verify: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- expectations

const { spec } = await loadSpec(ROOT);
const ui = (name: string) => {
  const hex = spec.ui[name]?.hex;
  if (!hex) fail(`the spec has no ui.${name}`);
  return hex.toLowerCase();
};
const pal = (name: string) => {
  const hex = spec.palette[name];
  if (!hex) fail(`the spec has no palette.${name}`);
  return hex.toLowerCase();
};

/** client.<class>: border, background, text, indicator, child_border. */
const CLIENT: Record<string, string[]> = {
  focused: [ui("accent"), ui("selection"), ui("editorFg"), pal("orange"), ui("accent")],
  focused_inactive: [ui("border"), ui("statusBg"), ui("statusFg"), ui("border"), ui("border")],
  focused_tab_title: [ui("border"), ui("statusBg"), ui("statusFg")],
  unfocused: [ui("statusBg"), ui("tabInactiveBg"), pal("fg1"), ui("statusBg"), ui("statusBg")],
  urgent: [ui("error"), ui("error"), ui("panelBg"), ui("error"), ui("error")],
  placeholder: [ui("panelBg"), ui("panelBg"), ui("statusFg"), ui("panelBg"), ui("panelBg")],
  background: [ui("editorBg")],
};

/** The bar colors, by the names sway and i3 report them under. */
const BAR: Record<string, string> = {
  background: ui("statusBg"),
  statusline: ui("statusFg"),
  separator: ui("border"),
  ...workspace("focused_workspace", ui("accent"), ui("selection"), ui("editorFg")),
  ...workspace("active_workspace", ui("border"), ui("statusBg"), ui("statusFg")),
  ...workspace("inactive_workspace", ui("statusBg"), ui("statusBg"), pal("fg1")),
  ...workspace("urgent_workspace", ui("error"), ui("error"), ui("panelBg")),
  ...workspace("binding_mode", ui("warning"), ui("warning"), ui("panelBg")),
};
function workspace(cls: string, border: string, bg: string, text: string) {
  return { [`${cls}_border`]: border, [`${cls}_bg`]: bg, [`${cls}_text`]: text };
}

/** swaynag, the same for every type but the line under the bar. */
const NAG: Record<string, string> = {
  background: ui("statusBg"),
  text: ui("editorFg"),
  border: ui("border"),
  "button-background": ui("selection"),
  "button-text": ui("editorFg"),
  "details-background": ui("panelBg"),
};
const NAG_LINE: Record<string, string> = { error: ui("error"), warning: ui("warning") };

// ---------------------------------------------------------------- 1. the files

const conf = readFileSync(join(ROOT, "themes", "mistpine.conf"), "utf8");
const vars = new Map<string, string>();
const clients = new Map<string, string[]>();
for (const raw of conf.split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const [cmd, ...args] = line.split(/\s+/);
  if (cmd === "set") {
    const [name, value] = args as [string, string];
    vars.set(name, value);
  } else if (cmd?.startsWith("client.")) {
    // sway and i3 substitute variables before parsing, longest name first.
    clients.set(
      cmd.slice("client.".length),
      args.map((a) => vars.get(a) ?? a),
    );
  } else {
    fail(`themes/mistpine.conf: unexpected line "${line}"`);
  }
}
for (const [key, hex] of Object.entries(spec.palette)) {
  const name = `$mistpine-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  if (vars.get(name) !== hex.toLowerCase())
    fail(`${name} is ${vars.get(name)}, the spec says ${hex}`);
}
for (const [cls, want] of Object.entries(CLIENT)) {
  const got = clients.get(cls);
  if (got?.join(" ") !== want.join(" ")) {
    fail(`client.${cls} is ${got?.join(" ")}, want ${want.join(" ")}`);
  }
}
if (clients.size !== Object.keys(CLIENT).length)
  fail("themes/mistpine.conf has extra client lines");

const nag = readFileSync(join(ROOT, "themes", "swaynag.conf"), "utf8");
let section = "";
const nagSeen = new Set<string>();
for (const raw of nag.split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const head = line.match(/^\[(\w+)\]$/);
  if (head) {
    section = head[1] as string;
    if (!(section in NAG_LINE)) fail(`themes/swaynag.conf: unexpected type [${section}]`);
    continue;
  }
  const [key, value] = line.split("=", 2) as [string, string];
  const want = key === "border-bottom" ? NAG_LINE[section] : NAG[key];
  if (key === "border-bottom-size") continue;
  if (!want) fail(`themes/swaynag.conf: unexpected ${key} in [${section}]`);
  if (`#${value}` !== want) fail(`swaynag [${section}] ${key} is #${value}, want ${want}`);
  nagSeen.add(`${section}.${key}`);
}
const nagKeys = Object.keys(NAG).length + 1;
if (nagSeen.size !== nagKeys * Object.keys(NAG_LINE).length) {
  fail("themes/swaynag.conf is missing colors");
}
console.log(
  `files: ${vars.size} palette variables, ${clients.size} window color lines and ${nagSeen.size} swaynag colors match the spec`,
);

// ---------------------------------------------------------------- 2-3. the apps

/** Lines that report a real problem, without the container's own noise. */
function errors(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => /error|warn|could not|invalid|unknown/i.test(l))
    .filter((l) => !/Proprietary Nvidia drivers|Failed to connect to user bus/.test(l));
}

function checkBar(file: string, label: string): void {
  const json = JSON.parse(readFileSync(file, "utf8")) as { colors?: Record<string, string> };
  for (const [key, want] of Object.entries(BAR)) {
    // sway reports #rrggbbaa, i3 #rrggbb.
    const got = json.colors?.[key]?.toLowerCase().replace(/^(#[0-9a-f]{6})ff$/, "$1");
    if (got !== want) fail(`${label}: bar ${key} is ${got}, want ${want}`);
  }
}

for (const release of releases) {
  const tag = image({ name: "mistpine-sway", release, context: join(ROOT, "scripts", "render") });
  const out = mkdtempSync(join(tmpdir(), "mistpine-sway-verify-"));
  try {
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "--init",
        "-v",
        `${join(ROOT, "themes")}:/themes:ro`,
        "-v",
        `${join(ROOT, "examples")}:/examples:ro`,
        "-v",
        `${join(ROOT, "scripts", "verify", "run.sh")}:/run.sh:ro`,
        "-v",
        `${out}:/out`,
        "--user",
        `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        "-e",
        "HOME=/tmp/home",
        tag,
        "sh",
        "/run.sh",
      ],
      { stdio: ["ignore", "inherit", "inherit"], timeout: 120_000 },
    );
    const [swayWant, i3Want] = RELEASES[release];
    const sway = readFileSync(join(out, "sway.version"), "utf8").match(/sway version (\S+)/)?.[1];
    const i3 = readFileSync(join(out, "i3.version"), "utf8").match(/i3 version (\S+)/)?.[1];
    if (!sway?.startsWith(swayWant)) fail(`ubuntu:${release} has sway ${sway}`);
    if (!i3?.startsWith(i3Want)) fail(`ubuntu:${release} has i3 ${i3}`);
    const label = `sway ${sway}, i3 ${i3} (ubuntu:${release})`;

    for (const [file, what] of [
      ["sway-check.err", "sway -C"],
      ["i3-check.err", "i3 -C"],
      ["sway.log", "sway"],
      ["i3.log", "i3 and i3bar"],
    ] as const) {
      const found = errors(join(out, file));
      if (found.length) fail(`${label}: ${what} reported:\n  ${found.join("\n  ")}`);
    }
    checkBar(join(out, "sway-bar.json"), `sway ${sway}`);
    checkBar(join(out, "i3-bar.json"), `i3 ${i3}`);
    for (const type of Object.keys(NAG_LINE)) {
      const code = readFileSync(join(out, `swaynag-${type}.exit`), "utf8").trim();
      const said = readFileSync(join(out, `swaynag-${type}.err`), "utf8").trim();
      // 124: still running when timeout stopped it, so the config loaded.
      if (code !== "124" || said) fail(`${label}: swaynag -t ${type} exited ${code}: ${said}`);
    }
    console.log(
      `${label}: no errors; bar colors over IPC match the spec in both; swaynag takes the config`,
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
