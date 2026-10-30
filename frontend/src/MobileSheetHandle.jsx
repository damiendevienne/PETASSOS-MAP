export default function MobileSheetHandle({ expanded, onToggle, className = '', onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  return (
    <button
      className={`sheet-handle${className ? ` ${className}` : ''}`}
      type="button"
      aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
      aria-expanded={expanded}
      onClick={onToggle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span />
    </button>
  );
}
