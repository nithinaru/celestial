// Shared by api/*.ts. Lives outside api/ because every file there deploys as a function.
// Successful upstream JSON is cached on Vercel's CDN for `maxAgeSeconds`.
// Failures are never cached, so the client falls back to /fallback/*.json
// and the next request retries upstream.
export async function proxyJson(url: string, maxAgeSeconds: number): Promise<Response> {
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await upstream.text();
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    JSON.parse(body); // CelesTrak answers some errors with 200 + plain text
    return new Response(body, {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=86400`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
}
