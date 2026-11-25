// JPL's fireball API sends no CORS header, so the browser calls this instead.
// The client falls back to /fallback/fireball.json if this fails.
export async function GET(request: Request): Promise<Response> {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 200);
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 5000 ? limit : 200;
  const upstream = await fetch(`https://ssd-api.jpl.nasa.gov/fireball.api?limit=${safeLimit}`);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      // fireballs are reported days late; an hour of CDN cache is plenty fresh
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
