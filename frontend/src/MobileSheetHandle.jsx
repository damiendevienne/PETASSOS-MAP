export default function MobileSheetHandle({ expanded, onToggle, className = '', onPointerDown, onPointerMove, onPointerUp, onPointerCancel, t = (key) => key }) {
  return (
    <button
      className={`sheet-handle${className ? ` ${className}` : ''}`}
      type="button"
      aria-label={expanded ? t('panel.collapse') : t('panel.expand')}
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
