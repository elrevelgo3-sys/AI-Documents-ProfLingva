// This file handles requests forwarded from the Vercel rewrite.
// It proxies everything to Google's Generative Language API.

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-client, x-goog-api-key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Resolve Google API Key
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("PROXY ERROR: GOOGLE_API_KEY is not set in environment variables.");
    return res.status(500).json({ 
        error: {
            code: 500,
            message: 'Server Configuration Error: GOOGLE_API_KEY is missing on Vercel.',
            status: 'INTERNAL_SERVER_ERROR'
        }
    });
  }

  try {
    // 3. Construct Target URL
    const targetBase = 'https://generativelanguage.googleapis.com';
    
    // Determine the path. 
    // Vercel rewrites map /api/proxy/:path* -> /api/proxy?path=:path*
    let googlePath = '';

    if (req.query && req.query.path) {
        // If Vercel put the path in the query params
        const p = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
        googlePath = '/' + p.replace(/^\/+/, ''); // Ensure single leading slash
    } else {
        // Fallback: extract from req.url if no query param (e.g. local dev)
        googlePath = req.url.replace('/api/proxy', '');
        // Remove query params from the path string itself if they exist, 
        // as we will reconstruct them
        const qIndex = googlePath.indexOf('?');
        if (qIndex !== -1) {
            googlePath = googlePath.substring(0, qIndex);
        }
    }

    // Ensure path starts with /
    if (!googlePath.startsWith('/')) googlePath = '/' + googlePath;

    const urlObj = new URL(targetBase + googlePath);
    
    // Copy original query params (except 'path')
    const incomingUrlObj = new URL('http://localhost' + req.url);
    incomingUrlObj.searchParams.forEach((value, key) => {
        if (key !== 'path') {
            urlObj.searchParams.append(key, value);
        }
    });

    // CRITICAL: Force the API key
    urlObj.searchParams.set('key', apiKey);
    
    // CRITICAL: Ensure 'path' param is gone (Google API rejects it)
    urlObj.searchParams.delete('path');

    const targetUrl = urlObj.toString();
    // console.log(`Proxying to: ${targetUrl.replace(apiKey, 'HIDDEN_KEY')}`);

    // 4. Forward the Request
    const headers = {
        'Content-Type': 'application/json',
        // Pass the client version header if present
        ...(req.headers['x-goog-api-client'] && { 'x-goog-api-client': req.headers['x-goog-api-client'] }),
    };

    const googleResponse = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      // Pass body directly
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    const data = await googleResponse.json();

    if (!googleResponse.ok) {
        console.error('Google API Error via Proxy:', JSON.stringify(data));
        return res.status(googleResponse.status).json(data);
    }

    res.status(200).json(data);

  } catch (error) {
    console.error('Proxy Internal Error:', error);
    res.status(500).json({ error: { message: error.message || 'Internal Proxy Error' } });
  }
}