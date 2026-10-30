import { noteMarkerUrl, placeMarkerUrl } from './markerIcons.js';

export function recordInViewport(record, viewport) {
  return !viewport || (
    record.latitude >= viewport.south && record.latitude <= viewport.north &&
    record.longitude >= viewport.west && record.longitude <= viewport.east
  );
}

export default function RecordCard({ record, selected, highlighted = selected, selectedRef, coverUrl, coverAlt = '', showPublication = false, distanceKm, onSelect, onEdit, onFocus, children }) {
  const note = record.kind === 'NOTE';
  const markerUrl = note
    ? noteMarkerUrl
    : placeMarkerUrl(record.category_icon, record.category_color, record.category_marker_style);

  return <div className={`place-card-row${selected ? ' expanded' : ''}${note ? ' note-row' : ''}`} ref={highlighted ? selectedRef : null}>
    <button className={`place-card${note ? ' note-card' : ''}${highlighted ? ' selected' : ''}`} type="button" aria-expanded={selected} onClick={onSelect}>
      <img className="place-card-marker" src={markerUrl} alt="" />
      <span className="place-card-text"><strong>{record.name}</strong><small>{note ? 'Internal note' : record.category_name}</small></span>
      {distanceKm !== null && distanceKm !== undefined && <small className="place-card-distance">{distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km</small>}
      {coverUrl && <img className="place-card-cover" src={coverUrl} alt={coverAlt} loading="lazy" />}
      {showPublication && !note && <span className={`place-card-status ${record.published ? 'published' : 'draft'}`}>{record.published ? 'Published' : 'Draft'}</span>}
    </button>
    {selected && <div className="place-card-details">
      {record.description && <p>{record.description}</p>}
      {record.author && <small>By {record.author}</small>}
      {record.link_url && <a className="place-card-link" href={record.link_url} target="_blank" rel="noopener noreferrer">{record.link_url} ↗</a>}
      {children}
      {(onEdit || onFocus) && <div className="place-card-actions">
        {onEdit && <button className="place-card-edit" type="button" onClick={onEdit} aria-label={`Edit ${record.name}`}>Edit</button>}
        {onFocus && <button className="place-card-edit place-card-focus" type="button" onClick={onFocus} aria-label={`Center map on ${record.name}`} title="Center map on this point">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
        </button>}
      </div>}
    </div>}
  </div>;
}
