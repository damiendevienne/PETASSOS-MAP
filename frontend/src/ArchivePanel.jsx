import { useState } from 'react';

const COLLECTIONS = [
  ['places', 'Places'],
  ['notes', 'Notes'],
  ['zones', 'Zones'],
];

export default function ArchivePanel({ items, role, error, onRestore, onDelete, onClose }) {
  const [collection, setCollection] = useState('places');
  const records = items[collection];

  return <div className="archive-panel">
    <div className="work-panel-heading archive-heading">
      <h1>Archive</h1>
      <button className="archive-back" type="button" onClick={onClose}>← Back to editor</button>
    </div>
    <p className="archive-hint">Archived items are hidden from the working map and client maps.</p>
    <div className="archive-kinds" aria-label="Archived item type">
      {COLLECTIONS.map(([key, label]) => <button key={key} type="button" aria-pressed={collection === key} onClick={() => setCollection(key)}>
        {label} <span>{items[key].length}</span>
      </button>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="place-list-scroll">
      {records.length ? <div className="place-list">
        {records.map((item) => <div className="place-card-row expanded archive-entry" key={`${collection}-${item.id}`}>
          <div className="place-card">
            <span className="place-card-text"><strong>{item.name}</strong><small>{item.archived_at ? `Archived ${new Date(item.archived_at).toLocaleDateString()}` : 'Archived'}</small></span>
          </div>
          <div className="place-card-details archive-entry-actions">
            <button className="place-card-edit" type="button" onClick={() => onRestore(collection, item)}>Unarchive</button>
            {role === 'superadmin' && (collection !== 'zones' || item.can_delete) && <button className="place-card-edit archive-delete" type="button" onClick={() => onDelete(collection, item)}>Delete permanently</button>}
            {role === 'superadmin' && collection === 'zones' && !item.can_delete && <small className="archive-delete-hint">Remove this zone from all shared maps before deleting it permanently.</small>}
          </div>
        </div>)}
      </div> : <div className="empty-state"><p>No archived {collection}.</p></div>}
    </div>
  </div>;
}
