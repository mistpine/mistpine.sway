/**
 * Writes the README banner and the GitHub social preview with
 * @mistpine/port-kit: the mistpine lockup with the `.sway` suffix in
 * cyan (docs/brand.md in mistpine/mistpine).
 *
 *   pnpm banner
 *
 * The PNG is drawn by Chromium (CHROMIUM overrides playwright's).
 */
import { join } from "node:path";
import { loadSpec } from "@mistpine/port-kit";
import { writeBanners } from "@mistpine/port-kit/banner";

const ROOT = join(import.meta.dirname, "..");
const { spec } = await loadSpec(ROOT);
await writeBanners(join(ROOT, "assets"), {
  palette: spec.palette,
  ansi: spec.ansi.map((t) => t.hex),
  suffix: ".sway",
  accent: "cyan",
  label: "mistpine.sway: the mistpine color scheme for sway and i3",
});
console.log("wrote assets/banner.svg, assets/social-preview.svg, assets/social-preview.png");
