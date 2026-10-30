import { useState } from 'react';

const ZONE_LANGUAGES = ['en', 'fr', 'de', 'it'];

function localizedValue(draft, language, field) {
  return draft.translations?.[language]?.[field] ?? (language === 'en' ? draft[field] ?? '' : '');
}

function LanguageTabs({ language, onChange, translations, field }) {
  return <div className="place-form-language-tabs" role="tablist" aria-label={`${field} language`}>
    {ZONE_LANGUAGES.map((item) => <button key={item} className={item === language ? 'active' : ''} type="button" role="tab" aria-selected={item === language} onClick={() => onChange(item)}>
      {item.toUpperCase()}<span className={`place-form-language-status${translations[item]?.[field]?.trim() ? ' filled' : ''}`} aria-hidden="true" />
    </button>)}
  </div>;
}

export function LockIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>;
}

export default function ZonePanel({ zones, selectedId, draft, drawing, editing, error, role, onNameChange, onAboutTitleChange, onAboutTextChange, onTranslationChange, onLockChange, onSelect, onEdit, onFocus, onArchive, onSave, onCancel, onRedraw }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [language, setLanguage] = useState('en');
  const query = searchQuery.trim().toLocaleLowerCase();
  const filteredZones = query ? zones.filter((zone) => zone.name.toLocaleLowerCase().includes(query)) : zones;

  if (draft) {
    const hasRectangle = draft.min_lat !== null && !drawing;
    const boundsLocked = Boolean(editing?.locked && role !== 'superadmin');
    const translations = draft.translations || { en: { name: draft.name || '', about_title: draft.about_title || '', about_text: draft.about_text || '' } };
    const hasAboutMismatch = ZONE_LANGUAGES.some((item) => Boolean(translations[item]?.about_title?.trim()) !== Boolean(translations[item]?.about_text?.trim()));
    const updateTranslation = (field, value) => onTranslationChange?.(field, language, value);
    return <>
      <div className={`work-panel-heading${boundsLocked ? ' zone-edit-heading' : ''}`}><h1>{editing ? 'Edit zone' : 'New zone'}</h1>{boundsLocked && <p className="zone-locked-banner"><LockIcon /> This zone is locked. Only a superadmin can change its name or boundaries.</p>}</div>
      <form className="place-form zone-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <div className="localized-form-field"><label htmlFor="zone-name">Name *</label>
        <input className={boundsLocked ? 'zone-name-locked' : ''} id="zone-name" value={draft.name ?? ''} onChange={(event) => onNameChange(event.target.value)} required autoFocus disabled={boundsLocked} />
        </div>
        <fieldset className="zone-about-box">
          <legend>About <span className="optional-label">(optional)</span></legend>
          <p>When this zone is shared, its title and text appear in the client’s History window. Fill in both or leave both empty.</p>
          <div className="localized-form-field"><label htmlFor="zone-about-title">Title <span className="optional-label">(optional)</span></label><LanguageTabs language={language} onChange={setLanguage} translations={translations} field="about_title" />
          <input id="zone-about-title" value={localizedValue(draft, language, 'about_title')} onChange={(event) => updateTranslation('about_title', event.target.value)} /></div>
          <div className="localized-form-field"><label htmlFor="zone-about-text">Text <span className="optional-label">(optional)</span></label><LanguageTabs language={language} onChange={setLanguage} translations={translations} field="about_text" />
          <textarea id="zone-about-text" rows="5" value={localizedValue(draft, language, 'about_text')} onChange={(event) => updateTranslation('about_text', event.target.value)} /></div>
        </fieldset>
        {role === 'superadmin' && <label className="zone-lock-control"><span>Lock boundaries</span><input type="checkbox" role="switch" checked={Boolean(draft.locked)} onChange={(event) => onLockChange(event.target.checked)} /><span className="map-visibility-switch" aria-hidden="true" /></label>}
        <p className="zone-instruction">{drawing ? 'Click the opposite corner to finish the rectangle.' : hasRectangle ? 'Drag the map handles to move or resize this zone.' : 'Click two opposite corners on the map to draw the rectangle.'}</p>
        {hasRectangle && !boundsLocked && <button className="zone-redraw" type="button" onClick={onRedraw}>Draw again</button>}
        {editing?.used_by_count > 0 && <p className="zone-usage">Used by {editing.used_by_count} shared map{editing.used_by_count === 1 ? '' : 's'}.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="place-form-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!draft.name?.trim() || !hasRectangle || hasAboutMismatch}>Save zone</button>
        </div>
        {editing && <>
          <button className="archive-record-button" type="button" onClick={() => onArchive(editing)} disabled={!editing.can_archive}>Archive zone</button>
          {!editing.can_archive && <p className="zone-archive-hint">Zones shared with clients cannot be archived.</p>}
        </>}
      </form>
    </>;
  }

  return <>
    <div className="work-panel-heading">
      <h1>Zones</h1>
      {!query && <span className="item-count">{zones.length}</span>}
    </div>
    <div className="record-search-field">
      <input
        className="record-search"
        type="search"
        aria-label="Search zones"
        placeholder="Search saved zones…"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      {searchQuery && <button className="record-search-clear" type="button" aria-label="Clear search" onClick={() => setSearchQuery('')}>×</button>}
    </div>
    <p className="current-view-label">{query ? `SEARCH RESULTS IN ALL ZONES (${filteredZones.length})` : 'ALL SAVED ZONES · INDEPENDENT OF MAP VIEW'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="place-list-scroll">
      {zones.length ? filteredZones.length ? <div className="place-list">
        {filteredZones.map((zone) => {
          const selected = zone.id === selectedId;
          return <div className={`place-card-row${selected ? ' expanded' : ''}`} key={zone.id}>
            <button className={`place-card zone-card${selected ? ' selected' : ''}`} type="button" aria-expanded={selected} onClick={() => onSelect(selected ? null : zone)}>
              <svg className="zone-card-swatch" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="1" fill="#43b6cc33" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="5" cy="5" r="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="19" cy="5" r="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="5" cy="19" r="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="19" cy="19" r="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="place-card-text"><strong>{zone.name}</strong></span>
              {Boolean(zone.locked) && <span className="zone-lock-icon" title="Locked zone"><LockIcon /></span>}
            </button>
            {selected && <div className="place-card-details zone-card-details">
              {zone.about_title && <><strong>{zone.about_title}</strong><p>{zone.about_text}</p></>}
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
              </div>
            </div>}
          </div>;
        })}
      </div> : <div className="empty-state"><span className="empty-state-mark" aria-hidden="true">▢</span><p>No zones match your search.</p></div> : <div className="empty-state"><span className="empty-state-mark" aria-hidden="true">▢</span><p>No zones yet.</p></div>}
    </div>
  </>;
}
