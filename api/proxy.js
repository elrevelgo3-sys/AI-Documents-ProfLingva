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
  // Prioritize the key from server environment (Secure)
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

  // 3. Construct Target URL
  // The SDK appends the path to the baseUrl.
  let googlePath = req.url;
  
  // Remove the /api/proxy prefix if it exists to get the real path
  if (googlePath.startsWith('/api/proxy')) {
      googlePath = googlePath.replace('/api/proxy', '');
  }
  
  const targetBase = 'https://generativelanguage.googleapis.com';
  // Ensure we don't duplicate slashes
  if (!googlePath.startsWith('/')) googlePath = '/' + googlePath;

  const urlObj = new URL(targetBase + googlePath);
  
  // Always override the key with the server-side key
  urlObj.searchParams.set('key', apiKey);

  const targetUrl = urlObj.toString();

  try {
    // 4. Forward the Request
    const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-client': req.headers['x-goog-api-client'] || 'genai-js-proxy',
    };

    const googleResponse = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      // Pass body directly. Vercel automatically parses JSON bodies, so strictly we should stringify it back.
      // If req.body is already a string (rare in Vercel functions for JSON types), use it as is.
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