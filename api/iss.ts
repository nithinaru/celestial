import { proxyJson } from '../server/proxyJson.js';

// CelesTrak blocks an address that downloads the same data more than once per
// 2 hours (HTTP 403). Fetching it here behind a 2-hour CDN cache means Vercel
// asks once and every visitor shares the answer. Orbital elements only update
// a few times a day, and satellite.js propagates them to the live position.
export function GET(): Promise<Response> {
  return proxyJson('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json', 7200);
}
