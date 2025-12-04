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
  
  // If no key in query, check if we have one in server environment
  if (!apiKey || apiKey === 'dummy_key_for_proxy') {
      apiKey = process.env.GOOGLE_API_KEY;
  }

  if (!apiKey) {
    return res.status(500).json({ 
        error: 'Configuration Error: No API Key provided by client and GOOGLE_API_KEY not set on server.' 
    });
  }

  // 3. Construct Target URL
  // The incoming req.url includes the query string.
  // Example incoming: /api/proxy/v1beta/models/gemini-pro:generateContent?key=...
  // We want: https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=REAL_KEY

  // Strip '/api/proxy' from the start of the path
  const path = req.url.replace(/^\/api\/proxy/, '');
  
  // Ensure we don't duplicate the key in the query params
  const urlObj = new URL('https://generativelanguage.googleapis.com' + path);
  
  // Update/Set the key
  urlObj.searchParams.set('key', apiKey);

  const targetUrl = urlObj.toString();

  try {
    // 4. Forward the Request
    const googleResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // Forward client info if present
        'x-goog-api-client': req.headers['x-goog-api-client'] || 'genai-js/1.0',
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    // 5. Return the Response
    const data = await googleResponse.json();

    if (!googleResponse.ok) {
        console.error('Google API Error:', data);
        return res.status(googleResponse.status).json(data);
    }

    res.status(200).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message || 'Internal Proxy Error' });
  }
}