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
  // Prioritize the key sent by the client SDK (in query or header), fall back to server env.
  let apiKey = req.query.key;
  
  // If no key in query, or if it's the placeholder from geminiService
  if (!apiKey || apiKey === 'dummy_key_for_proxy' || apiKey === 'MISSING_KEY') {
      apiKey = process.env.GOOGLE_API_KEY;
  }

  if (!apiKey) {
    console.error("PROXY ERROR: GOOGLE_API_KEY is not set in environment variables.");
    return res.status(500).json({ 
        error: {
            code: 500,
            message: 'Server Configuration Error: GOOGLE_API_KEY is missing. Please add it to Vercel Environment Variables.',
            status: 'INTERNAL_SERVER_ERROR'
        }
    });
  }

  // 3. Construct Target URL
  // The SDK appends the path to the baseUrl.
  // We need to strip the '/api/proxy' prefix to get the real Google path.
  
  let googlePath = req.url;
  
  // Remove the /api/proxy prefix if it exists
  if (googlePath.startsWith('/api/proxy')) {
      googlePath = googlePath.replace('/api/proxy', '');
  }
  
  const targetBase = 'https://generativelanguage.googleapis.com';
  // Ensure we don't duplicate slashes
  if (!googlePath.startsWith('/')) googlePath = '/' + googlePath;

  const urlObj = new URL(targetBase + googlePath);
  
  // Override the key with the real server-side key
  urlObj.searchParams.set('key', apiKey);

  const targetUrl = urlObj.toString();

  try {
    // 4. Forward the Request
    // We strictly use the body from the request.
    const googleResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // Forward client info if present
        'x-goog-api-client': req.headers['x-goog-api-client'] || 'genai-js/1.0',
      },
      // Pass body directly if it exists
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