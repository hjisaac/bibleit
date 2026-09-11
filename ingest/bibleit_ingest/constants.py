"""Shared constants. Anything hardcoded in more than one script belongs here."""

from enum import StrEnum
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

# Core data paths, shared across scripts. Each of these used to be
# redefined separately in several files.
WEB_PATH = REPO / "ingest/data/translations/web/en/web.json"
BSB_DIR = REPO / "ingest/data/translations/bsb/en"
BSB_PERICOPES_PATH = REPO / "ingest/data/derived/bsb_pericopes.json"

# Chunk embeddings are split across two files: the JSON holds each chunk's
# metadata (book, headings, verse span) in order, and the .npy holds the
# embedding vectors themselves, row-aligned with that order. Keeping
# vectors out of JSON avoids ever serializing thousands of floats to text,
# and lets the .npy be written one row at a time as each chunk is embedded
# instead of holding every embedding in memory until the whole run finishes.
CHUNK_EMBEDDINGS_PATH = REPO / "ingest/scripts/chunk_embeddings.json"
CHUNK_EMBEDDINGS_NPY_PATH = REPO / "ingest/scripts/chunk_embeddings.npy"

# Explicit, durable location for fastembed's downloaded model weights.
# Left to its own default, fastembed caches under the OS temp directory
# (tempfile.gettempdir(), typically /tmp/fastembed_cache), which is fine
# on this machine (a real disk, not tmpfs) but says nothing about intent:
# nothing marks that location as something meant to persist, versus
# ordinary scratch space. Keeping it here instead, alongside every other
# path this project cares about, makes "we download this once, then keep
# it" an explicit decision instead of an accident of OS defaults.
FASTEMBED_CACHE_DIR = REPO / "ingest/data/models/fastembed"


class EmbeddingModel(StrEnum):
    """
    Every embedding model this project uses or has evaluated. Behaves as a
    plain string everywhere (f-strings, JSON, equality). See the fastembed
    calls, which pass a member directly as model_name.
    """

    NOMIC_EMBED_TEXT_V1_5 = "nomic-ai/nomic-embed-text-v1.5"


# Canonical 66-book order (Protestant canon), 1-indexed by position. The
# `nr` fields in getbible.net-style JSON and BibleQA's Verse_Code both use
# this same numbering. This is the single source of truth; every script
# used to define its own copy of this list.
USFM_ORDER = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
    "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
    "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
    "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
    "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
    "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
]

# Old Testament is the first 39 books, New Testament the remaining 27. See
# design/vocabulary.md.
OLD_TESTAMENT_BOOKS = set(USFM_ORDER[:39])

BOOK_NAMES = {
    "GEN": "Genesis", "EXO": "Exodus", "LEV": "Leviticus", "NUM": "Numbers",
    "DEU": "Deuteronomy", "JOS": "Joshua", "JDG": "Judges", "RUT": "Ruth",
    "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
    "1CH": "1 Chronicles", "2CH": "2 Chronicles", "EZR": "Ezra", "NEH": "Nehemiah",
    "EST": "Esther", "JOB": "Job", "PSA": "Psalms", "PRO": "Proverbs",
    "ECC": "Ecclesiastes", "SNG": "Song of Solomon", "ISA": "Isaiah", "JER": "Jeremiah",
    "LAM": "Lamentations", "EZK": "Ezekiel", "DAN": "Daniel", "HOS": "Hosea",
    "JOL": "Joel", "AMO": "Amos", "OBA": "Obadiah", "JON": "Jonah",
    "MIC": "Micah", "NAM": "Nahum", "HAB": "Habakkuk", "ZEP": "Zephaniah",
    "HAG": "Haggai", "ZEC": "Zechariah", "MAL": "Malachi", "MAT": "Matthew",
    "MRK": "Mark", "LUK": "Luke", "JHN": "John", "ACT": "Acts",
    "ROM": "Romans", "1CO": "1 Corinthians", "2CO": "2 Corinthians", "GAL": "Galatians",
    "EPH": "Ephesians", "PHP": "Philippians", "COL": "Colossians", "1TH": "1 Thessalonians",
    "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy", "TIT": "Titus",
    "PHM": "Philemon", "HEB": "Hebrews", "JAS": "James", "1PE": "1 Peter",
    "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John", "3JN": "3 John",
    "JUD": "Jude", "REV": "Revelation",
}
