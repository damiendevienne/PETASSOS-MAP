import restaurant from '@mapbox/maki/icons/restaurant.svg?raw';
import mountain from '@mapbox/maki/icons/mountain.svg?raw';
import beach from '@mapbox/maki/icons/beach.svg?raw';
import cafe from '@mapbox/maki/icons/cafe.svg?raw';
import alcoholShop from '@mapbox/maki/icons/alcohol-shop.svg?raw';
import drinkingWater from '@mapbox/maki/icons/drinking-water.svg?raw';
import heart from '@mapbox/maki/icons/heart.svg?raw';
import landmark from '@mapbox/maki/icons/landmark.svg?raw';
import lodging from '@mapbox/maki/icons/lodging.svg?raw';
import information from '@mapbox/maki/icons/information.svg?raw';
import museum from '@mapbox/maki/icons/museum.svg?raw';
import village from '@mapbox/maki/icons/village.svg?raw';
import music from '@mapbox/maki/icons/music.svg?raw';
import swimming from '@mapbox/maki/icons/swimming.svg?raw';
import star from '@mapbox/maki/icons/star.svg?raw';
import waterfall from '@mapbox/maki/icons/waterfall.svg?raw';
import water from '@mapbox/maki/icons/water.svg?raw';
import boat from '@mapbox/maki/icons/racetrack-boat.svg?raw';
import volcano from '@mapbox/maki/icons/volcano.svg?raw';

const eye = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 15 15"><path fill-rule="evenodd" d="M7.5 2C4 2 1.25 4.15.25 7.5 1.25 10.85 4 13 7.5 13s6.25-2.15 7.25-5.5C13.75 4.15 11 2 7.5 2Zm0 8.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>`;

const makiIcons = { restaurant, mountain, beach, cafe, 'alcohol-shop': alcoholShop, 'drinking-water': drinkingWater, heart, landmark, lodging, information, museum, village, music, swimming, star, waterfall, water, eye, 'racetrack-boat': boat, volcano };

function svgUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function categoryIconUrl(key, size = 15) {
  return svgUrl((makiIcons[key] ?? restaurant)
    .replace('width="15" height="15"', `width="${size}" height="${size}"`)
    .replace('<svg ', '<svg fill="white" '));
}

export function placeMarkerUrl(key, color, markerStyle = 'circle') {
  const pictogram = (makiIcons[key] ?? restaurant).match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? '';
  if (markerStyle === 'information') {
    return svgUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 31 31">
        <g fill="${color}" stroke="white" stroke-width="0.5" paint-order="stroke" transform="translate(2 2) scale(1.8)">${pictogram}</g>
      </svg>
    `);
  }
  return svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 31 31">
      <circle cx="15.5" cy="15.5" r="14.5" fill="${color}" stroke="white" stroke-width="2"/>
      <g fill="white" transform="translate(5.375 5.375) scale(1.35)">${pictogram}</g>
    </svg>
  `);
}

export const noteMarkerUrl = svgUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 30 30">
    <rect x="1" y="1" width="28" height="28" rx="7" fill="#e2a93b" stroke="white" stroke-width="2"/>
    <path d="m8 22 1.2-4.5 9.5-9.5 3.3 3.3-9.5 9.5L8 22Z" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/>
    <path d="m16.8 9.9 3.3 3.3" stroke="white" stroke-width="2"/>
  </svg>
`);
