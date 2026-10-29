import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';

const PALETTES = {
  olive: { canvas: '#f2eddf', land: '#e5dec9', water: '#a9cbc8', roads: '#fffaf0', labels: '#354840' },
  coast: { canvas: '#102d3b', land: '#244553', water: '#39727b', roads: '#94aaa3', labels: '#edf0df' },
  field: { canvas: '#edf0df', land: '#d9e0cb', water: '#a9c9c4', roads: '#fff9e9', labels: '#344d43' },
};

const SWATCHES = [
  '#f4f0e6', '#f2eddf', '#e5dec9', '#d9e0cb', '#b9c6ad', '#a9cbc8',
  '#39727b', '#244553', '#102d3b', '#fffaf0', '#e8cfa5', '#c28a5c',
  '#a4513c', '#dfaa70', '#7d8b69', '#526c5b', '#354840', '#263c36',
];

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [25.1, 35.2],
  zoom: 6.5,
  minZoom: 2,
  maxZoom: 20,
  attributionControl: true,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

const colorInputs = Object.fromEntries(
  [...document.querySelectorAll('[data-color]')].map((input) => [input.dataset.color, input]),
);
let colors = { ...PALETTES.olive };

function syncColorInput(key) {
  const input = colorInputs[key];
  input.value = colors[key];
  input.classList.remove('invalid');
  document.querySelector(`[data-color-chip="${key}"]`).style.backgroundColor = colors[key];
}

function applyColors() {
  if (!map.isStyleLoaded()) return;

  for (const layer of map.getStyle().layers) {
    const sourceLayer = (layer['source-layer'] ?? '').toLowerCase();

    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', colors.canvas);
    } else if (layer.type === 'fill') {
      if (sourceLayer === 'water') {
        map.setPaintProperty(layer.id, 'fill-color', colors.water);
      } else if (['landcover', 'landuse', 'park', 'building'].includes(sourceLayer)) {
        map.setPaintProperty(layer.id, 'fill-color', colors.land);
      }
    } else if (layer.type === 'line') {
      if (sourceLayer === 'transportation') {
        map.setPaintProperty(layer.id, 'line-color', colors.roads);
      } else if (sourceLayer === 'waterway') {
        map.setPaintProperty(layer.id, 'line-color', colors.water);
      }
    } else if (layer.type === 'symbol' && layer.layout?.['text-field']) {
      map.setPaintProperty(layer.id, 'text-color', colors.labels);
      map.setPaintProperty(layer.id, 'text-halo-color', colors.canvas);
    }
  }
}

function setPalette(name) {
  colors = { ...PALETTES[name] };
  Object.keys(colors).forEach(syncColorInput);
  document.querySelectorAll('[data-palette]').forEach((button) => {
    button.classList.toggle('active', button.dataset.palette === name);
  });
  applyColors();
}

Object.keys(colorInputs).forEach((key) => {
  syncColorInput(key);
  const grid = document.querySelector(`[data-swatches="${key}"]`);
  SWATCHES.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch-option';
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch.setAttribute('aria-label', `Set ${key} to ${color}`);
    swatch.addEventListener('click', () => {
      colorInputs[key].value = color;
      colorInputs[key].dispatchEvent(new Event('input', { bubbles: true }));
      grid.closest('details').open = false;
    });
    grid.append(swatch);
  });

  colorInputs[key].addEventListener('input', () => {
    const value = colorInputs[key].value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(value)) {
      colorInputs[key].classList.add('invalid');
      return;
    }
    colorInputs[key].classList.remove('invalid');
    colors[key] = value;
    document.querySelector(`[data-color-chip="${key}"]`).style.backgroundColor = value;
    document.querySelectorAll('[data-palette]').forEach((button) => button.classList.remove('active'));
    applyColors();
  });
});

document.querySelectorAll('[data-palette]').forEach((button) => {
  button.addEventListener('click', () => setPalette(button.dataset.palette));
});

const exportButton = document.querySelector('#export-style');
const exportStatus = document.querySelector('#export-status');

map.on('load', () => {
  applyColors();
  exportButton.disabled = false;
});

exportButton.addEventListener('click', () => {
  const style = map.getStyle();
  const file = new Blob([`${JSON.stringify(style, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'petassos-map-style.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  exportStatus.textContent = 'Style downloaded';
  window.setTimeout(() => { exportStatus.textContent = ''; }, 3500);
});

window.addEventListener('resize', () => map.resize());
