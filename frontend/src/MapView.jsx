import { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { INITIAL_MAP_VIEW, MAP_STYLE_URL } from './config.js';
import petassosStyle from './assets/petassos-style.json';
import brightStyle from './assets/bright-style.json';
import seaTextureUrl from './assets/petassos-sea.png';
import { categoryIconUrl, placeMarkerUrl, noteMarkerUrl } from './markerIcons.js';

setWorkerUrl(workerUrl);

function loadSvg(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function placeMarkerId(record) {
  return `petassos-${record.category_color?.slice(1)}-${record.category_icon}`;
}

async function addPlaceImages(map, places) {
  const markers = new globalThis.Map(places.map((place) => [placeMarkerId(place), place]));
  await Promise.all([...markers].map(async ([id, place]) => {
    if (map.hasImage(id)) return;
    const image = await loadSvg(placeMarkerUrl(place.category_icon, place.category_color));
    if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 4 });
  }));
}

function recordsGeoJSON(places, notes, selectedRecord, editingRecord) {
  return {
    type: 'FeatureCollection',
    features: [...places, ...notes].filter((record) => (
      record.kind !== editingRecord?.kind || record.id !== editingRecord.id
    )).map((record) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [record.longitude, record.latitude] },
      properties: {
        id: record.id,
        kind: record.kind,
        image: record.kind === 'NOTE' ? 'petassos-note' : placeMarkerId(record),
        selected: selectedRecord?.kind === record.kind && selectedRecord.id === record.id,
      },
    })),
  };
}

export default function MapView({ mapAction, places, notes, categories, hiddenCategoryIds, notesVisible, onToggleCategory, onToggleNotes, onShowAll, onHideAll, picking, draftKind, draftLocation, editingRecord, editingCategory, selectedRecord, onPickLocation, onMoveDraftLocation, onSelectRecord, onDeselectRecord, onViewportChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const draftMarkerRef = useRef(null);
  const selectedStyleRef = useRef('bright');
  const placesRef = useRef(places);
  const notesRef = useRef(notes);
  const selectedRecordRef = useRef(selectedRecord);
  const editingRecordRef = useRef(editingRecord);
  const pickingRef = useRef(picking);
  const onPickLocationRef = useRef(onPickLocation);
  const onMoveDraftLocationRef = useRef(onMoveDraftLocation);
  const onSelectRecordRef = useRef(onSelectRecord);
  const onDeselectRecordRef = useRef(onDeselectRecord);
  const onViewportChangeRef = useRef(onViewportChange);
  const [selectedStyle, setSelectedStyle] = useState('bright');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [mapError, setMapError] = useState('');

  placesRef.current = places;
  notesRef.current = notes;
  selectedRecordRef.current = selectedRecord;
  editingRecordRef.current = editingRecord;
  pickingRef.current = picking;
  onPickLocationRef.current = onPickLocation;
  onMoveDraftLocationRef.current = onMoveDraftLocation;
  onSelectRecordRef.current = onSelectRecord;
  onDeselectRecordRef.current = onDeselectRecord;
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer('admin-record-icons')) return undefined;
    let cancelled = false;
    addPlaceImages(map, places).then(() => {
      if (!cancelled) map.getSource('admin-records')?.setData(recordsGeoJSON(places, notes, selectedRecord, editingRecord));
    }).catch(() => setMapError('Marker icons could not load.'));
    return () => { cancelled = true; };
  }, [places, notes, selectedRecord, editingRecord]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !draftLocation) {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      return;
    }
    if (!draftMarkerRef.current) {
      const element = document.createElement('div');
      element.className = 'draft-marker';
      const marker = new Marker({ element, draggable: true })
        .setLngLat([draftLocation.longitude, draftLocation.latitude])
        .addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        onMoveDraftLocationRef.current({ latitude: position.lat, longitude: position.lng });
      });
      draftMarkerRef.current = marker;
    } else {
      draftMarkerRef.current.setLngLat([draftLocation.longitude, draftLocation.latitude]);
    }
    const element = draftMarkerRef.current.getElement();
    element.classList.toggle('editing-marker', Boolean(editingRecord));
    element.classList.toggle('note-marker', (editingRecord?.kind ?? draftKind) === 'NOTE');
    element.title = 'Drag to adjust position';
    element.style.backgroundColor = editingRecord?.kind === 'PLACE' ? (editingCategory?.color ?? editingRecord.category_color) : '';
    if (editingRecord) {
      let icon = element.querySelector('img');
      if (!icon) {
        icon = document.createElement('img');
        icon.alt = '';
        element.replaceChildren(icon);
      }
      const url = editingRecord.kind === 'PLACE' ? categoryIconUrl(editingCategory?.icon ?? editingRecord.category_icon, 60) : noteMarkerUrl;
      if (icon.src !== url) icon.src = url;
    } else if (element.textContent !== '?') {
      element.textContent = '?';
    }
  }, [draftKind, draftLocation, editingRecord, editingCategory]);

  useEffect(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = picking ? 'crosshair' : '';
  }, [picking]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapAction) return;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const mobile = width <= 700;
    if (mapAction.type === 'focus') {
      const { longitude, latitude } = mapAction.record;
      map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 10),
        offset: mobile ? [0, -Math.min(140, height * 0.2)] : [Math.min(170, width * 0.2), 0],
        duration: 650,
      });
    } else if (mapAction.type === 'fit' && mapAction.records.length) {
      const bounds = mapAction.records.reduce((result, record) => [
        [Math.min(result[0][0], record.longitude), Math.min(result[0][1], record.latitude)],
        [Math.max(result[1][0], record.longitude), Math.max(result[1][1], record.latitude)],
      ], [[Infinity, Infinity], [-Infinity, -Infinity]]);
      if (mapAction.records.length === 1) {
        map.easeTo({
          center: bounds[0],
          zoom: 10,
          offset: mobile ? [0, -Math.min(140, height * 0.2)] : [Math.min(170, width * 0.2), 0],
          duration: 650,
        });
      } else {
        map.fitBounds(bounds, {
          padding: {
            top: 40,
            right: 40,
            bottom: mobile ? Math.min(420, height * 0.6) : 40,
            left: mobile ? 40 : Math.min(390, width * 0.4),
          },
          maxZoom: 12,
          duration: 650,
        });
      }
    }
  }, [mapAction]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    let map;
    try {
      map = new Map({
        container: containerRef.current,
        style: brightStyle,
        center: INITIAL_MAP_VIEW.center,
        zoom: INITIAL_MAP_VIEW.zoom,
        attributionControl: true,
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      const updateViewport = () => {
        const bounds = map.getBounds();
        onViewportChangeRef.current({
          west: bounds.getWest(), east: bounds.getEast(),
          south: bounds.getSouth(), north: bounds.getNorth(),
        });
      };
      map.on('load', updateViewport);
      map.on('moveend', updateViewport);
      map.on('click', (event) => {
        if (pickingRef.current) {
          onPickLocationRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
          return;
        }
        const feature = map.getLayer('admin-record-icons')
          ? map.queryRenderedFeatures(event.point, { layers: ['admin-record-icons'] })[0]
          : null;
        if (feature) onSelectRecordRef.current({ kind: feature.properties.kind, id: Number(feature.properties.id) });
        else onDeselectRecordRef.current();
      });
      let styleLoadId = 0;
      map.on('style.load', async () => {
        const currentLoadId = ++styleLoadId;
        map.addSource('admin-records', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        if (selectedStyleRef.current === 'petassos') {
          try {
            const { data } = await map.loadImage(seaTextureUrl);
            if (currentLoadId === styleLoadId && map.getLayer('water')) {
              map.addImage('petassos-sea', data, { pixelRatio: 2 });
              map.setPaintProperty('water', 'fill-pattern', 'petassos-sea');
            }
          } catch {
            setMapError('The sea texture could not load.');
          }
        }
        try {
          const [noteImage] = await Promise.all([
            loadSvg(noteMarkerUrl),
            addPlaceImages(map, placesRef.current),
          ]);
          if (currentLoadId !== styleLoadId) return;
          map.addImage('petassos-note', noteImage, { pixelRatio: 4 });
          map.addLayer({
            id: 'admin-record-icons', type: 'symbol', source: 'admin-records',
            layout: {
              'icon-image': ['get', 'image'],
              'icon-size': ['case', ['get', 'selected'],
                ['case', ['==', ['get', 'kind'], 'NOTE'], 1.45, 44 / 31], 1],
              'symbol-sort-key': ['case', ['get', 'selected'], 1, 0],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
          map.getSource('admin-records').setData(recordsGeoJSON(
            placesRef.current, notesRef.current, selectedRecordRef.current, editingRecordRef.current,
          ));
        } catch {
          setMapError('Marker icons could not load.');
        }
      });
    } catch {
      setMapError('The map could not start in this browser.');
    }

    return () => {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  function chooseStyle(style) {
    setStyleMenuOpen(false);
    if (style === selectedStyle) return;
    selectedStyleRef.current = style;
    setSelectedStyle(style);
    setMapError('');
    mapRef.current?.setStyle(style === 'petassos' ? petassosStyle : style === 'bright' ? brightStyle : MAP_STYLE_URL);
  }

  return (
    <div className="map-area">
      <div className="map-canvas" ref={containerRef} aria-label="Interactive map of Crete" />
      <div className="map-visibility-picker">
        {visibilityOpen && <div className="map-visibility-panel" id="map-visibility-options" aria-label="Map marker visibility">
          <strong>Show on map</strong>
          <div className="map-visibility-actions">
            <button type="button" onClick={onShowAll} disabled={hiddenCategoryIds.length === 0 && notesVisible}>Select all</button>
            <button type="button" onClick={onHideAll} disabled={hiddenCategoryIds.length === categories.length && !notesVisible}>Deselect all</button>
          </div>
          <div className="map-visibility-options">
            {categories.map((category) => (
              <label className="map-visibility-option" key={category.id}>
                <span className="category-icon" style={{ background: category.color }}><img src={categoryIconUrl(category.icon)} alt="" /></span>
                <span>{category.name}</span>
                <input type="checkbox" role="switch" checked={!hiddenCategoryIds.includes(category.id)} onChange={() => onToggleCategory(category.id)} />
                <span className="map-visibility-switch" aria-hidden="true" />
              </label>
            ))}
            <label className="map-visibility-option map-visibility-note">
              <img src={noteMarkerUrl} alt="" />
              <span>Notes</span>
              <input type="checkbox" role="switch" checked={notesVisible} onChange={onToggleNotes} />
              <span className="map-visibility-switch" aria-hidden="true" />
            </label>
          </div>
        </div>}
        <button
          className="map-style-trigger map-visibility-trigger"
          type="button"
          aria-label="Marker visibility"
          title="Marker visibility"
          aria-pressed={visibilityOpen}
          aria-expanded={visibilityOpen}
          aria-controls="map-visibility-options"
          onClick={() => { setStyleMenuOpen(false); setVisibilityOpen((open) => !open); }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-6-5.1-6-11a6 6 0 1 1 12 0c0 5.9-6 11-6 11Z" />
            <circle cx="12" cy="10" r="2.2" />
          </svg>
        </button>
      </div>
      <div className="map-style-picker">
        {styleMenuOpen && (
          <div className="map-style-options" id="map-style-options">
            <button type="button" aria-pressed={selectedStyle === 'petassos'} onClick={() => chooseStyle('petassos')}>Petassos</button>
            <button type="button" aria-pressed={selectedStyle === 'positron'} onClick={() => chooseStyle('positron')}>Positron</button>
            <button type="button" aria-pressed={selectedStyle === 'bright'} onClick={() => chooseStyle('bright')}>Bright</button>
          </div>
        )}
        <button
          className="map-style-trigger"
          type="button"
          aria-label="Map layers"
          title="Map layers"
          aria-pressed={styleMenuOpen}
          aria-expanded={styleMenuOpen}
          aria-controls="map-style-options"
          onClick={() => { setVisibilityOpen(false); setStyleMenuOpen((open) => !open); }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3 9 5-9 5-9-5 9-5Z" />
            <path d="m3 12 9 5 9-5" />
            <path d="m3 16 9 5 9-5" />
          </svg>
        </button>
      </div>
      {mapError && <p className="map-error" role="alert">{mapError}</p>}
    </div>
  );
}
