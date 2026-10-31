import { categoryGroups } from './categories.js';
import { categoryIconUrl, noteMarkerUrl } from './markerIcons.js';

export function GeoSearch({ query, results, busy, error, onSubmit, onChange, onEscape, onChoose, t }) {
  const label = (key, fallback) => t?.(key) ?? fallback;
  return (
    <form className="geo-search" role="search" aria-label={label('map.searchLocation', 'Search a geographic location')} onSubmit={onSubmit}>
      <input
        type="search"
        aria-label={label('map.cityOrAddress', 'City or address')}
        placeholder={label('map.searchPlaceholder', 'Search a city or address')}
        value={query}
        onChange={onChange}
        onKeyDown={(event) => { if (event.key === 'Escape') onEscape(); }}
      />
      <button type="submit" disabled={!query.trim() || busy}>{busy ? label('map.searching', 'Searching…') : label('map.search', 'Search')}</button>
      {(results !== null || error) && <div className="geo-search-results" aria-live="polite">
        {error ? <p>{error}</p> : results.length ? results.map((result, index) => (
          <button key={`${result.latitude}-${result.longitude}-${index}`} type="button" onClick={() => onChoose(result)}>{result.label}</button>
        )) : <p>{label('map.noLocation', 'No location found.')}</p>}
        <small>Search data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></small>
      </div>}
    </form>
  );
}

export function MapVisibilityControl({ categories, hiddenCategoryIds, notesVisible, showNotesOption, open, onToggle, onToggleCategory, onToggleNotes, onShowAll, onHideAll, t, translateCategoryName }) {
  const label = (key, fallback) => t?.(key) ?? fallback;
  if (categories.length === 0 && !showNotesOption) return null;
  return <div className="maplibregl-ctrl map-visibility-control">
    <div className="map-visibility-picker">
      {open && <div className="map-visibility-panel" id="map-visibility-options" aria-label={label('map.markerVisibility', 'Marker visibility')}>
        <strong>{label('map.showOnMap', 'Show on map')}</strong>
        <div className="map-visibility-actions">
          <button type="button" onClick={onShowAll} disabled={hiddenCategoryIds.length === 0 && (!showNotesOption || notesVisible)}>{label('map.selectAll', 'Select all')}</button>
          <button type="button" onClick={onHideAll} disabled={hiddenCategoryIds.length === categories.length && (!showNotesOption || !notesVisible)}>{label('map.deselectAll', 'Deselect all')}</button>
        </div>
        <div className="map-visibility-options">
          {categoryGroups(categories).map((group) => <div className="map-visibility-group" key={group.id}>
            <label className="map-visibility-option">
              <span className="category-icon" style={{ background: group.color }}><img src={categoryIconUrl(group.icon)} alt="" /></span>
              <span>{translateCategoryName ? translateCategoryName(group.name) : group.name}</span>
              <input type="checkbox" role="switch" checked={group.categories.every((category) => !hiddenCategoryIds.includes(category.id))} onChange={() => onToggleCategory(group.categories.map((category) => category.id))} />
              <span className="map-visibility-switch" aria-hidden="true" />
            </label>
            {group.categories.length > 1 && group.categories.map((category) => <label className="map-visibility-option map-visibility-subcategory" key={category.id}>
              <span className="category-icon" style={{ background: category.color }}><img src={categoryIconUrl(category.icon)} alt="" /></span>
              <span>{translateCategoryName ? translateCategoryName(category.name) : category.name}</span>
              <input type="checkbox" role="switch" checked={!hiddenCategoryIds.includes(category.id)} onChange={() => onToggleCategory(category.id)} />
              <span className="map-visibility-switch" aria-hidden="true" />
            </label>)}
          </div>)}
          {showNotesOption && <label className="map-visibility-option map-visibility-note">
            <img src={noteMarkerUrl} alt="" />
            <span>{label('map.notes', 'Notes')}</span>
            <input type="checkbox" role="switch" checked={notesVisible} onChange={onToggleNotes} />
            <span className="map-visibility-switch" aria-hidden="true" />
          </label>}
        </div>
      </div>}
      <button className="map-style-trigger map-visibility-trigger" type="button" aria-label={label('map.markerVisibility', 'Marker visibility')} title={label('map.markerVisibility', 'Marker visibility')} aria-pressed={open} aria-expanded={open} aria-controls="map-visibility-options" onClick={onToggle}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s-6-5.1-6-11a6 6 0 1 1 12 0c0 5.9-6 11-6 11Z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      </button>
    </div>
  </div>;
}

export function MapStyleControl({ selectedStyle, open, onToggle, onChoose, t }) {
  const label = (key, fallback) => t?.(key) ?? fallback;
  return <div className="maplibregl-ctrl map-style-control">
    <div className="map-style-picker">
      {open && <div className="map-style-options" id="map-style-options">
        {['petassos', 'positron', 'bright', 'hiking'].map((style) => (
          <button key={style} type="button" aria-pressed={selectedStyle === style} onClick={() => onChoose(style)}>
            {style[0].toUpperCase() + style.slice(1)}
          </button>
        ))}
      </div>}
      <button className="map-style-trigger" type="button" aria-label={label('map.mapLayers', 'Map layers')} title={label('map.mapLayers', 'Map layers')} aria-pressed={open} aria-expanded={open} aria-controls="map-style-options" onClick={onToggle}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </svg>
      </button>
    </div>
  </div>;
}
