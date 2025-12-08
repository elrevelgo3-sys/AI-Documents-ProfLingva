// Vercel Serverless Function (Node.js Runtime)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increased to 10mb to handle high-res page images
    },
    externalResolver: true,
  },
};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("Missing OPENROUTER_API_KEY on server");
    return res.status(500).json({ error: 'Server configuration error: Missing API Key.' });
  }

  try {
    const body = req.body;

    // console.log(`Proxying to OpenRouter: ${body.model}`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://proflingva.com',
        'X-Title': 'Prof Lingva Enterprise',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter Upstream Error:', response.status, errorText);
      return res.status(response.status).json({ error: `Provider Error: ${errorText}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy internal error:', error);
    return res.status(500).json({ error: 'Internal Proxy Error', details: error.message });
  }
}