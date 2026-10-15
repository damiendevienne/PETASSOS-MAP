import { GEOCODER_URL, GEOCODER_VIEWBOX } from './config.js';

const cache = new Map();
let lastRequestAt = 0;

export async function searchLocations(query, signal) {
  const search = query.trim();
  if (!search) return [];
  const key = search.toLocaleLowerCase();
  if (cache.has(key)) return cache.get(key);

  const delay = Math.max(0, lastRequestAt + 1100 - Date.now());
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
  lastRequestAt = Date.now();

  const url = new URL(GEOCODER_URL);
  url.search = new URLSearchParams({ q: search, format: 'jsonv2', limit: '5', viewbox: GEOCODER_VIEWBOX }).toString();
  const response = await fetch(url, { signal, referrerPolicy: 'origin' });
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
  const places = await response.json();
  const results = places.map((place) => {
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    const box = place.boundingbox?.map(Number);
    const boundingBox = box?.length === 4 && box.every(Number.isFinite)
      ? [[box[2], box[0]], [box[3], box[1]]]
      : null;
    return { label: place.display_name, latitude, longitude, boundingBox };
  }).filter((place) => place.label && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
  cache.set(key, results);
  return results;
}
