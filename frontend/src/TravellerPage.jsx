import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './MapView.jsx';
import RecordCard, { recordInViewport } from './RecordCard.jsx';
import petassosLogo from './assets/petassos-logo-animated.svg';

const noop = () => {};

export default function TravellerPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [mapAction, setMapAction] = useState(null);
  const [viewport, setViewport] = useState(null);
  const selectedCardRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/shared/${token}`, { signal: controller.signal }).then(async (response) => {
      if (response.status === 410) throw new Error('This shared map has expired.');
      if (!response.ok) throw new Error('This shared map is unavailable.');
      const result = await response.json();
      setData(result);
      if (result.zones.length) setMapAction({ type: 'zones', zones: result.zones });
    }).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [token]);

  const presentCategories = useMemo(() => {
    const presentIds = new Set((data?.places || []).map((place) => place.category_id));
    return (data?.categories || []).filter((category) => presentIds.has(category.id));
  }, [data]);
  const visiblePlaces = useMemo(() => (data?.places || []).filter((place) => !hiddenCategoryIds.includes(place.category_id)), [data, hiddenCategoryIds]);
  const searching = Boolean(query.trim());
  const listedPlaces = searching
    ? visiblePlaces.filter((place) => place.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : visiblePlaces.filter((place) => recordInViewport(place, viewport));

  useEffect(() => { selectedCardRef.current?.scrollIntoView({ block: 'nearest' }); }, [selected, query]);

  function toggleCategory(categoryId) {
    if (!hiddenCategoryIds.includes(categoryId) && data.places.find((place) => place.id === selected?.id)?.category_id === categoryId) setSelected(null);
    setHiddenCategoryIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);
  }

  function selectPlace(place, focus = false) {
    setSelected(place ? { kind: 'PLACE', id: place.id } : null);
    if (place && focus) setMapAction({ type: 'focus', record: place });
  }

  if (!data) return <main className="shared-message"><img src={petassosLogo} alt="Petassos Travel" /><p>{error || 'Opening your map…'}</p></main>;

  return <div className="traveller-page">
    <header className="traveller-header"><div className="traveller-identity"><img src={petassosLogo} alt="Petassos Travel" /><p className="traveller-tagline">Places worth discovering, chosen for YOU!</p></div><div className="traveller-heading"><strong>{data.public_title}</strong>{data.expires_at && <small>Available until {new Date(data.expires_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</small>}</div></header>
    <main className="traveller-main">
      <MapView mapAction={mapAction} mode="Places" places={visiblePlaces} notes={[]} zones={[]} selectedZoneId={null} zoneDraft={null} categories={presentCategories} hiddenCategoryIds={hiddenCategoryIds} notesVisible={false} showNotesOption={false} onToggleCategory={toggleCategory} onToggleNotes={noop} onShowAll={() => setHiddenCategoryIds([])} onHideAll={() => { setHiddenCategoryIds(presentCategories.map((category) => category.id)); setSelected(null); }} picking={false} draftKind={null} draftLocation={null} editingRecord={null} editingCategory={null} selectedRecord={selected} onPickLocation={noop} onMoveDraftLocation={noop} onSelectRecord={(record) => { setQuery(''); selectPlace(data.places.find((place) => place.id === record.id)); }} onDeselectRecord={() => selectPlace(null)} onSelectZone={noop} onDeselectZone={noop} onZoneBoundsChange={noop} onZoneDrawingChange={noop} onViewportChange={setViewport} />
      <aside className="traveller-panel">
        <div className="work-panel-heading"><h1>Places</h1>{!searching && <div className="work-panel-heading-actions"><span className="item-count">{listedPlaces.length} of {visiblePlaces.length}</span><button className="show-all-button" type="button" disabled={!visiblePlaces.length} onClick={() => setMapAction({ type: 'fit', records: visiblePlaces })}>Show all</button></div>}</div>
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
            {place.images?.length > 1 && <span className="traveller-image-gallery">{place.images.slice(1).map((image) => <img key={image.id} src={image.url} alt={image.caption || place.name} />)}</span>}
          </RecordCard>;
        })}</div></div>
      </aside>
    </main>
  </div>;
}
