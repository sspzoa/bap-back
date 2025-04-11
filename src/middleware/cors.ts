export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://xn--rh3b.net',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('Origin');

  if (origin !== 'https://xn--rh3b.net') {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 403 });
    }
    return null;
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return null;
}
