# bibleit Vocabulary

- **Bible**: the whole corpus for one translation, an ordered set of books.
- **Testament**: top-level grouping of books, Old Testament (39 books) and New
  Testament (27 books). Some traditions include additional deuterocanonical
  books. Need to decide: 66-book Protestant canon only, or configurable per
  translation.
- **Book**: Genesis or John, for example. Has a name (localized per language),
  an abbreviation, an order position, a chapter count.
- **Chapter**: numbered subdivision of a book. Added in the 13th century, not
  part of the original text.
- **Verse**: numbered subdivision of a chapter, the smallest addressable unit
  in most tooling. Added in the 16th century by Robert Estienne.
- **Versification**: the scheme mapping (book, chapter, verse) to text.
  Different translations can split or number verses differently for the same
  passage, so a reference isn't guaranteed to point at the same text boundary
  across translations.
- **Pericope**: a self-contained passage, such as a parable, a speech, or a
  scene, independent of chapter/verse boundaries.
