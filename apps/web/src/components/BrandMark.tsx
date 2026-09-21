// The CollabNotes mark: a rounded square holding a "C". Drawn as a path rather
// than a font glyph so it renders identically everywhere (and in the favicon).
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path className="brand-glyph" d="M21 11.6a6.4 6.4 0 1 0 0 8.8" fill="none" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      CollabNotes
    </span>
  );
}
