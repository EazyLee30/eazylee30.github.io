// Gemini API Proxy - Serverless Function
// This file should be deployed as a serverless function (Vercel, Netlify, etc.)
// Or use GitHub Actions to inject the API key at build time

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDnS5TsKWzhcdX_MfEtEKqSwhrvctTNV_g';
  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: req.body.prompt
          }]
        }]
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
}

