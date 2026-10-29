import { placeMarkerUrl } from './markerIcons.js';

export function loadSvg(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

export function placeMarkerId(record) {
  return `petassos-${record.category_color?.slice(1)}-${record.category_icon}-${record.category_marker_style ?? 'circle'}`;
}

export async function addPlaceImages(map, places) {
  const markers = new globalThis.Map(places.map((place) => [placeMarkerId(place), place]));
  await Promise.all([...markers].map(async ([id, place]) => {
    if (map.hasImage(id)) return;
    const image = await loadSvg(placeMarkerUrl(place.category_icon, place.category_color, place.category_marker_style));
    if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 4 });
  }));
}

export function recordsGeoJSON(places, notes, selectedRecord, editingRecord, hoveredRecord = null) {
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
        dimmed: Boolean(record.preview_dimmed),
        special: record.category_marker_style === 'information',
      },
    })),
  };
}

export function hasZoneBounds(zone) {
  return Boolean(zone && [zone.min_lat, zone.max_lat, zone.min_lon, zone.max_lon].every(Number.isFinite));
}

export function zoneArea(zone) {
  return (zone.max_lat - zone.min_lat) * (zone.max_lon - zone.min_lon);
}

export function containsPoint(zone, { lat, lng }) {
  return zone.min_lat <= lat && lat <= zone.max_lat && zone.min_lon <= lng && lng <= zone.max_lon;
}

export function zoneLabelColor(hoveredId = null) {
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

export function zonesGeoJSON(mode, zones, selectedZoneId, zoneDraft) {
  const active = mode === 'Zones' || mode === 'Sharing';
  const isSelected = (id) => Array.isArray(selectedZoneId) ? selectedZoneId.includes(id) : id === selectedZoneId;
  const visibleZones = zones.filter((zone) => zone.id !== zoneDraft?.id && hasZoneBounds(zone))
    .sort((left, right) => zoneArea(right) - zoneArea(left) || left.id - right.id);
  if (active && hasZoneBounds(zoneDraft)) visibleZones.push(zoneDraft);
  return {
    type: 'FeatureCollection',
    features: [
      ...visibleZones.map((zone) => zoneFeature(zone, zone === zoneDraft || isSelected(zone.id), active && (mode !== 'Sharing' || zone === zoneDraft || isSelected(zone.id)), zone === zoneDraft)),
      ...visibleZones.filter((zone) => zone.name?.trim()).map((zone) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [zone.min_lon, zone.max_lat] },
        properties: { id: zone.id ?? 0, name: zone.name, active: active && (mode !== 'Sharing' || zone === zoneDraft || isSelected(zone.id)), selected: zone === zoneDraft || isSelected(zone.id), draft: zone === zoneDraft },
      })),
    ],
  };
}

export function rectangleBounds(first, second) {
  const bounds = {
    min_lat: Math.min(first.lat, second.lat), max_lat: Math.max(first.lat, second.lat),
    min_lon: Math.min(first.lng, second.lng), max_lon: Math.max(first.lng, second.lng),
  };
  return bounds.max_lat - bounds.min_lat > 0.00001 && bounds.max_lon - bounds.min_lon > 0.00001 ? bounds : null;
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

