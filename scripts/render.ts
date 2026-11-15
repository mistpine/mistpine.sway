/**
 * Renders the README images from sway and i3 themselves and checks their
 * pixels:
 *
 * - assets/preview.png: sway with tabs, a split, the bar and an urgent
 *   workspace.
 * - assets/screenshots/swaynag.png: the exit prompt over an urgent window.
 * - assets/screenshots/i3.png: the same desktop in i3, on X11.
 *
 * Everything runs in Docker (scripts/render/Dockerfile, scene.sh): headless
 * sway and Xvfb with foot and xterm windows in the spec's terminal colors.
 * The README images come from Ubuntu 26.04 (sway 1.11, i3 4.25); 24.04
 * (sway 1.9, i3 4.23) renders the same scenes for the pixel checks only.
 *
 * Every screenshot must contain each role's color exactly, or the render
 * fails. The colors come from the spec, through the same roles as
 * verify.ts.
 *
 *   pnpm render
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpec, ROOT } from "./lib/colors.ts";
import { image } from "./lib/docker.ts";
import { type Expect, expectPixels, load } from "./lib/pixels.ts";

const WORK = join(ROOT, ".render");
const ASSETS = join(ROOT, "assets");
const { spec } = await loadSpec();
const ui = (name: string) => (spec.ui[name]?.hex ?? "").toLowerCase();
const pal = (name: string) => (spec.palette[name] ?? "").toLowerCase();

// ---------------------------------------------------------------- scenes

interface Scene {
  name: "desktop" | "swaynag" | "i3";
  /** Where the 26.04 render goes, relative to assets/, and the crop (w×h+x+y). */
  asset: string;
  crop?: string;
  expect: Expect[];
}

// Minimums are about half of what a good render has (2000×1400, scale 2).
const SCENES: Scene[] = [
  {
    name: "desktop",
    asset: "preview.png",
    expect: [
      { label: "focused title", hex: ui("selection"), min: 30_000 },
      { label: "focused frame (accent)", hex: ui("accent"), min: 5_000 },
      { label: "split indicator", hex: pal("orange"), min: 2_000 },
      { label: "unfocused titles", hex: ui("tabInactiveBg"), min: 40_000 },
      { label: "bar and active tab", hex: ui("statusBg"), min: 90_000 },
      { label: "borders and separators", hex: ui("border"), min: 8_000 },
      { label: "urgent workspace", hex: ui("error"), min: 1_000 },
      { label: "focused title text", hex: ui("editorFg"), min: 2_000 },
      { label: "bar and active tab text", hex: ui("statusFg"), min: 150 },
      { label: "unfocused title text", hex: pal("fg1"), min: 200 },
    ],
  },
  {
    name: "swaynag",
    asset: "screenshots/swaynag.png",
    crop: "2000x560+0+0",
    expect: [
      { label: "swaynag and bar", hex: ui("statusBg"), min: 150_000 },
      { label: "warning line", hex: ui("warning"), min: 4_000 },
      { label: "button and focused title", hex: ui("selection"), min: 30_000 },
      { label: "focused frame (accent)", hex: ui("accent"), min: 9_000 },
      { label: "urgent window", hex: ui("error"), min: 40_000 },
      { label: "message and title text", hex: ui("editorFg"), min: 2_500 },
    ],
  },
  {
    name: "i3",
    asset: "screenshots/i3.png",
    // i3 draws the split indicator only on a lone window's edge: no orange.
    expect: [
      { label: "focused title", hex: ui("selection"), min: 20_000 },
      { label: "focused frame (accent)", hex: ui("accent"), min: 6_000 },
      { label: "unfocused titles", hex: ui("tabInactiveBg"), min: 30_000 },
      { label: "bar and active tab", hex: ui("statusBg"), min: 90_000 },
      { label: "borders and separators", hex: ui("border"), min: 8_000 },
      { label: "urgent workspace", hex: ui("error"), min: 800 },
      { label: "focused title text", hex: ui("editorFg"), min: 2_000 },
      { label: "bar and active tab text", hex: ui("statusFg"), min: 300 },
      { label: "unfocused title text", hex: pal("fg1"), min: 400 },
    ],
  },
];

const RELEASES = ["26.04", "24.04"];

// ---------------------------------------------------------------- terminals

/** foot and xterm in the spec's terminal colors, so the windows look like mistpine. */
function terminals(dir: string): void {
  const ansi = spec.ansi.map((t) => t.hex.toLowerCase());
  const t = spec.terminal;
  const bg = t.background?.hex.toLowerCase() ?? "";
  const fg = t.foreground?.hex.toLowerCase() ?? "";
  const plain = (h: string) => h.slice(1);
  writeFileSync(
    join(dir, "foot.ini"),
    [
      "[main]",
      "font=JetBrains Mono:size=10",
      "pad=8x6",
      "[colors]",
      `background=${plain(bg)}`,
      `foreground=${plain(fg)}`,
      ...ansi.slice(0, 8).map((h, i) => `regular${i}=${plain(h)}`),
      ...ansi.slice(8).map((h, i) => `bright${i}=${plain(h)}`),
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "xterm.ad"),
    [
      `XTerm*background: ${bg}`,
      `XTerm*foreground: ${fg}`,
      "XTerm*internalBorder: 8",
      ...ansi.map((h, i) => `XTerm*color${i}: ${h}`),
      "",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------- run

rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(ASSETS, "screenshots"), { recursive: true });
const failures: string[] = [];
const uid = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`;

for (const release of RELEASES) {
  const tag = image(release);
  const out = join(WORK, release);
  mkdirSync(out, { recursive: true });
  terminals(out);
  for (const scene of SCENES) {
    const label = `${scene.name} (ubuntu:${release})`;
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
        `${join(ROOT, "scripts", "render")}:/scene:ro`,
        "-v",
        `${out}:/out`,
        "--user",
        uid,
        "-e",
        "HOME=/tmp/home",
        tag,
        "sh",
        "/scene/scene.sh",
        scene.name,
      ],
      { stdio: ["ignore", "ignore", "inherit"], timeout: 120_000 },
    );
    const base = join(out, scene.name);
    const fails = expectPixels(load(base), scene.expect);
    if (fails.length) {
      failures.push(`${label}:\n  ${fails.join("\n  ")}`);
      console.log(`✗ ${label}`);
      continue;
    }
    console.log(`✓ ${label}`);
    if (release !== "26.04") continue;
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${out}:/out`,
        "-v",
        `${ASSETS}:/assets`,
        "--user",
        uid,
        tag,
        "convert",
        `/out/${scene.name}.png`,
        ...(scene.crop ? ["-crop", scene.crop, "+repage"] : []),
        "-strip",
        `/assets/${scene.asset}`,
      ],
      { stdio: "inherit" },
    );
  }
}

if (failures.length) {
  console.error(`render: pixel checks failed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`wrote ${SCENES.map((s) => `assets/${s.asset}`).join(", ")}`);
