# Listing typefaces

Frank Ruhl Libre, Assistant, Noto Sans Hebrew and Heebo, SIL Open Font License 1.1. The listing page
loads these files from this directory. It does not call Google Fonts.

| File | Face | Subset |
|---|---|---|
| `assistant-hebrew.woff2` | Assistant 400–700 | Hebrew |
| `assistant-latin.woff2` | Assistant 400–700 | Latin |
| `assistant-latin-ext.woff2` | Assistant 400–700 | Latin extended |
| `frank-ruhl-hebrew.woff2` | Frank Ruhl Libre 400–900 | Hebrew |
| `frank-ruhl-latin.woff2` | Frank Ruhl Libre 400–900 | Latin |
| `frank-ruhl-latin-ext.woff2` | Frank Ruhl Libre 400–900 | Latin extended |
| `noto-sans-hebrew-hebrew.woff2` | Noto Sans Hebrew 100–900, width 62.5–100% | Hebrew |
| `noto-sans-hebrew-latin.woff2` | Noto Sans Hebrew 100–900, width 62.5–100% | Latin |
| `noto-sans-hebrew-latin-ext.woff2` | Noto Sans Hebrew 100–900, width 62.5–100% | Latin extended |
| `heebo-hebrew.woff2` | Heebo 100–900 | Hebrew |
| `heebo-latin.woff2` | Heebo 100–900 | Latin |
| `heebo-latin-ext.woff2` | Heebo 100–900 | Latin extended |

Noto Sans Hebrew carries a **width** axis as well as weight. The Living
Surfaces display type (`--ls-font-display`) uses it: titles go condensed and
large, and the motion system animates the axes. Heebo is the UI and body face.
Both come from the Fontsource 5.3.0 builds of the Google Fonts sources; only
the woff2 files are vendored, there is no npm dependency.

Licences: `OFL-Assistant.txt`, `OFL-FrankRuhlLibre.txt`, `OFL-NotoSansHebrew.txt`, `OFL-Heebo.txt`.
