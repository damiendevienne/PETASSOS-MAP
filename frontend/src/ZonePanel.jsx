export default function ZonePanel({ zones, selectedId, draft, drawing, editing, error, onNameChange, onSelect, onEdit, onFocus, onDelete, onSave, onCancel, onRedraw }) {
  if (draft) {
    const hasRectangle = draft.min_lat !== null && !drawing;
    return <>
      <div className="work-panel-heading"><h1>{editing ? 'Edit zone' : 'New zone'}</h1></div>
      <form className="place-form zone-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <label htmlFor="zone-name">Name *</label>
        <input id="zone-name" value={draft.name} onChange={(event) => onNameChange(event.target.value)} required autoFocus />
        <p className="zone-instruction">{drawing ? 'Click the opposite corner to finish the rectangle.' : hasRectangle ? 'Drag the map handles to move or resize this zone.' : 'Click two opposite corners on the map to draw a rectangle.'}</p>
        {hasRectangle && <button className="zone-redraw" type="button" onClick={onRedraw}>Draw again</button>}
        {editing?.used_by_count > 0 && <p className="zone-usage">Used by {editing.used_by_count} shared map{editing.used_by_count === 1 ? '' : 's'}.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="place-form-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!draft.name.trim() || !hasRectangle}>Save zone</button>
        </div>
      </form>
    </>;
  }

  return <>
    <div className="work-panel-heading">
      <h1>Zones</h1>
      <span className="item-count">{zones.length}</span>
    </div>
    <p className="current-view-label">ALL SAVED ZONES · INDEPENDENT OF MAP VIEW</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="place-list-scroll">
      {zones.length ? <div className="place-list">
        {zones.map((zone) => {
          const selected = zone.id === selectedId;
          return <div className={`place-card-row${selected ? ' expanded' : ''}`} key={zone.id}>
            <button className={`place-card zone-card${selected ? ' selected' : ''}`} type="button" aria-expanded={selected} onClick={() => onSelect(selected ? null : zone)}>
              <span className="zone-card-swatch" aria-hidden="true" />
              <span className="place-card-text"><strong>{zone.name}</strong></span>
            </button>
            {selected && <div className="place-card-details zone-card-details">
              {zone.used_by_count > 0 && <small>Used by {zone.used_by_count} shared map{zone.used_by_count === 1 ? '' : 's'}</small>}
              <div className="place-card-actions">
                <button className="place-card-edit" type="button" onClick={() => onEdit(zone)} disabled={!zone.can_edit}>Edit</button>
                <button className="place-card-edit place-card-focus" type="button" onClick={() => onFocus(zone)} aria-label={`Center map on ${zone.name}`} title="Center map on this zone">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="7" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                  </svg>
                </button>
                <button className="place-card-edit zone-delete" type="button" onClick={() => onDelete(zone)} disabled={!zone.can_delete} title={zone.can_delete ? 'Delete zone' : 'This zone is used by shared maps'}>Delete</button>
              </div>
            </div>}
          </div>;
        })}
      </div> : <div className="empty-state"><span className="empty-state-mark" aria-hidden="true">▢</span><p>No zones yet.</p></div>}
    </div>
  </>;
}
