# Translation & Versification Architecture

## 1. Text vs. Versification (v11n)

- **Translation**: The linguistic text translated by a scholar (e.g., *Louis Segond 1910*, *World English Bible*).
- **Versification (`v11n`)**: The chapter and verse numbering grid. Different linguistic traditions use different historical grids:
  - `v11n: Segond` (Masoretic/French tradition, 31,170 verses): Numbers Psalm superscriptions as verse 1; uses Hebrew OT chapter breaks (e.g., Ex 7:26–29).
  - `v11n: KJV` (English/Global baseline, 31,095–31,102 verses): Unnumbered Psalm superscriptions; English OT chapter breaks (e.g., Ex 8:1–4).

---

## 2. Canonical Baseline: KJV Versification

`bibleit` standardizes all bundled translations on the **KJV versification baseline**:
- **Semantic Address Parity**: Canonical verse addresses (`BOOK:CH:V`) point to the exact same passage across all languages:
  - `EXO:8:1` (EN & FR): *"Yahweh said to Moses: Go to Pharaoh..."* / *"L'Éternel dit à Moïse: Va vers Pharaon..."*
  - `PSA:23:1` (EN & FR): *"Yahweh is my shepherd..."* / *"L'Éternel est mon berger..."*
- Avoids cross-language address drift between the reader, search retrieval, and saved bookmarks.

---

## 3. Bundled Translations

| Translation ID | Language | Full Name | License | Upstream Source | Versification | Verse Count |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `web` | `en` | World English Bible | Public Domain | eBible.org | KJV (Majority) | 31,095 |
| `lsg` | `fr` | Louis Segond 1910 | Public Domain | data-bible (KJV v11n) | KJV (TR) | 31,102 (31,095 aligned) |

*Note: The 7-verse delta represents Textus Receptus verses (Lk 17:36, Ac 8:37, Ac 15:34, Ac 24:7, Ro 16:25–27) omitted from WEB majority-text numbering.*

---

## 4. Client Coupling: Language Switch & Translation

To keep settings simple and prevent user configuration friction:
- The **Interface Language** selector directly governs the active Scripture translation:
  - `English` $\rightarrow$ World English Bible (`web`)
  - `Français` $\rightarrow$ Louis Segond 1910 (`lsg`)
- **Documented In-Place**: The Settings UI explicitly describes this coupling under the language dropdown (`English (World English Bible - WEB)` / `Français (Louis Segond 1910 - LSG)`) so users understand what selecting each language does.
