import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GeolocateControl, Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { INITIAL_MAP_VIEW, MAP_STYLE_URL } from './config.js';
import petassosStyle from './assets/petassos-style.json';
import brightStyle from './assets/bright-style.json';
import hikingStyle from './assets/hiking-style.json';
import sketchStyle from './assets/sketch-map-style.json';
import seaTextureUrl from './assets/petassos-sea.png';
import sketchLandUrl from './assets/sketch-land.svg';
import sketchWaterUrl from './assets/sketch-water.svg';
import { categoryIconUrl, placeMarkerUrl, noteMarkerUrl } from './markerIcons.js';
import { searchLocations } from './geocoder.js';
import { GeoSearch, MapStyleControl, MapVisibilityControl } from './MapControls.jsx';
import { NorthControl, TiltControl } from './mapControls.js';
import {
  addPlaceImages,
  clamp,
  containsPoint,
  hasZoneBounds,
  loadSvg,
  rectangleBounds,
  recordsGeoJSON,
  zoneArea,
  zoneLabelColor,
  zonesGeoJSON,
} from './mapData.js';

setWorkerUrl(workerUrl);

const LOCAL_STYLES = { petassos: petassosStyle, bright: brightStyle, sketch: sketchStyle, hiking: hikingStyle };

export default function MapView({ mapAction, mode, places, notes, zones, selectedZoneId, zoneDraft, zoneBoundsLocked = false, categories, hiddenCategoryIds, notesVisible, onToggleCategory, onToggleNotes, onShowAll, onHideAll, picking, draftKind, draftLocation, editingRecord, editingCategory, selectedRecord, onPickLocation, onMoveDraftLocation, onSelectRecord, onDeselectRecord, onSelectZone, onDeselectZone, onZoneBoundsChange, onZoneDrawingChange, onViewportChange, onEmptyMapClick, onUserLocation, sharing = false, showNotesOption = true, geolocate = true, travellerLayout = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const adminCameraRef = useRef(null);
  const adminSearchRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [topRightControlNode, setTopRightControlNode] = useState(null);
  const draftMarkerRef = useRef(null);
  const zoneHandlesRef = useRef([]);
  const zoneAnchorRef = useRef(null);
  const selectedStyleRef = useRef('hiking');
  const placesRef = useRef(places);
  const notesRef = useRef(notes);
  const selectedRecordRef = useRef(selectedRecord);
  const editingRecordRef = useRef(editingRecord);
  const hoveredRecordRef = useRef(null);
  const modeRef = useRef(mode);
  const zonesRef = useRef(zones);
  const selectedZoneIdRef = useRef(selectedZoneId);
  const zoneDraftRef = useRef(zoneDraft);
  const zoneBoundsLockedRef = useRef(zoneBoundsLocked);
  const pickingRef = useRef(picking);
  const onPickLocationRef = useRef(onPickLocation);
  const onMoveDraftLocationRef = useRef(onMoveDraftLocation);
  const onSelectRecordRef = useRef(onSelectRecord);
  const onDeselectRecordRef = useRef(onDeselectRecord);
  const onEmptyMapClickRef = useRef(onEmptyMapClick);
  const onSelectZoneRef = useRef(onSelectZone);
  const onDeselectZoneRef = useRef(onDeselectZone);
  const onZoneBoundsChangeRef = useRef(onZoneBoundsChange);
  const onZoneDrawingChangeRef = useRef(onZoneDrawingChange);
  const onViewportChangeRef = useRef(onViewportChange);
  const onUserLocationRef = useRef(onUserLocation);
  const geoRequestRef = useRef(null);
  const [selectedStyle, setSelectedStyle] = useState('hiking');
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
  zoneBoundsLockedRef.current = zoneBoundsLocked;
  pickingRef.current = picking;
  onPickLocationRef.current = onPickLocation;
  onMoveDraftLocationRef.current = onMoveDraftLocation;
  onSelectRecordRef.current = onSelectRecord;
  onDeselectRecordRef.current = onDeselectRecord;
  onEmptyMapClickRef.current = onEmptyMapClick;
  onSelectZoneRef.current = onSelectZone;
  onDeselectZoneRef.current = onDeselectZone;
  onZoneBoundsChangeRef.current = onZoneBoundsChange;
  onZoneDrawingChangeRef.current = onZoneDrawingChange;
  onViewportChangeRef.current = onViewportChange;
  onUserLocationRef.current = onUserLocation;

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
      map.setPaintProperty('admin-record-icons', 'icon-opacity', mode === 'Sharing' ? ['case', ['get', 'dimmed'], 0.35, 1] : mode === 'Zones' ? ['case', ['get', 'hovered'], 1, 0.4] : 1);
    }
  }, [mode, zones, selectedZoneId, zoneDraft]);

  useEffect(() => {
    if (!zoneDraft || zoneBoundsLocked) zoneAnchorRef.current = null;
  }, [zoneDraft, zoneBoundsLocked]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !['Zones', 'Sharing'].includes(mode) || !hasZoneBounds(zoneDraft) || zoneBoundsLocked || zoneAnchorRef.current) {
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
  }, [mode, zoneDraft, zoneBoundsLocked]);

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
    element.classList.toggle('information-marker', editingRecord?.kind === 'PLACE' && (editingCategory?.marker_style ?? editingRecord.category_marker_style) === 'information');
    element.title = 'Drag to adjust position';
    element.style.backgroundColor = editingRecord?.kind === 'PLACE' ? (editingCategory?.color ?? editingRecord.category_color) : '';
    if (editingRecord) {
      let icon = element.querySelector('img');
      if (!icon) {
        icon = document.createElement('img');
        icon.alt = '';
        element.replaceChildren(icon);
      }
      const url = editingRecord.kind === 'PLACE' && element.classList.contains('information-marker')
        ? placeMarkerUrl(editingCategory?.icon ?? editingRecord.category_icon, editingCategory?.color ?? editingRecord.category_color, 'information')
        : editingRecord.kind === 'PLACE' ? categoryIconUrl(editingCategory?.icon ?? editingRecord.category_icon, 60) : noteMarkerUrl;
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
    if (!map || !mapReady || !mapAction) return;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const mobile = width <= 700;
    if (mapAction.type === 'focus') {
      const { longitude, latitude } = mapAction.record;
      map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 16),
        offset: mobile
          ? [0, -Math.min(140, height * 0.2)]
          : travellerLayout ? [360, 0] : [Math.min(170, width * 0.2), 0],
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
    } else if (mapAction.type === 'zones' && mapAction.zones.length) {
      const bounds = mapAction.zones.reduce((result, zone) => [
        [Math.min(result[0][0], zone.min_lon), Math.min(result[0][1], zone.min_lat)],
        [Math.max(result[1][0], zone.max_lon), Math.max(result[1][1], zone.max_lat)],
      ], [[Infinity, Infinity], [-Infinity, -Infinity]]);
      map.fitBounds(bounds, {
        padding: {
          top: 32,
          right: 32,
          bottom: mobile ? 32 : 32,
          left: mobile ? 32 : Math.min(380, width * 0.4),
        },
        maxZoom: 15,
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
          zoom: mapAction.category ? 15 : 10,
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
          maxZoom: mapAction.category ? 15 : 12,
          duration: 650,
        });
      }
    }
  }, [mapAction, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (sharing) {
      map.stop();
      adminCameraRef.current = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
      adminSearchRef.current = { query: geoQuery, results: geoResults, error: geoError };
    } else if (adminCameraRef.current) {
      geoRequestRef.current?.abort();
      map.stop();
      map.jumpTo(adminCameraRef.current);
      adminCameraRef.current = null;
      setGeoQuery(adminSearchRef.current.query);
      setGeoResults(adminSearchRef.current.results);
      setGeoError(adminSearchRef.current.error);
      adminSearchRef.current = null;
    }
    map.resize();
  }, [sharing]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    let map;
    let customControls;
    let hoveredZoneId = null;
    let emptyMapClickTimer = null;
    let ignoreEmptyClickUntil = 0;
    try {
      map = new Map({
        container: containerRef.current,
        style: LOCAL_STYLES.hiking,
        center: INITIAL_MAP_VIEW.center,
        zoom: INITIAL_MAP_VIEW.zoom,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.on('zoomend', () => console.log('Zoom :', map.getZoom().toFixed(2)));
      const collapseAttribution = () => {
        const attribution = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
        attribution?.classList.remove('maplibregl-compact-show');
        attribution?.removeAttribute('open');
      };
      collapseAttribution();
      map.on('load', collapseAttribution);
      map.on('resize', collapseAttribution);
      const mobileTravellerControls = travellerLayout && window.matchMedia('(max-width: 700px)').matches;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      const topRightContainer = map.getContainer().querySelector('.maplibregl-ctrl-top-right');
      customControls = document.createElement('div');
      customControls.className = 'maplibregl-ctrl map-custom-controls';
      topRightContainer?.appendChild(customControls);
      setTopRightControlNode(customControls);
      const secondaryControlPosition = mobileTravellerControls ? 'top-right' : 'bottom-right';
      if (geolocate) {
        const geolocateControl = new GeolocateControl({ trackUserLocation: true });
        geolocateControl.on('geolocate', ({ coords }) => onUserLocationRef.current?.({ latitude: coords.latitude, longitude: coords.longitude }));
        map.addControl(geolocateControl, secondaryControlPosition);
      }
      map.addControl(new NorthControl(), secondaryControlPosition);
      if (!mobileTravellerControls) map.addControl(new TiltControl(), 'bottom-right');
      const cancelEmptyClickForZoom = () => {
        if (emptyMapClickTimer !== null) {
          window.clearTimeout(emptyMapClickTimer);
          emptyMapClickTimer = null;
        }
        ignoreEmptyClickUntil = Date.now() + 600;
      };
      map.on('dblclick', cancelEmptyClickForZoom);
      map.on('zoomstart', cancelEmptyClickForZoom);
      map.on('touchstart', () => {
        if (emptyMapClickTimer !== null) {
          window.clearTimeout(emptyMapClickTimer);
          emptyMapClickTimer = null;
        }
      });
      const updateViewport = () => {
        const bounds = map.getBounds();
        onViewportChangeRef.current({
          west: bounds.getWest(), east: bounds.getEast(),
          south: bounds.getSouth(), north: bounds.getNorth(),
        });
      };
      map.on('load', () => { updateViewport(); setMapReady(true); });
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
        if (emptyMapClickTimer !== null) {
          window.clearTimeout(emptyMapClickTimer);
          emptyMapClickTimer = null;
        }
        if (pickingRef.current) {
          onPickLocationRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
          return;
        }
        if (['Zones', 'Sharing'].includes(modeRef.current) && zoneDraftRef.current && !zoneBoundsLockedRef.current && (zoneAnchorRef.current || !hasZoneBounds(zoneDraftRef.current))) {
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
          window.requestAnimationFrame(() => {
            const markerPoint = feature.geometry?.coordinates
              ? map.project(feature.geometry.coordinates)
              : event.point;
            const mapWidth = map.getContainer().clientWidth;
            const mapRect = map.getContainer().getBoundingClientRect();
            const travellerPage = map.getContainer().closest('.traveller-page');
            const historyRect = travellerPage?.querySelector('.traveller-map-info')?.getBoundingClientRect();
            const mainRect = map.getContainer().closest('.traveller-main')?.getBoundingClientRect();
            const halfPanelHeight = (window.innerHeight * 0.5) - 32;
            const halfPanelTop = mainRect ? mainRect.bottom - halfPanelHeight : null;
            const markerPageY = mapRect.top + markerPoint.y;
            const distances = {
              left: markerPoint.x,
              right: mapWidth - markerPoint.x,
              top: historyRect ? markerPageY - historyRect.bottom : null,
              bottom: halfPanelTop === null ? null : halfPanelTop - markerPageY,
            };
            console.log('[Map marker] distances aux bords', {
              left: Math.round(distances.left),
              right: Math.round(distances.right),
              'distance au bas de History': distances.top === null ? null : Math.round(distances.top),
              'distance au haut du panel 50%': distances.bottom === null ? null : Math.round(distances.bottom),
            });
            const horizontalEdgeThreshold = mapWidth * 0.1;
            const verticalEdgeThreshold = window.innerHeight * 0.1;
            const tooCloseToEdge = distances.left < horizontalEdgeThreshold ||
              distances.right < horizontalEdgeThreshold ||
              (distances.top !== null && distances.top < verticalEdgeThreshold) ||
              (distances.bottom !== null && distances.bottom < verticalEdgeThreshold);
            if (tooCloseToEdge && historyRect && halfPanelTop !== null) {
              map.panBy([
                distances.left - ((distances.left + distances.right) / 2),
                distances.top - ((distances.top + distances.bottom) / 2),
              ], { duration: 500 });
            }
          });
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
        if (modeRef.current === 'Zones' || modeRef.current === 'Sharing') {
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
        const hadSelectedRecord = Boolean(selectedRecordRef.current);
        const deferEmptyClick = Boolean(
          onEmptyMapClickRef.current && window.matchMedia('(max-width: 700px)').matches,
        );
        if (deferEmptyClick) {
          if (Date.now() < ignoreEmptyClickUntil) return;
          if ((event.originalEvent?.detail ?? 1) > 1) return;
          emptyMapClickTimer = window.setTimeout(() => {
            emptyMapClickTimer = null;
            if (!hadSelectedRecord) onDeselectRecordRef.current();
            onDeselectZoneRef.current();
            onEmptyMapClickRef.current?.({ hadSelectedRecord });
          }, 150);
        } else {
          onDeselectRecordRef.current();
          onDeselectZoneRef.current();
          onEmptyMapClickRef.current?.({ hadSelectedRecord });
        }
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
        if (selectedStyleRef.current === 'sketch') {
          try {
            const [land, water] = await Promise.all([loadSvg(sketchLandUrl), loadSvg(sketchWaterUrl)]);
            if (currentLoadId === styleLoadId) {
              map.addImage('sketch-land', land, { pixelRatio: 2 });
              map.addImage('sketch-water', water, { pixelRatio: 2 });
              map.setPaintProperty('background', 'background-pattern', 'sketch-land');
              map.setPaintProperty('water', 'fill-pattern', 'sketch-water');
            }
          } catch {
            setMapError('The sketch textures could not load.');
          }
        }
        try {
          const [noteImage] = await Promise.all([
            loadSvg(noteMarkerUrl),
            addPlaceImages(map, placesRef.current),
          ]);
          if (currentLoadId !== styleLoadId) return;
          if (!map.hasImage('petassos-note')) {
            map.addImage('petassos-note', noteImage, { pixelRatio: 4 });
          }
          map.addLayer({
            id: 'admin-record-icons', type: 'symbol', source: 'admin-records',
            layout: {
              'icon-image': ['get', 'image'],
              'icon-size': ['case', ['get', 'selected'],
                ['case', ['==', ['get', 'kind'], 'NOTE'], 1.45, ['get', 'special'], 1.75, 44 / 31],
                ['get', 'hovered'], ['case', ['get', 'special'], 1.6, 1.15],
                ['get', 'special'], 1.45, 1],
              'symbol-sort-key': ['case', ['get', 'selected'], 2, ['get', 'hovered'], 1, ['get', 'dimmed'], -1, 0],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: {
              'icon-opacity': modeRef.current === 'Sharing' ? ['case', ['get', 'dimmed'], 0.35, 1] : modeRef.current === 'Zones' ? ['case', ['get', 'hovered'], 1, 0.4] : 1,
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
      if (emptyMapClickTimer !== null) window.clearTimeout(emptyMapClickTimer);
      geoRequestRef.current?.abort();
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      zoneHandlesRef.current.forEach(({ marker }) => marker.remove());
      zoneHandlesRef.current = [];
      mapRef.current = null;
      customControls?.remove();
      setTopRightControlNode(null);
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
    mapRef.current?.setStyle(LOCAL_STYLES[style] ?? MAP_STYLE_URL);
  }

  return (
    <div className="map-area">
      <div className="map-canvas" ref={containerRef} aria-label="Interactive map of Crete" />
      <GeoSearch
        query={geoQuery}
        results={geoResults}
        busy={geoBusy}
        error={geoError}
        onSubmit={submitGeoSearch}
        onEscape={() => setGeoResults(null)}
        onChange={(event) => {
          geoRequestRef.current?.abort();
          setGeoQuery(event.target.value);
          setGeoResults(null);
          setGeoError('');
        }}
        onChoose={chooseGeoResult}
      />
      {topRightControlNode && createPortal(<>
        <MapStyleControl
          selectedStyle={selectedStyle}
          open={styleMenuOpen}
          onToggle={() => { setVisibilityOpen(false); setStyleMenuOpen((open) => !open); }}
          onChoose={chooseStyle}
        />
        <MapVisibilityControl
          categories={categories}
          hiddenCategoryIds={hiddenCategoryIds}
          notesVisible={notesVisible}
          showNotesOption={showNotesOption}
          open={visibilityOpen}
          onToggle={() => { setStyleMenuOpen(false); setVisibilityOpen((open) => !open); }}
          onToggleCategory={onToggleCategory}
          onToggleNotes={onToggleNotes}
          onShowAll={onShowAll}
          onHideAll={onHideAll}
        />
      </>, topRightControlNode)}
      {mapError && <p className="map-error" role="alert">{mapError}</p>}
    </div>
  );
}
