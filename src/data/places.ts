import { angularDistance, type LatLng } from '../sky/sun';

// A short gazetteer, enough to name where any event is without a network call. Aurora towns
// first (that is where people actually stand to watch), then big cities, then remote anchors
// so deserts, ice and tundra still get a name.
const PLACES: [name: string, lat: number, lng: number][] = [
  ['Tromsø, Norway', 69.65, 18.96],
  ['Reykjavík, Iceland', 64.15, -21.94],
  ['Yellowknife, Canada', 62.45, -114.37],
  ['Fairbanks, Alaska', 64.84, -147.72],
  ['Anchorage, Alaska', 61.22, -149.9],
  ['Whitehorse, Canada', 60.72, -135.06],
  ['Churchill, Canada', 58.77, -94.17],
  ['Iqaluit, Canada', 63.75, -68.52],
  ['Nuuk, Greenland', 64.18, -51.69],
  ['Ilulissat, Greenland', 69.22, -51.1],
  ['Kiruna, Sweden', 67.86, 20.23],
  ['Rovaniemi, Finland', 66.5, 25.73],
  ['Murmansk, Russia', 68.97, 33.08],
  ['Longyearbyen, Svalbard', 78.22, 15.65],
  ['Norilsk, Russia', 69.35, 88.2],
  ['Yakutsk, Russia', 62.03, 129.73],
  ['Hobart, Tasmania', -42.88, 147.33],
  ['Invercargill, New Zealand', -46.41, 168.35],
  ['Ushuaia, Argentina', -54.8, -68.3],
  ['McMurdo Station, Antarctica', -77.85, 166.67],
  ['Lisbon, Portugal', 38.72, -9.14],
  ['Ponta Delgada, Azores', 37.74, -25.67],
  ['London, UK', 51.51, -0.13],
  ['Madrid, Spain', 40.42, -3.7],
  ['Berlin, Germany', 52.52, 13.4],
  ['Moscow, Russia', 55.76, 37.62],
  ['Istanbul, Türkiye', 41.01, 28.98],
  ['Cairo, Egypt', 30.04, 31.24],
  ['Tamanrasset, Algeria', 22.79, 5.52],
  ['Lagos, Nigeria', 6.52, 3.38],
  ['Kinshasa, DR Congo', -4.44, 15.27],
  ['Nairobi, Kenya', -1.29, 36.82],
  ['Cape Town, South Africa', -33.92, 18.42],
  ['Antananarivo, Madagascar', -18.88, 47.51],
  ['Riyadh, Saudi Arabia', 24.71, 46.68],
  ['Tehran, Iran', 35.69, 51.39],
  ['Mumbai, India', 19.08, 72.88],
  ['Delhi, India', 28.61, 77.21],
  ['Almaty, Kazakhstan', 43.24, 76.95],
  ['Novosibirsk, Russia', 55.01, 82.93],
  ['Ulaanbaatar, Mongolia', 47.89, 106.91],
  ['Beijing, China', 39.9, 116.4],
  ['Shanghai, China', 31.23, 121.47],
  ['Lhasa, Tibet', 29.65, 91.1],
  ['Bangkok, Thailand', 13.76, 100.5],
  ['Singapore', 1.35, 103.82],
  ['Jakarta, Indonesia', -6.21, 106.85],
  ['Manila, Philippines', 14.6, 120.98],
  ['Tokyo, Japan', 35.68, 139.69],
  ['Vladivostok, Russia', 43.12, 131.89],
  ['Port Moresby, Papua New Guinea', -9.44, 147.18],
  ['Darwin, Australia', -12.46, 130.84],
  ['Alice Springs, Australia', -23.7, 133.88],
  ['Perth, Australia', -31.95, 115.86],
  ['Sydney, Australia', -33.87, 151.21],
  ['Auckland, New Zealand', -36.85, 174.76],
  ['Suva, Fiji', -18.14, 178.44],
  ['Honolulu, Hawaii', 21.31, -157.86],
  ['Vancouver, Canada', 49.28, -123.12],
  ['San Francisco, USA', 37.77, -122.42],
  ['Denver, USA', 39.74, -104.99],
  ['Chicago, USA', 41.88, -87.63],
  ['New York, USA', 40.71, -74.01],
  ['Montréal, Canada', 45.5, -73.57],
  ['Miami, USA', 25.76, -80.19],
  ['Mexico City, Mexico', 19.43, -99.13],
  ['Bogotá, Colombia', 4.71, -74.07],
  ['Manaus, Brazil', -3.12, -60.02],
  ['Lima, Peru', -12.05, -77.04],
  ['São Paulo, Brazil', -23.55, -46.63],
  ['Buenos Aires, Argentina', -34.6, -58.38],
  ['Santiago, Chile', -33.45, -70.67],
];

function ocean({ lat, lng }: LatLng): string {
  if (lat > 66) return 'the Arctic Ocean';
  if (lat < -60) return 'the Southern Ocean';
  const half = lat >= 0 ? 'North' : 'South';
  if (lng > 20 && lng < 120 && lat < 25) return 'the Indian Ocean';
  if (lng > -80 && lng <= 20) return `the ${half} Atlantic`;
  return `the ${half} Pacific`;
}

/** "Tromsø, Norway" when an event is close to a named place, "Near …" within ~1,700 km, else the sea. */
export function placeName(p: LatLng): string {
  let best = PLACES[0];
  let dist = Infinity;
  for (const pl of PLACES) {
    const d = angularDistance(p, { lat: pl[1], lng: pl[2] });
    if (d < dist) [best, dist] = [pl, d];
  }
  if (dist <= 6) return best[0];
  if (dist <= 15) return `Near ${best[0]}`;
  return `Over ${ocean(p)}`;
}
