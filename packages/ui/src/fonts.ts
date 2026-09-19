import localFont from "next/font/local";

/**
 * Inter, self-hosted.
 *
 * The theme reads `--font-inter`; the app puts this class on `<html>` and the
 * variable is set. Served from this repository rather than Google Fonts so a
 * build needs no network and visitors make no third-party request.
 *
 * One file: the variable weight axis for the latin subset (U+0000–00FF and
 * punctuation), which covers English and Spanish. Fontsource's build of the
 * upstream release, licensed under the OFL — see ./fonts/LICENSE-Inter.txt.
 * Add `latin-ext` alongside it before adding a language that needs it.
 */
export const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  // Metric-compatible fallback while the file loads, so text does not shift.
  adjustFontFallback: "Arial",
});
