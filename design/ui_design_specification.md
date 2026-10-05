# bibleit — UI & Visual Design Specification

*Status: Approved UX Concept (Search, Reader, Inspector Mode, Settings).*

---

## 1. Design Philosophy: Reverence Meets Velocity

`bibleit` serves two distinct audiences who both love scripture:
1. **The Everyday Reader**: Wants a peaceful, distraction-free, beautiful reading experience with instant search. No technical clutter, no algorithms in their face.
2. **The Search Engineer / Bible Scholar**: Wants to inspect retrieval accuracy, cosine similarity, BM25 term scores, RRF ranks, and embedding model parameters.

### The Solution: "Retrieval Inspector Mode" (Scholar Toggle)
Instead of forcing technical metrics on everyone or hiding them completely, `bibleit` introduces an **Inspector Mode** toggle in Settings (and quick toggle):
- **When OFF (Default / Reader Mode)**: 
  - Pure literary experience. Cards show only canonical scripture text, pericope titles, and clean actions.
  - Zero scores, zero algorithmic jargon.
- **When ON (Inspector / Scholar Mode)**:
  - Transparent IR diagnostics: Cosine similarity scores (`cos: 0.912`), BM25 score metrics (`BM25: 4.82`), model parameters (`Xenova/all-MiniLM-L6-v2 int8`), query embedding latency (`42ms`), and Reciprocal Rank Fusion ranks.

---

## 2. Interaction Flows: What Happens on Every Tap

### Flow A: From Search Result to Continuous Reading
1. User types `peace that surpasses understanding` in the Omnisearch bar.
2. Result card appears: `Philippians 4:7`.
3. User has two immediate options:
   - **Option 1: Inline Context Peek**: Tapping **`+ Expand verses 6–8`** slides open an inline accordion inside the card showing the adjacent verses. The user never loses their search list.
   - **Option 2: Deep Reading**: Tapping **`Read chapter →`** transitions the app to the **Reader View**:
     - Automatically loads *Philippians Chapter 4*.
     - Smoothly scrolls down to verse 7.
     - Temporarily highlights verse 7 with a warm amber glow to ground the reader's eye.

### Flow B: Interacting in Reader View
1. The user reads continuous text in generous editorial serif typography.
2. Tapping any verse (e.g. verse 3):
   - Opens a subtle bottom **Verse Action Tray**: `Copy`, `Save / Bookmark`, `Share`.
3. Tapping the Book/Chapter title at the top (`Philippians 4 ▾`):
   - Opens a drawer to quickly jump between the 66 books of the Protestant canon and their chapters.

### Flow C: Settings & Storage Control
1. User navigates to the **Settings** tab.
2. Controls include:
   - **Retrieval Inspector Mode**: Toggle to reveal or hide algorithmic scores.
   - **Active Translation**: Switch between bundled public-domain texts (World English Bible - WEB, Louis Segond 1910 - LSG).
   - **Offline Storage Footprint**: Shows OPFS cache utilization (e.g. `38.4 MB cached`) with a **Free Up Local Space** button to purge indexed tables or force a clean re-download.

---

## 3. Visual Atmospheres & Design Tokens

| Token | Day / Paper | Warm / Sepia | Night / Obsidian (OLED) |
|---|---|---|---|
| **Page Canvas** | `#FBFBF9` (linen) | `#F4EEDD` (parchment) | `#0C0A09` (true black) |
| **Card Surface** | `#FFFFFF` | `#FAF6ED` | `#171412` |
| **Borders** | `#E8E8E2` | `#E2D7C0` | `#292524` |
| **Scripture Text** | `#1C1917` (warm charcoal) | `#2D241E` (espresso) | `#F5F5F4` (chalk) |
| **Secondary / Meta** | `#78716C` (stone) | `#766557` | `#A8A29E` |
| **Verse Numbers** | `opacity: 0.45` | `opacity: 0.45` | `opacity: 0.40` |
| **Highlighted Verse** | `#FEF3C7` (soft amber) | `#E9DCBD` | `#451A03` |

### Signal Badges (Inspector Mode)
- **Exact Reference**: `#ECFDF5` background, `#065F46` text.
- **Semantic Passage**: `#FEF3C7` background, `#92400E` text.
- **Keyword Match (BM25)**: `#F1F5F9` background, `#334155` text.

---

## 4. Typography Scale

- **Scripture Reading**: Variable Serif (`Newsreader` or `Literata`), `18px`, line height `1.75` for prolonged readability.
- **Verse Superscript**: Tabular figures, `11px`, `opacity: 0.45`.
- **UI Labels & Controls**: Modern geometric sans (`Plus Jakarta Sans`), `12px` to `14px`.
- **Inspector Diagnostics**: Monospace (`ui-monospace`, `JetBrains Mono`), `10px` to `11px`.
