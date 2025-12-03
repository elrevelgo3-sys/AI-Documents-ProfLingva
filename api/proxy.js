// api/proxy.js
// Handles requests from @google/genai SDK and forwards to Google

export default async function handler(req, res) {
  // 1. CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-client, x-goog-api-key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // 2. API Key Strategy
    // The SDK might send a dummy key. We MUST replace it with the real server-side key.
    let apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error('Server Error: GOOGLE_API_KEY is not set in Vercel Environment Variables.');
    }

    // 3. Construct Target URL
    // Incoming URL example: /api/proxy/v1beta/models/gemini-1.5-flash:generateContent
    // We need: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=REAL_KEY
    
    const path = req.url.replace(/^\/api\/proxy/, ''); // Remove /api/proxy prefix
    const targetUrl = new URL('https://generativelanguage.googleapis.com' + path);
    
    // Force set the real API key
    targetUrl.searchParams.set('key', apiKey);

    // 4. Forward Request
    const googleResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // Pass through client version info if needed
        'x-goog-api-client': req.headers['x-goog-api-client'] || 'genai-js-proxy',
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    // 5. Return Response
    const data = await googleResponse.json();
    
    // Pass the status code from Google
    res.status(googleResponse.status).json(data);

  } catch (error) {
    console.error('Proxy Internal Error:', error);
    res.status(500).json({ 
      error: {
        message: error.message || 'Internal Proxy Error',
        code: 500
      }
    });
  }
}
