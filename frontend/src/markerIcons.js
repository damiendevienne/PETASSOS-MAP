import restaurant from '@mapbox/maki/icons/restaurant.svg?raw';
import mountain from '@mapbox/maki/icons/mountain.svg?raw';
import beach from '@mapbox/maki/icons/beach.svg?raw';
import alcoholShop from '@mapbox/maki/icons/alcohol-shop.svg?raw';

const makiIcons = { restaurant, mountain, beach, 'alcohol-shop': alcoholShop };

function svgUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function categoryIconUrl(key, size = 15) {
  return svgUrl((makiIcons[key] ?? restaurant)
    .replace('width="15" height="15"', `width="${size}" height="${size}"`)
    .replace('<svg ', '<svg fill="white" '));
}

export function placeMarkerUrl(key, color) {
  const pictogram = (makiIcons[key] ?? restaurant).match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? '';
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
