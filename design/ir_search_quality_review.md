# Information Retrieval (IR) & Search Quality Review

*This document captures the IR and search quality analysis from the architectural review to guide future retrieval and indexing iterations.*

---

## 1. The "Disembodied Chunk" Problem (Semantic Dilution)

### Location
[`ingest/bibleit_ingest/chunking.py`](file:///home/hjisaac/Devs/bibleit/ingest/bibleit_ingest/chunking.py) (`render_chunk_text`):
```python
def render_chunk_text(chunk, ordered_verses, address_index):
    blocks = []
    for p in chunk.pericopes:
        ...
        blocks.append(f"{p.heading}\n{verses_text}")
    return "\n\n".join(blocks)
```

### The Issue
The rendered string contains the pericope heading and verses, but **nowhere in the text does the Book Name or Chapter Number appear**.

### Retrieval Impact
1. **Parallel Narratives (The Synoptic Gospel problem)**:
   Passages describing the feeding of the 5,000 in Mark 6 and Luke 9 share nearly identical phrasing and headings (*"Jesus Feeds the Five Thousand"*). A query like *"Feeding 5000 in Mark"* or *"Mark loaves and fishes"* will fail or rank Mark below Luke because the document vector has zero lexical or semantic signal for the token `"Mark"`.
2. **Missing Canonical Grounding**:
   Dense models (such as `nomic-embed-text-v1.5` or `bge`) are trained heavily on Web and Wikipedia passages that begin with explicit subject grounding (e.g., `"Exodus 20: The Ten Commandments..."`). Without canonical book context, small pericopes lose high-level topical context.

### Recommendation
Prepend book/chapter hierarchical context:
```python
f"[{chunk.book} {p.chapter}] {p.heading}\n{verses_text}"
```
This immediately boosts disambiguation and query-passage alignment for book-specific queries.

---

## 2. Verse-Count vs. Token-Density Asymmetry

### Location
[`ingest/bibleit_ingest/chunking.py`](file:///home/hjisaac/Devs/bibleit/ingest/bibleit_ingest/chunking.py) (`AdaptiveWindowChunker`):
```python
AdaptiveWindowChunker(floor=5, ceiling=30, overlap=1)
```

### The Issue
Chunk boundaries are decided purely by **verse counts** ($5 \le \text{verses} \le 30$).
Biblical verses have massive variance in token density:
- *Genesis 1:1* is ~10 tokens.
- *Esther 8:9* is ~80 tokens.
- 5 short verses can yield **under 60 tokens** (sparse context, high vector noise).
- 30 long verses can produce **over 900 tokens**, blowing through the 512 context limit and causing silent tail truncation!

### Recommendation
Keep pericopes as the semantic atomic unit, but configure merge forward/backward logic to track **accumulated tokens or words**, not just verse counts:
- **Floor**: ~100 tokens.
- **Ceiling**: ~400 tokens (leaving headroom for query expansion and headings within 512).

---

## 3. Retrieval Evaluation Fidelity (`trigger_eval`)

### Location
[`ingest/eval/helpers/__init__.py`](file:///home/hjisaac/Devs/bibleit/ingest/eval/helpers/__init__.py) (`trigger_eval`):
```python
relevant_idx = resolve_verse_to_chunk_index(address, chunks, address_index)
```

### The Issue
`resolve_verse_to_chunk_index` iterates through all chunks and all pericopes linearly for every query ($O(N)$ per query).
- For a quick 100-query test, it takes ~50ms (imperceptible).
- For multi-axis sweeps across thousands of queries, this linear scan creates unnecessary evaluation latency.

### Recommendation
Build an inverted `verse_to_chunk_id: dict[VerseAddress, int]` index **once** in $O(N)$ when chunks are built, making query resolution $O(1)$.
