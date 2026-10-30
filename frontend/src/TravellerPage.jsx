import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MapView from './MapView.jsx';
import RecordCard, { recordInViewport } from './RecordCard.jsx';
import { categoryGroups } from './categories.js';
import { categoryIconUrl } from './markerIcons.js';
import petassosLogo from './assets/petassos-logo-animated.svg';
import MobileSheetHandle from './MobileSheetHandle.jsx';
import TravellerPlaceDetail from './TravellerPlaceDetail.jsx';
import TravellerCategoryPanel from './TravellerCategoryPanel.jsx';
import { api } from './api.js';
import { distanceInKm } from './geoDistance.js';

const noop = () => {};

function distanceBetweenViewAndZone(viewport, zone) {
  if (!viewport || ![zone.min_lat, zone.max_lat, zone.min_lon, zone.max_lon].every(Number.isFinite)) return Infinity;
  return distanceInKm(
    {
      latitude: (viewport.south + viewport.north) / 2,
      longitude: (viewport.west + viewport.east) / 2,
    },
    {
      latitude: (zone.min_lat + zone.max_lat) / 2,
      longitude: (zone.min_lon + zone.max_lon) / 2,
    },
  );
}

export default function TravellerPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailSnap, setDetailSnap] = useState('half');
  const [sheetMode, setSheetMode] = useState('none');
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [filteredCategoryId, setFilteredCategoryId] = useState(null);
  const [routeStartId, setRouteStartId] = useState(null);
  const [clientPosition, setClientPosition] = useState(null);
  const [query, setQuery] = useState('');
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [immersiveMap, setImmersiveMap] = useState(false);
  const [mapAction, setMapAction] = useState(null);
  const [viewport, setViewport] = useState(null);
  const selectedCardRef = useRef(null);
  const aboutDialogRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 701px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 701px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

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
  const presentCategoryGroups = useMemo(() => categoryGroups(presentCategories), [presentCategories]);
  const visiblePlaces = useMemo(() => (data?.places || []).filter((place) => !hiddenCategoryIds.includes(place.category_id)), [data, hiddenCategoryIds]);
  const routeStart = data?.places.find((place) => place.id === routeStartId);
  const selectedPlace = data?.places.find((place) => place.id === selected?.id) ?? null;
  const aboutZones = useMemo(() => (data?.zones || []).filter((zone) => zone.about_title && zone.about_text), [data]);
  const activeAboutZone = useMemo(() => aboutZones.reduce((closest, zone) => {
    if (!closest) return zone;
    return distanceBetweenViewAndZone(viewport, zone) < distanceBetweenViewAndZone(viewport, closest) ? zone : closest;
  }, null), [aboutZones, viewport]);
  const searching = Boolean(query.trim());
  const listedPlaces = searching
    ? visiblePlaces.filter((place) => place.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : isDesktop ? visiblePlaces : visiblePlaces.filter((place) => recordInViewport(place, viewport));

  useEffect(() => { if (selected) setPanelExpanded(true); }, [selected]);
  useEffect(() => { selectedCardRef.current?.scrollIntoView({ block: 'nearest' }); }, [selected, query]);

  useLayoutEffect(() => {
    const main = document.querySelector('.traveller-main');
    const panel = main?.querySelector('.traveller-place-detail-panel');
    if (!main || !panel || !window.matchMedia('(max-width: 700px)').matches) return undefined;
    const syncPanelHeight = () => {
      if (!panel.classList.contains('is-dragging')) main.style.setProperty('--mobile-sheet-height', `${panel.offsetHeight}px`);
    };
    const observer = new ResizeObserver(syncPanelHeight);
    observer.observe(panel);
    syncPanelHeight();
    return () => {
      observer.disconnect();
      main.style.removeProperty('--mobile-sheet-height');
    };
  }, [sheetMode, detailSnap, selectedPlace?.id, activeCategoryId]);

  function toggleCategory(categoryId) {
    const ids = Array.isArray(categoryId) ? categoryId : [categoryId];
    const hiding = ids.every((id) => !hiddenCategoryIds.includes(id));
    if (hiding && ids.includes(data.places.find((place) => place.id === selected?.id)?.category_id)) setSelected(null);
    setHiddenCategoryIds((current) => hiding ? [...current, ...ids] : current.filter((id) => !ids.includes(id)));
  }

  function selectPlace(place) {
    if (!place) {
      setSelected(null);
      setSheetMode('none');
      setActiveCategoryId(null);
      return;
    }
    setSelected({ kind: 'PLACE', id: place.id });
    setSheetMode('detail');
    setDetailSnap('half');
    setMapAction({ type: 'reveal', record: place });
  }

  function openCategory(group, event) {
    event?.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    if (isDesktop) {
      const categoryIds = new Set(group.categories.map((category) => category.id));
      if (filteredCategoryId === group.id) {
        setFilteredCategoryId(null);
        setHiddenCategoryIds([]);
        setMapAction({ type: 'fit', records: data.places });
      } else {
        setFilteredCategoryId(group.id);
        setHiddenCategoryIds(presentCategories.filter((category) => !categoryIds.has(category.id)).map((category) => category.id));
        setSelected(null);
        setSheetMode('none');
        setMapAction({ type: 'fit', records: data.places.filter((place) => categoryIds.has(place.category_id)), category: true });
      }
      return;
    }
    if (sheetMode === 'category' && activeCategoryId === group.id) {
      selectPlace(null);
      return;
    }
    const categoryIds = new Set(group.categories.map((category) => category.id));
    const categoryPlaces = data.places.filter((place) => categoryIds.has(place.category_id));
    setActiveCategoryId(group.id);
    setSelected(null);
    setSheetMode('category');
    setDetailSnap('half');
    setImmersiveMap(false);
    setMapAction({ type: 'fit', records: categoryPlaces, category: true });
  }

  function clearDesktopCategoryFilter() {
    setFilteredCategoryId(null);
    setHiddenCategoryIds([]);
    setSelected(null);
    setSheetMode('none');
    setMapAction({ type: 'fit', records: data.places });
  }

  function closePlaceDetail() {
    if (activeCategoryId !== null) {
      setSelected(null);
      setSheetMode('category');
      setDetailSnap('half');
    } else {
      selectPlace(null);
    }
  }

  function focusPlace(place) {
    setMapAction({ type: 'focus', record: place });
  }

  if (!data) return <main className="shared-message"><img src={petassosLogo} alt="Petassos Travel" /><p>{error || 'Opening your map…'}</p></main>;

  const activeCategory = presentCategoryGroups.find((group) => group.id === activeCategoryId) ?? null;
  const filteredCategory = presentCategoryGroups.find((group) => group.id === filteredCategoryId) ?? null;
  const activeCategoryPlaces = activeCategory
    ? visiblePlaces.filter((place) => activeCategory.categories.some((category) => category.id === place.category_id))
    : [];

  return <div className={`traveller-page${immersiveMap ? ' traveller-immersive' : ''}${sheetMode !== 'none' ? ' traveller-sheet-open' : ''}${selectedPlace ? ' traveller-place-selected' : ''}${aboutZones.length ? ' traveller-has-map-info' : ''}`}>
    <header className="traveller-header"><div className="traveller-identity"><img src={petassosLogo} alt="Petassos Travel" /><p className="traveller-tagline">Places worth discovering, chosen for YOU!</p></div><div className="traveller-heading"><strong>{data.public_title}</strong>{data.expires_at && <small>Until {new Date(data.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>}</div></header>
    {activeAboutZone && <section className="traveller-map-info">
      <button className="traveller-map-info-trigger" type="button" onClick={() => aboutDialogRef.current?.showModal()} aria-label="Open history">
        <svg className="traveller-map-info-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M4 8h16M6 8v10m4-10v10m4-10v10m4-10v10M4 18h16M3 21h18" /></svg><span className="traveller-map-info-label">Zone {activeAboutZone.about_title}</span><span className="traveller-map-info-hint">Learn more</span><span className="traveller-map-info-chevron" aria-hidden="true">›</span>
      </button>
    </section>}
    <main className="traveller-main">
      <MapView mapAction={mapAction} mode="Places" places={visiblePlaces} notes={[]} zones={[]} selectedZoneId={null} zoneDraft={null} categories={presentCategories} hiddenCategoryIds={hiddenCategoryIds} notesVisible={false} showNotesOption={false} geolocate travellerLayout onUserLocation={setClientPosition} onToggleCategory={toggleCategory} onToggleNotes={noop} onShowAll={() => setHiddenCategoryIds([])} onHideAll={() => { setHiddenCategoryIds(presentCategories.map((category) => category.id)); setSelected(null); }} picking={false} draftKind={null} draftLocation={null} editingRecord={null} editingCategory={null} selectedRecord={selected} onPickLocation={noop} onMoveDraftLocation={noop} onSelectRecord={(record) => { setQuery(''); setImmersiveMap(false); selectPlace(data.places.find((place) => place.id === record.id)); }} onDeselectRecord={() => { if (sheetMode !== 'category') selectPlace(null); }} onEmptyMapClick={({ hadSelectedRecord }) => { if (hadSelectedRecord || sheetMode === 'category') setDetailSnap('peek'); else setImmersiveMap((current) => !current); }} onSelectZone={noop} onDeselectZone={noop} onZoneBoundsChange={noop} onZoneDrawingChange={noop} onViewportChange={setViewport} />
      <div className="traveller-map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://maplibre.org/" target="_blank" rel="noreferrer">MapLibre</a></div>
      <div className="traveller-map-category-buttons" aria-label="Place categories">
        {presentCategoryGroups.map((group) => <button key={group.id} className={(isDesktop ? filteredCategoryId === group.id : activeCategoryId === group.id) ? 'active' : ''} type="button" onClick={(event) => openCategory(group, event)}>
          <span className="traveller-map-category-icon" style={{ backgroundColor: group.color }}><img src={categoryIconUrl(group.icon)} alt="" /></span>
          <span>{group.name}</span>
        </button>)}
      </div>
      {sheetMode === 'category' && activeCategory && <TravellerCategoryPanel group={activeCategory} places={activeCategoryPlaces} clientPosition={clientPosition} snap={detailSnap} onSnapChange={setDetailSnap} onClose={() => selectPlace(null)} onSelectPlace={selectPlace} onFocus={() => setMapAction({ type: 'fit', records: activeCategoryPlaces, category: true })} />}
      {sheetMode === 'detail' && <TravellerPlaceDetail place={selectedPlace} routeStart={routeStart} clientPosition={clientPosition} snap={detailSnap} onSnapChange={setDetailSnap} onClose={() => selectPlace(null)} onBack={activeCategoryId !== null && !isDesktop ? closePlaceDetail : null} onSetRouteStart={setRouteStartId} onFocus={focusPlace} />}
      <aside className={`traveller-panel${panelExpanded ? ' work-panel-expanded' : ''}`}>
        <MobileSheetHandle expanded={panelExpanded} onToggle={() => setPanelExpanded((value) => !value)} />
        <div className="work-panel-heading"><div className="traveller-panel-title"><h1>Places</h1>{isDesktop && filteredCategory && <button className="traveller-panel-category-filter" type="button" onClick={clearDesktopCategoryFilter} aria-label={`Clear ${filteredCategory.name} filter`}><span className="traveller-panel-category-icon" style={{ backgroundColor: filteredCategory.color }}><img src={categoryIconUrl(filteredCategory.icon)} alt="" /></span><span>{filteredCategory.name}</span><span className="traveller-panel-category-clear" aria-hidden="true">×</span></button>}</div>{!searching && <div className="work-panel-heading-actions"><span className="item-count">{isDesktop ? visiblePlaces.length : `${listedPlaces.length} of ${visiblePlaces.length}`}</span><button className="traveller-place-detail-focus" type="button" disabled={!visiblePlaces.length} onClick={() => setMapAction({ type: 'fit', records: visiblePlaces })} aria-label="Show all places" title="Show all places">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>
        </button></div>}</div>
        {routeStart && <div className="traveller-route-start">Route from <strong>{routeStart.name}</strong><button type="button" onClick={() => setRouteStartId(null)} aria-label="Clear route starting point">×</button></div>}
        <input type="search" aria-label="Search places" placeholder="Search places" value={query} onChange={(event) => setQuery(event.target.value)} />
        {(searching || !isDesktop) && <p className="current-view-label">{searching ? `SEARCH RESULTS (${listedPlaces.length})` : 'PLACES IN CURRENT VIEW'}</p>}
        <div className="traveller-places"><div className="place-list">{listedPlaces.map((place) => {
          return <RecordCard
            key={place.id}
            record={place}
            selected={false}
            highlighted={selected?.id === place.id}
            selectedRef={selectedCardRef}
            coverUrl={place.images?.[0]?.url}
            coverAlt={place.images?.[0]?.caption || ''}
            onSelect={() => {
              if (searching) setQuery('');
              selectPlace(place);
            }}
          >
          </RecordCard>;
        })}</div></div>
      </aside>
    </main>
    <dialog className="about-dialog" ref={aboutDialogRef} aria-labelledby="about-dialog-title">
      <div className="about-dialog-heading"><div className="about-dialog-title"><svg className="traveller-map-info-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M4 8h16M6 8v10m4-10v10m4-10v10m4-10v10M4 18h16M3 21h18" /></svg><h2 id="about-dialog-title">History</h2></div><button type="button" aria-label="Close history" onClick={() => aboutDialogRef.current?.close()}>×</button></div>
      <div className="about-dialog-content">{activeAboutZone && <section><h3>{activeAboutZone.about_title}</h3><p>{activeAboutZone.about_text}</p></section>}</div>
    </dialog>
  </div>;
}
