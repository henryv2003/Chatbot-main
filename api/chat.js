// api/chat.js (Vercel Serverless Function)
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;

// Initialize the client once outside the handler
let ai;
if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
}

module.exports = async (req, res) => {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

    // 2. Auth Check
    if (!API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is missing from environment variables." });
    }

    // 3. Request Body Parsing
    let bodyData;
    if (req.body && typeof req.body === 'object') {
        bodyData = req.body;
    } else {
        try {
            bodyData = await new Promise((resolve, reject) => {
                let body = '';
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', () => { resolve(body ? JSON.parse(body) : {}); });
                req.on('error', reject);
            });
        } catch (e) {
            return res.status(400).json({ error: "Invalid JSON" });
        }
    }

    const { contents } = bodyData;
    if (!contents) return res.status(400).json({ error: "Missing 'contents' in payload." });

    // 4. Generate Content using the NEW Unified SDK
    try {
        // Using Gemini 2.0 Flash - The modern standard
        const MODEL_NAME = "gemini-2.0-flash";

        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: contents
        });

        // The new SDK returns text directly on the result object or nested in response
        const responseText = result.text || (result.response && result.response.text ? result.response.text() : "No response text");

        res.status(200).json({
            text: responseText,
            model: MODEL_NAME
        });

    } catch (error) {
        console.error("Gemini Unified SDK Error:", error.message);

        // Final Diagnostic if it still fails
        res.status(error.status || 500).json({
            error: "Gemini API Error",
            message: error.message,
            diagnostics: {
                location: "Sweden",
                key_prefix: API_KEY.substring(0, 4),
                is_404: error.message.includes("404"),
                sdk: "@google/genai"
            },
            remediation: "If you still see 404, it is most likely that the 'Generative Language API' is not enabled in your Google Cloud Project."
        });
    }
};