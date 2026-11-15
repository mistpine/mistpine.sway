/**
 * Writes the sway and i3 files from the mistpine spec:
 *
 * - themes/mistpine.conf: the palette as $mistpine-* variables and the
 *   client.* window colors, for `include` in a sway or i3 config.
 * - themes/swaynag.conf: swaynag's colors, for ~/.config/swaynag/config.
 * - examples/bar.conf: a `colors` block for swaybar and i3bar, built on the
 *   variables. The README shows it; pnpm verify loads it.
 *
 *   pnpm generate          write the files
 *   pnpm generate --check  fail if any file is out of date
 *
 * Every color comes from palette/mistpine.json in the reference repository
 * (read by @mistpine/port-kit). Before anything is written, every text color is
 * checked against the background it sits on (4.5:1). pnpm verify then loads
 * the files in sway and i3 themselves.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { contrast, loadSpec, mix, type Spec } from "@mistpine/port-kit";

const ROOT = join(import.meta.dirname, "..");

const check = process.argv.includes("--check");
const { spec, source } = await loadSpec(ROOT);

/** A palette key (`bg1`) or a spec token (`ui.panelBg`), resolved to its palette key. */
function token(key: string): { hex: string; palette: string } {
  const [group, name] = key.includes(".") ? key.split(".", 2) : ["palette", key];
  const table = spec[group as keyof Spec] as Record<string, unknown> | undefined;
  const value = table?.[name as string];
  if (typeof value === "string") return { hex: value.toLowerCase(), palette: name as string };
  const t = value as { hex?: string; ref?: string } | undefined;
  if (!t?.hex) throw new Error(`the spec has no color ${key}`);
  // Every color here must be a palette color, so it can be written as a variable.
  if (!t.ref) throw new Error(`${key} is a derived color, not a palette color`);
  return { hex: t.hex.toLowerCase(), palette: t.ref };
}

/** The variable for a palette key: `brightRed` → `$mistpine-bright-red`. */
const variable = (key: string) =>
  `$mistpine-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
const v = (key: string) => variable(token(key).palette);
const hexOf = (key: string) => token(key).hex;

/** Recomputes the spec's blends, so the port provably uses the spec's math. */
function verifyBlends(): void {
  const names: Record<string, string> = {
    "@terminal.background": spec.terminal.background?.hex ?? "",
  };
  let checked = 0;
  for (const [name, t] of Object.entries(spec.ui)) {
    if (!t.derived) continue;
    const m = t.derived.match(/^mix\((\S+), \$(\w+), (\d+)%\)$/);
    if (!m) throw new Error(`ui.${name}: unknown blend ${t.derived}`);
    const [, base, key, pct] = m as unknown as [string, string, string, string];
    const got = mix(names[base] ?? hexOf(base.replace(/^\$/, "")), hexOf(key), Number(pct) / 100);
    if (got !== t.hex) throw new Error(`ui.${name}: ${t.derived} gives ${got}, spec says ${t.hex}`);
    checked++;
  }
  if (checked === 0) throw new Error("the spec has no blends: did its format change?");
}

// ---------------------------------------------------------------- mapping

/**
 * Window colors: [class, border, background, text, indicator?, child_border?].
 * `border` and `background` paint the title bar, `child_border` the window
 * frame, `indicator` the edge where the next window will open.
 */
const CLIENT: [string, string, string, string, string?, string?][] = [
  // The focused window: a raised title (the selection, bg3) under fg3 in an
  // accent frame; the split indicator in orange, as rofi's selection caret.
  ["focused", "ui.accent", "ui.selection", "ui.editorFg", "orange", "ui.accent"],
  // Focused inside a container that is not: a status line (bg2, fg2) in bg4.
  ["focused_inactive", "ui.border", "ui.statusBg", "ui.statusFg", "ui.border", "ui.border"],
  // The active tab of an unfocused tabbed or stacked container.
  ["focused_tab_title", "ui.border", "ui.statusBg", "ui.statusFg"],
  // Everything else recedes like an inactive tab (bg0) with muted text.
  ["unfocused", "ui.statusBg", "ui.tabInactiveBg", "fg1", "ui.statusBg", "ui.statusBg"],
  // Asking for attention: filled red, as rofi's urgent rows.
  ["urgent", "ui.error", "ui.error", "ui.panelBg", "ui.error", "ui.error"],
  // Restored layouts waiting for their windows (i3 append_layout).
  ["placeholder", "ui.panelBg", "ui.panelBg", "ui.statusFg", "ui.panelBg", "ui.panelBg"],
];

/** swaybar and i3bar: [property, ...colors]. */
const BAR: [string, ...string[]][] = [
  ["background", "ui.statusBg"],
  ["statusline", "ui.statusFg"],
  ["separator", "ui.border"],
  // class: border, background, text
  ["focused_workspace", "ui.accent", "ui.selection", "ui.editorFg"],
  ["active_workspace", "ui.border", "ui.statusBg", "ui.statusFg"],
  ["inactive_workspace", "ui.statusBg", "ui.statusBg", "fg1"],
  ["urgent_workspace", "ui.error", "ui.error", "ui.panelBg"],
  // A binding mode (resize) is a warning: the keys do something else now.
  ["binding_mode", "ui.warning", "ui.warning", "ui.panelBg"],
];

/** swaynag: per message type, the line under the bar in the type's color. */
const NAG_TYPES: [string, string][] = [
  ["error", "ui.error"],
  ["warning", "ui.warning"],
];
const NAG: [string, string][] = [
  ["background", "ui.statusBg"],
  ["text", "ui.editorFg"],
  ["border", "ui.border"],
  ["button-background", "ui.selection"],
  ["button-text", "ui.editorFg"],
  ["details-background", "ui.panelBg"],
];

// ---------------------------------------------------------------- lint

const failures: string[] = [];
function needContrast(what: string, fg: string, bg: string): void {
  const r = contrast(hexOf(fg), hexOf(bg));
  if (r < 4.5) failures.push(`${what}: ${fg} on ${bg} is ${r.toFixed(2)}:1, want 4.5:1`);
}
for (const [cls, , bg, text] of CLIENT) needContrast(`client.${cls} title`, text, bg);
for (const [prop, , bg, text] of BAR) if (text && bg) needContrast(`bar ${prop}`, text, bg);
needContrast("bar statusline", "ui.statusFg", "ui.statusBg");
for (const [t] of NAG_TYPES) {
  needContrast(`swaynag ${t} text`, "ui.editorFg", "ui.statusBg");
  needContrast(`swaynag ${t} button`, "ui.editorFg", "ui.selection");
}
verifyBlends();

// ---------------------------------------------------------------- write

const RULE = "#".repeat(76);
const header = (lines: string[]) =>
  [
    RULE,
    ...lines.map((l) => (l ? `# ${l}` : "#")),
    "#",
    "# Generated by scripts/generate.ts from the mistpine spec",
    "# (https://github.com/mistpine/mistpine/blob/main/palette/mistpine.json).",
    "# Do not edit by hand.",
    RULE,
  ].join("\n");

const pad = (cells: string[], widths: number[]) =>
  cells.map((c, i) => (i < cells.length - 1 ? c.padEnd(widths[i] ?? 0) : c)).join(" ");
function table(rows: string[][], indent = ""): string {
  const widths: number[] = [];
  for (const r of rows) {
    for (const [i, c] of r.entries()) widths[i] = Math.max(widths[i] ?? 0, c.length);
  }
  return rows.map((r) => indent + pad(r, widths).trimEnd()).join("\n");
}

const paletteKeys = Object.keys(spec.palette);
const conf = [
  header([
    "mistpine for sway and i3: https://github.com/mistpine/mistpine.sway",
    "MIT License",
    "",
    "Include it from your config, before anything that uses the variables:",
    "  include ~/.config/sway/mistpine.conf",
  ]),
  "",
  "# The palette, for your own bar colors, gaps or borders.",
  table(paletteKeys.map((k) => ["set", variable(k), (spec.palette[k] as string).toLowerCase()])),
  "",
  "# Window colors. The title bar is border and background; the frame is",
  "# child_border; indicator marks where the next window opens.",
  table([
    ["# class", "border", "background", "text", "indicator", "child_border"],
    ...CLIENT.map(([cls, ...colors]) => [
      `client.${cls}`,
      ...colors.filter((c): c is string => !!c).map(v),
    ]),
  ]),
  "",
  "# i3 paints this behind windows that do not fill their space; sway",
  "# accepts it and does nothing.",
  `client.background ${v("ui.editorBg")}`,
  "",
].join("\n");

const nag = [
  header([
    "mistpine for swaynag: https://github.com/mistpine/mistpine.sway",
    "MIT License",
    "",
    "Save as ~/.config/swaynag/config, or copy the sections into yours.",
    "Colors are RRGGBB without #, as swaynag wants them.",
  ]),
  "",
  ...NAG_TYPES.flatMap(([type, line]) => [
    `[${type}]`,
    ...NAG.map(([k, t]) => `${k}=${hexOf(t).slice(1)}`),
    `border-bottom=${hexOf(line).slice(1)}`,
    "border-bottom-size=2",
    "",
  ]),
].join("\n");

const bar = [
  "# mistpine colors for swaybar and i3bar. In hex, not the $mistpine-*",
  "# variables: i3 keeps variables inside the file that sets them.",
  "bar {",
  "    colors {",
  table(
    [
      ["# class", "border", "background", "text"],
      ...BAR.map(([prop, ...colors]) => [prop, ...colors.map(hexOf)]),
    ],
    "        ",
  ),
  "    }",
  "}",
  "",
].join("\n");

// The README shows the bar colors; they must be the example's, verbatim.
const snippet = bar
  .split("\n")
  .filter((l) => l.startsWith("    "))
  .map((l) => l.slice(4))
  .join("\n");
if (!readFileSync(join(ROOT, "README.md"), "utf8").includes(`\n${snippet}\n`)) {
  failures.push("README.md: the bar colors differ from examples/bar.conf");
}

if (failures.length) {
  console.error(`generate: ${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

const outputs: [string, string][] = [
  ["themes/mistpine.conf", conf],
  ["themes/swaynag.conf", nag],
  ["examples/bar.conf", bar],
];
let stale = 0;
for (const [rel, text] of outputs) {
  const file = join(ROOT, rel);
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {}
  if (current === text) continue;
  if (check) {
    console.error(`${rel} is out of date: run pnpm generate`);
    stale++;
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${rel}`);
}
if (stale) process.exit(1);
console.log(`${check ? "up to date" : "done"} (spec: ${source})`);
