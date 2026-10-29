export default function MobileSheetHandle({ expanded, onToggle }) {
  return (
    <button
      className="sheet-handle"
      type="button"
      aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span />
    </button>
  );
}
