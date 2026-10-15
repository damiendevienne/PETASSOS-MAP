import { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { INITIAL_MAP_VIEW, MAP_STYLE_URL } from './config.js';
import petassosStyle from './assets/petassos-style.json';
import brightStyle from './assets/bright-style.json';
import seaTextureUrl from './assets/petassos-sea.png';
import { categoryIconUrl, placeMarkerUrl, noteMarkerUrl } from './markerIcons.js';
import { searchLocations } from './geocoder.js';

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

function recordsGeoJSON(places, notes, selectedRecord, editingRecord, hoveredRecord = null) {
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
        hovered: hoveredRecord?.kind === record.kind && hoveredRecord.id === record.id,
      },
    })),
  };
}

function hasZoneBounds(zone) {
  return Boolean(zone && [zone.min_lat, zone.max_lat, zone.min_lon, zone.max_lon].every(Number.isFinite));
}

function zoneArea(zone) {
  return (zone.max_lat - zone.min_lat) * (zone.max_lon - zone.min_lon);
}

function containsPoint(zone, { lat, lng }) {
  return zone.min_lat <= lat && lat <= zone.max_lat && zone.min_lon <= lng && lng <= zone.max_lon;
}

function zoneLabelColor(hoveredId = null) {
  const normal = ['case', ['get', 'draft'], '#bd3d38', ['get', 'selected'], '#916111', '#a0a9ae'];
  return hoveredId === null ? normal : ['case', ['==', ['get', 'id'], hoveredId], '#427c8b', normal];
}

function zoneFeature(zone, selected, active, draft = false) {
  const { min_lat: south, max_lat: north, min_lon: west, max_lon: east } = zone;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
    properties: { id: zone.id ?? 0, selected, active, draft },
  };
}

function zonesGeoJSON(mode, zones, selectedZoneId, zoneDraft) {
  const active = mode === 'Zones';
  const visibleZones = zones.filter((zone) => zone.id !== zoneDraft?.id && hasZoneBounds(zone))
    .sort((left, right) => zoneArea(right) - zoneArea(left) || left.id - right.id);
  if (active && hasZoneBounds(zoneDraft)) visibleZones.push(zoneDraft);
  return {
    type: 'FeatureCollection',
    features: [
      ...visibleZones.map((zone) => zoneFeature(zone, zone === zoneDraft || zone.id === selectedZoneId, active, zone === zoneDraft)),
      ...visibleZones.filter((zone) => zone.name?.trim()).map((zone) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [zone.min_lon, zone.max_lat] },
        properties: { id: zone.id ?? 0, name: zone.name, active, selected: zone === zoneDraft || zone.id === selectedZoneId, draft: zone === zoneDraft },
      })),
    ],
  };
}

function rectangleBounds(first, second) {
  const bounds = {
    min_lat: Math.min(first.lat, second.lat), max_lat: Math.max(first.lat, second.lat),
    min_lon: Math.min(first.lng, second.lng), max_lon: Math.max(first.lng, second.lng),
  };
  return bounds.max_lat - bounds.min_lat > 0.00001 && bounds.max_lon - bounds.min_lon > 0.00001 ? bounds : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export default function MapView({ mapAction, mode, places, notes, zones, selectedZoneId, zoneDraft, categories, hiddenCategoryIds, notesVisible, onToggleCategory, onToggleNotes, onShowAll, onHideAll, picking, draftKind, draftLocation, editingRecord, editingCategory, selectedRecord, onPickLocation, onMoveDraftLocation, onSelectRecord, onDeselectRecord, onSelectZone, onDeselectZone, onZoneBoundsChange, onZoneDrawingChange, onViewportChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const draftMarkerRef = useRef(null);
  const zoneHandlesRef = useRef([]);
  const zoneAnchorRef = useRef(null);
  const selectedStyleRef = useRef('bright');
  const placesRef = useRef(places);
  const notesRef = useRef(notes);
  const selectedRecordRef = useRef(selectedRecord);
  const editingRecordRef = useRef(editingRecord);
  const hoveredRecordRef = useRef(null);
  const modeRef = useRef(mode);
  const zonesRef = useRef(zones);
  const selectedZoneIdRef = useRef(selectedZoneId);
  const zoneDraftRef = useRef(zoneDraft);
  const pickingRef = useRef(picking);
  const onPickLocationRef = useRef(onPickLocation);
  const onMoveDraftLocationRef = useRef(onMoveDraftLocation);
  const onSelectRecordRef = useRef(onSelectRecord);
  const onDeselectRecordRef = useRef(onDeselectRecord);
  const onSelectZoneRef = useRef(onSelectZone);
  const onDeselectZoneRef = useRef(onDeselectZone);
  const onZoneBoundsChangeRef = useRef(onZoneBoundsChange);
  const onZoneDrawingChangeRef = useRef(onZoneDrawingChange);
  const onViewportChangeRef = useRef(onViewportChange);
  const geoRequestRef = useRef(null);
  const [selectedStyle, setSelectedStyle] = useState('bright');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [mapError, setMapError] = useState('');
  const [geoQuery, setGeoQuery] = useState('');
  const [geoResults, setGeoResults] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');

  placesRef.current = places;
  notesRef.current = notes;
  selectedRecordRef.current = selectedRecord;
  editingRecordRef.current = editingRecord;
  modeRef.current = mode;
  zonesRef.current = zones;
  selectedZoneIdRef.current = selectedZoneId;
  zoneDraftRef.current = zoneDraft;
  pickingRef.current = picking;
  onPickLocationRef.current = onPickLocation;
  onMoveDraftLocationRef.current = onMoveDraftLocation;
  onSelectRecordRef.current = onSelectRecord;
  onDeselectRecordRef.current = onDeselectRecord;
  onSelectZoneRef.current = onSelectZone;
  onDeselectZoneRef.current = onDeselectZone;
  onZoneBoundsChangeRef.current = onZoneBoundsChange;
  onZoneDrawingChangeRef.current = onZoneDrawingChange;
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer('admin-record-icons')) return undefined;
    let cancelled = false;
    addPlaceImages(map, places).then(() => {
      if (!cancelled) map.getSource('admin-records')?.setData(recordsGeoJSON(places, notes, selectedRecord, editingRecord, hoveredRecordRef.current));
    }).catch(() => setMapError('Marker icons could not load.'));
    return () => { cancelled = true; };
  }, [places, notes, selectedRecord, editingRecord]);

  useEffect(() => {
    const map = mapRef.current;
    map?.getSource('admin-zones')?.setData(zonesGeoJSON(mode, zones, selectedZoneId, zoneDraft));
    if ((mode !== 'Zones' || zoneDraft) && hoveredRecordRef.current) {
      hoveredRecordRef.current = null;
      map?.getSource('admin-records')?.setData(recordsGeoJSON(places, notes, selectedRecord, editingRecord));
    }
    if (map?.getLayer('admin-record-icons')) {
      map.setPaintProperty('admin-record-icons', 'icon-opacity', mode === 'Zones' ? ['case', ['get', 'hovered'], 1, 0.4] : 1);
    }
  }, [mode, zones, selectedZoneId, zoneDraft]);

  useEffect(() => {
    if (!zoneDraft) zoneAnchorRef.current = null;
  }, [zoneDraft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'Zones' || !hasZoneBounds(zoneDraft) || zoneAnchorRef.current) {
      zoneHandlesRef.current.forEach(({ marker }) => marker.remove());
      zoneHandlesRef.current = [];
      return;
    }
    const corners = {
      nw: [zoneDraft.min_lon, zoneDraft.max_lat],
      ne: [zoneDraft.max_lon, zoneDraft.max_lat],
      sw: [zoneDraft.min_lon, zoneDraft.min_lat],
      se: [zoneDraft.max_lon, zoneDraft.min_lat],
      center: [(zoneDraft.min_lon + zoneDraft.max_lon) / 2, (zoneDraft.min_lat + zoneDraft.max_lat) / 2],
    };
    if (!zoneHandlesRef.current.length) {
      zoneHandlesRef.current = Object.keys(corners).map((corner) => {
        const element = document.createElement('div');
        element.className = `zone-handle${corner === 'center' ? ' zone-move-handle' : ''}`;
        element.title = corner === 'center' ? 'Drag to move zone' : 'Drag to resize zone';
        const marker = new Marker({ element, draggable: true }).setLngLat(corners[corner]).addTo(map);
        marker.on('drag', () => {
          const current = zoneDraftRef.current;
          if (!hasZoneBounds(current)) return;
          const { lat, lng } = marker.getLngLat();
          if (corner === 'center') {
            const deltaLat = clamp(lat - (current.min_lat + current.max_lat) / 2, -90 - current.min_lat, 90 - current.max_lat);
            const deltaLon = clamp(lng - (current.min_lon + current.max_lon) / 2, -180 - current.min_lon, 180 - current.max_lon);
            onZoneBoundsChangeRef.current({
              min_lat: current.min_lat + deltaLat, max_lat: current.max_lat + deltaLat,
              min_lon: current.min_lon + deltaLon, max_lon: current.max_lon + deltaLon,
            });
          } else {
            onZoneBoundsChangeRef.current({
              min_lat: corner.includes('s') ? clamp(lat, -90, current.max_lat - 0.00001) : current.min_lat,
              max_lat: corner.includes('n') ? clamp(lat, current.min_lat + 0.00001, 90) : current.max_lat,
              min_lon: corner.includes('w') ? clamp(lng, -180, current.max_lon - 0.00001) : current.min_lon,
              max_lon: corner.includes('e') ? clamp(lng, current.min_lon + 0.00001, 180) : current.max_lon,
            });
          }
        });
        return { corner, marker };
      });
    }
    zoneHandlesRef.current.forEach(({ corner, marker }) => marker.setLngLat(corners[corner]));
  }, [mode, zoneDraft]);

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
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = picking || (mode === 'Zones' && zoneDraft && (!hasZoneBounds(zoneDraft) || zoneAnchorRef.current)) ? 'crosshair' : '';
  }, [picking, mode, zoneDraft]);

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
    } else if (mapAction.type === 'zone') {
      const zone = mapAction.zone;
      map.fitBounds([[zone.min_lon, zone.min_lat], [zone.max_lon, zone.max_lat]], {
        padding: {
          top: 55, right: 55,
          bottom: mobile ? Math.min(420, height * 0.6) : 55,
          left: mobile ? 55 : Math.min(390, width * 0.4),
        },
        maxZoom: 12,
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
    let hoveredZoneId = null;
    try {
      map = new Map({
        container: containerRef.current,
        style: brightStyle,
        center: INITIAL_MAP_VIEW.center,
        zoom: INITIAL_MAP_VIEW.zoom,
        attributionControl: true,
      });
      mapRef.current = map;
      if (window.matchMedia('(max-width: 700px)').matches) {
        const attribution = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
        attribution?.classList.remove('maplibregl-compact-show');
        attribution?.removeAttribute('open');
      }
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
      map.on('mousemove', (event) => {
        if (zoneAnchorRef.current) {
          const bounds = rectangleBounds(zoneAnchorRef.current, event.lngLat);
          if (bounds) onZoneBoundsChangeRef.current(bounds);
        }
        const canHover = !pickingRef.current && !(modeRef.current === 'Zones' && zoneDraftRef.current);
        const marker = canHover && modeRef.current === 'Zones' && map.getLayer('admin-record-icons')
          ? map.queryRenderedFeatures(event.point, { layers: ['admin-record-icons'] })[0]
          : null;
        const hoveredRecord = marker ? { kind: marker.properties.kind, id: Number(marker.properties.id) } : null;
        const previousRecord = hoveredRecordRef.current;
        if (hoveredRecord?.kind !== previousRecord?.kind || hoveredRecord?.id !== previousRecord?.id) {
          hoveredRecordRef.current = hoveredRecord;
          map.getSource('admin-records')?.setData(recordsGeoJSON(
            placesRef.current, notesRef.current, selectedRecordRef.current, editingRecordRef.current, hoveredRecord,
          ));
        }
        const label = canHover && map.getLayer('admin-zones-labels')
          ? map.queryRenderedFeatures(event.point, { layers: ['admin-zones-labels'] })[0]
          : null;
        const zoneId = label ? Number(label.properties.id) : null;
        if (zoneId !== hoveredZoneId) {
          hoveredZoneId = zoneId;
          if (map.getLayer('admin-zones-labels')) map.setPaintProperty('admin-zones-labels', 'text-color', zoneLabelColor(zoneId));
        }
        if (canHover) map.getCanvas().style.cursor = marker || label ? 'pointer' : '';
      });
      map.on('mouseout', () => {
        if (hoveredRecordRef.current) {
          hoveredRecordRef.current = null;
          map.getSource('admin-records')?.setData(recordsGeoJSON(
            placesRef.current, notesRef.current, selectedRecordRef.current, editingRecordRef.current,
          ));
        }
        if (hoveredZoneId !== null) {
          hoveredZoneId = null;
          if (map.getLayer('admin-zones-labels')) map.setPaintProperty('admin-zones-labels', 'text-color', zoneLabelColor());
        }
      });
      map.on('click', (event) => {
        if (pickingRef.current) {
          onPickLocationRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
          return;
        }
        if (modeRef.current === 'Zones' && zoneDraftRef.current && (zoneAnchorRef.current || !hasZoneBounds(zoneDraftRef.current))) {
          if (!zoneAnchorRef.current) {
            zoneAnchorRef.current = event.lngLat;
            onZoneDrawingChangeRef.current(true);
          } else {
            const bounds = rectangleBounds(zoneAnchorRef.current, event.lngLat);
            if (bounds) {
              onZoneBoundsChangeRef.current(bounds);
              zoneAnchorRef.current = null;
              onZoneDrawingChangeRef.current(false);
            }
          }
          return;
        }
        const feature = map.getLayer('admin-record-icons')
          ? map.queryRenderedFeatures(event.point, { layers: ['admin-record-icons'] })[0]
          : null;
        if (feature) {
          onSelectRecordRef.current({ kind: feature.properties.kind, id: Number(feature.properties.id) });
          return;
        }
        const label = map.getLayer('admin-zones-labels')
          ? map.queryRenderedFeatures(event.point, { layers: ['admin-zones-labels'] })[0]
          : null;
        if (label) {
          if (!zoneDraftRef.current) onSelectZoneRef.current(Number(label.properties.id));
          return;
        }
        if (modeRef.current === 'Zones') {
          const draft = zoneDraftRef.current;
          if (hasZoneBounds(draft) && containsPoint(draft, event.lngLat)) return;
          const zone = zonesRef.current
            .filter((item) => item.id !== draft?.id && hasZoneBounds(item) && containsPoint(item, event.lngLat))
            .reduce((top, item) => !top || zoneArea(item) < zoneArea(top) ||
              (zoneArea(item) === zoneArea(top) && item.id > top.id) ? item : top, null);
          if (zone) {
            if (!draft) onSelectZoneRef.current(zone.id);
            return;
          }
        }
        onDeselectRecordRef.current();
        onDeselectZoneRef.current();
      });
      let styleLoadId = 0;
      map.on('style.load', async () => {
        const currentLoadId = ++styleLoadId;
        hoveredZoneId = null;
        map.addSource('admin-records', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('admin-zones', {
          type: 'geojson',
          data: zonesGeoJSON(modeRef.current, zonesRef.current, selectedZoneIdRef.current, zoneDraftRef.current),
        });
        map.addLayer({
          id: 'admin-zones-fill', type: 'fill', source: 'admin-zones',
          paint: {
            'fill-color': ['case', ['get', 'draft'], '#de5d55', ['get', 'selected'], '#e2a93b', '#43b6cc'],
            'fill-opacity': ['case', ['get', 'active'], ['case', ['get', 'selected'], 0.22, 0.12], 0],
          },
        });
        map.addLayer({
          id: 'admin-zones-outline', type: 'line', source: 'admin-zones',
          paint: {
            'line-color': ['case', ['get', 'draft'], '#bd3d38', ['get', 'selected'], '#b77c15', '#a9b1b5'],
            'line-width': ['case', ['get', 'selected'], 2.5, 1],
            'line-opacity': 0.85,
          },
        });
        map.addLayer({
          id: 'admin-zones-labels', type: 'symbol', source: 'admin-zones',
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 11,
            'text-anchor': 'bottom-left',
            'text-offset': [0.25, -0.1],
            'text-max-width': 12,
          },
          paint: {
            'text-color': zoneLabelColor(),
            'text-opacity': 0.9,
            'text-halo-color': '#ffffff',
            'text-halo-width': 0.75,
          },
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
                ['case', ['==', ['get', 'kind'], 'NOTE'], 1.45, 44 / 31], ['get', 'hovered'], 1.15, 1],
              'symbol-sort-key': ['case', ['get', 'selected'], 2, ['get', 'hovered'], 1, 0],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: {
              'icon-opacity': modeRef.current === 'Zones' ? ['case', ['get', 'hovered'], 1, 0.4] : 1,
            },
          });
          map.getSource('admin-records').setData(recordsGeoJSON(
            placesRef.current, notesRef.current, selectedRecordRef.current, editingRecordRef.current, hoveredRecordRef.current,
          ));
        } catch {
          setMapError('Marker icons could not load.');
        }
      });
    } catch {
      setMapError('The map could not start in this browser.');
    }

    return () => {
      geoRequestRef.current?.abort();
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      zoneHandlesRef.current.forEach(({ marker }) => marker.remove());
      zoneHandlesRef.current = [];
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  async function submitGeoSearch(event) {
    event.preventDefault();
    if (!geoQuery.trim() || geoBusy) return;
    const controller = new AbortController();
    geoRequestRef.current = controller;
    setGeoBusy(true);
    setGeoResults(null);
    setGeoError('');
    try {
      setGeoResults(await searchLocations(geoQuery, controller.signal));
    } catch (error) {
      if (error.name !== 'AbortError') setGeoError('Location search is unavailable. Please try again.');
    } finally {
      if (geoRequestRef.current === controller) {
        geoRequestRef.current = null;
        setGeoBusy(false);
      }
    }
  }

  function chooseGeoResult(result) {
    const map = mapRef.current;
    if (!map) return;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const mobile = width <= 700;
    const sheetHeight = mobile ? map.getContainer().closest('.admin-main')?.querySelector('.work-panel')?.offsetHeight ?? 0 : 0;
    if (result.boundingBox) {
      map.fitBounds(result.boundingBox, {
        padding: mobile
          ? { top: 35, right: 35, bottom: Math.min(sheetHeight + 25, height * 0.68), left: 35 }
          : { top: 45, right: 45, bottom: 45, left: Math.min(390, width * 0.45) },
        maxZoom: 14,
        duration: 650,
      });
    } else {
      map.easeTo({
        center: [result.longitude, result.latitude],
        zoom: Math.max(map.getZoom(), 12),
        offset: mobile ? [0, -Math.min(sheetHeight / 2, height * 0.35)] : [Math.min(170, width * 0.2), 0],
        duration: 650,
      });
    }
    setGeoQuery(result.label);
    setGeoResults(null);
  }

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
      <form className="geo-search" role="search" aria-label="Search a geographic location" onSubmit={submitGeoSearch}>
        <input
          type="search"
          aria-label="City or address"
          placeholder="Search a city or address"
          value={geoQuery}
          onChange={(event) => {
            geoRequestRef.current?.abort();
            setGeoQuery(event.target.value);
            setGeoResults(null);
            setGeoError('');
          }}
          onKeyDown={(event) => { if (event.key === 'Escape') setGeoResults(null); }}
        />
        <button type="submit" disabled={!geoQuery.trim() || geoBusy}>{geoBusy ? 'Searching…' : 'Search'}</button>
        {(geoResults !== null || geoError) && <div className="geo-search-results" aria-live="polite">
          {geoError ? <p>{geoError}</p> : geoResults.length ? geoResults.map((result, index) => (
            <button key={`${result.latitude}-${result.longitude}-${index}`} type="button" onClick={() => chooseGeoResult(result)}>{result.label}</button>
          )) : <p>No location found.</p>}
          <small>Search data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></small>
        </div>}
      </form>
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
