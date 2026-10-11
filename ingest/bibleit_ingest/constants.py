from enum import StrEnum
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

WEB_PATH = REPO / "ingest/data/translations/web/en/web.json"
BSB_DIR = REPO / "ingest/data/translations/bsb/en"
BSB_PERICOPES_PATH = REPO / "ingest/data/derived/bsb_pericopes.json"

# JSON holds each chunk's metadata; the .npy holds the embedding vectors,
# row-aligned, written one row at a time as each chunk is embedded.
CHUNK_EMBEDDINGS_PATH = REPO / "ingest/scripts/chunk_embeddings.json"
CHUNK_EMBEDDINGS_NPY_PATH = REPO / "ingest/scripts/chunk_embeddings.npy"

# Explicit so the model cache persists, instead of fastembed's own
# OS-temp-dir default.
FASTEMBED_CACHE_DIR = REPO / "ingest/data/models/fastembed"


class EmbeddingModel(StrEnum):
    """Every embedding model this project uses. Behaves as a plain string
    everywhere (fastembed calls pass a member directly as model_name)."""

    NOMIC_EMBED_TEXT_V1_5 = "nomic-ai/nomic-embed-text-v1.5"


# Canonical 66-book order, 1-indexed. Matches getbible.net's `nr` field
# and BibleQA's Verse_Code.
USFM_ORDER = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
    "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
    "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
    "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
    "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
    "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
]

# First 39 books are Old Testament, remaining 27 New Testament.
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
