import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './MapView.jsx';
import RecordCard, { recordInViewport } from './RecordCard.jsx';
import petassosLogo from './assets/petassos-logo-animated.svg';
import MobileSheetHandle from './MobileSheetHandle.jsx';
import { api } from './api.js';

const noop = () => {};

function directionsUrl(destination, origin) {
  const params = new URLSearchParams({ api: '1', destination: `${destination.latitude},${destination.longitude}` });
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

export default function TravellerPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [routeStartId, setRouteStartId] = useState(null);
  const [query, setQuery] = useState('');
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [immersiveMap, setImmersiveMap] = useState(false);
  const [mapAction, setMapAction] = useState(null);
  const [viewport, setViewport] = useState(null);
  const selectedCardRef = useRef(null);
  const aboutDialogRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    api.get(`/api/shared/${token}`, { signal: controller.signal }).then((result) => {
      setData(result);
      if (result.zones.length) setMapAction({ type: 'zones', zones: result.zones });
    }).catch((failure) => {
      if (failure.name !== 'AbortError') setError(failure.status === 410 ? 'This shared map has expired.' : 'This shared map is unavailable.');
    });
    return () => controller.abort();
  }, [token]);

  const presentCategories = useMemo(() => {
    const presentIds = new Set((data?.places || []).map((place) => place.category_id));
    return (data?.categories || []).filter((category) => presentIds.has(category.id));
  }, [data]);
  const visiblePlaces = useMemo(() => (data?.places || []).filter((place) => !hiddenCategoryIds.includes(place.category_id)), [data, hiddenCategoryIds]);
  const routeStart = data?.places.find((place) => place.id === routeStartId);
  const aboutZones = (data?.zones || []).filter((zone) => zone.about_title && zone.about_text);
  const searching = Boolean(query.trim());
  const listedPlaces = searching
    ? visiblePlaces.filter((place) => place.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : visiblePlaces.filter((place) => recordInViewport(place, viewport));

  useEffect(() => { selectedCardRef.current?.scrollIntoView({ block: 'nearest' }); }, [selected, query]);
  useEffect(() => { if (selected) setPanelExpanded(true); }, [selected]);

  function toggleCategory(categoryId) {
    const ids = Array.isArray(categoryId) ? categoryId : [categoryId];
    const hiding = ids.every((id) => !hiddenCategoryIds.includes(id));
    if (hiding && ids.includes(data.places.find((place) => place.id === selected?.id)?.category_id)) setSelected(null);
    setHiddenCategoryIds((current) => hiding ? [...current, ...ids] : current.filter((id) => !ids.includes(id)));
  }

  function selectPlace(place, focus = false) {
    setSelected(place ? { kind: 'PLACE', id: place.id } : null);
    if (place && focus) setMapAction({ type: 'focus', record: place });
  }

  if (!data) return <main className="shared-message"><img src={petassosLogo} alt="Petassos Travel" /><p>{error || 'Opening your map…'}</p></main>;

  return <div className={`traveller-page${immersiveMap ? ' traveller-immersive' : ''}`}>
    <header className="traveller-header"><div className="traveller-identity"><img src={petassosLogo} alt="Petassos Travel" /><p className="traveller-tagline">Places worth discovering, chosen for YOU!</p></div><div className="traveller-heading"><strong>{data.public_title}</strong>{data.expires_at && <small>Until {new Date(data.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>}</div></header>
    <main className="traveller-main">
      <MapView mapAction={mapAction} mode="Places" places={visiblePlaces} notes={[]} zones={[]} selectedZoneId={null} zoneDraft={null} categories={presentCategories} hiddenCategoryIds={hiddenCategoryIds} notesVisible={false} showNotesOption={false} geolocate onToggleCategory={toggleCategory} onToggleNotes={noop} onShowAll={() => setHiddenCategoryIds([])} onHideAll={() => { setHiddenCategoryIds(presentCategories.map((category) => category.id)); setSelected(null); }} picking={false} draftKind={null} draftLocation={null} editingRecord={null} editingCategory={null} selectedRecord={selected} onPickLocation={noop} onMoveDraftLocation={noop} onSelectRecord={(record) => { setQuery(''); setImmersiveMap(false); selectPlace(data.places.find((place) => place.id === record.id)); }} onDeselectRecord={() => selectPlace(null)} onEmptyMapClick={({ hadSelectedRecord }) => { if (!hadSelectedRecord && window.matchMedia('(max-width: 700px)').matches) setImmersiveMap((current) => !current); }} onSelectZone={noop} onDeselectZone={noop} onZoneBoundsChange={noop} onZoneDrawingChange={noop} onViewportChange={setViewport} />
      <aside className={`traveller-panel${panelExpanded ? ' work-panel-expanded' : ''}`}>
        <MobileSheetHandle expanded={panelExpanded} onToggle={() => setPanelExpanded((value) => !value)} />
        <div className="work-panel-heading"><div className="traveller-panel-title"><h1>Places</h1><button className="traveller-about-button" type="button" aria-label="About this map" title="About this map" onClick={() => aboutDialogRef.current?.showModal()}>i</button></div>{!searching && <div className="work-panel-heading-actions"><span className="item-count">{listedPlaces.length} of {visiblePlaces.length}</span><button className="show-all-button" type="button" disabled={!visiblePlaces.length} onClick={() => setMapAction({ type: 'fit', records: visiblePlaces })}>Show all</button></div>}</div>
        {routeStart && <div className="traveller-route-start">Route from <strong>{routeStart.name}</strong><button type="button" onClick={() => setRouteStartId(null)} aria-label="Clear route starting point">×</button></div>}
        <input type="search" aria-label="Search places" placeholder="Search places" value={query} onChange={(event) => setQuery(event.target.value)} />
        <p className="current-view-label">{searching ? `SEARCH RESULTS (${listedPlaces.length})` : 'PLACES IN CURRENT VIEW'}</p>
        <div className="traveller-places"><div className="place-list">{listedPlaces.map((place) => {
          const isSelected = !searching && selected?.id === place.id;
          return <RecordCard
            key={place.id}
            record={place}
            selected={isSelected}
            selectedRef={selectedCardRef}
            coverUrl={place.images?.[0]?.url}
            coverAlt={place.images?.[0]?.caption || ''}
            onSelect={() => {
              if (searching) {
                setQuery('');
                selectPlace(place, true);
              } else {
                selectPlace(isSelected ? null : place, !isSelected);
              }
            }}
          >
            <div className="place-card-actions traveller-route-actions">
              <a className="place-card-edit" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">Directions from my location ↗</a>
              {routeStart && routeStart.id !== place.id && <a className="place-card-edit" href={directionsUrl(place, routeStart)} target="_blank" rel="noopener noreferrer">Directions from {routeStart.name} ↗</a>}
              <button className="place-card-edit" type="button" disabled={routeStart?.id === place.id} onClick={() => setRouteStartId(place.id)}>{routeStart?.id === place.id ? 'Starting point' : 'Set as starting point'}</button>
            </div>
            {place.images?.length > 1 && <span className="traveller-image-gallery">{place.images.slice(1).map((image) => <img key={image.id} src={image.url} alt={image.caption || place.name} />)}</span>}
          </RecordCard>;
        })}</div></div>
      </aside>
    </main>
    <dialog className="about-dialog" ref={aboutDialogRef} aria-labelledby="about-dialog-title">
      <div className="about-dialog-heading"><h2 id="about-dialog-title">About</h2><button type="button" aria-label="Close About" onClick={() => aboutDialogRef.current?.close()}>×</button></div>
      <div className="about-dialog-content">{aboutZones.length ? aboutZones.map((zone) => <section key={zone.id}><h3>{zone.about_title}</h3><p>{zone.about_text}</p></section>) : <p>No additional information for this map.</p>}</div>
    </dialog>
  </div>;
}
