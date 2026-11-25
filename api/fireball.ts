import { proxyJson } from '../server/proxyJson.js';

// JPL's fireball API sends no CORS header, so the browser calls this instead.
// The client falls back to /fallback/fireball.json if this fails.
export function GET(request: Request): Promise<Response> {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 200);
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 5000 ? limit : 200;
  // fireballs are reported days late; an hour of CDN cache is plenty fresh
  // vel-comp adds each fireball's entry velocity vector, which the globe draws as its streak
  return proxyJson(`https://ssd-api.jpl.nasa.gov/fireball.api?limit=${safeLimit}&vel-comp=true`, 3600);
}
