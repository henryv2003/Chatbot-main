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

    // 4. THE ULTIMATE MODEL HUNTER
    const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash-latest",
        "gemini-2.0-flash"
    ];

    let lastError = null;
    let successfulModel = null;
    let responseText = null;

    try {
        for (const modelId of modelsToTry) {
            try {
                const result = await ai.models.generateContent({
                    model: modelId,
                    contents: contents
                });

                responseText = result.text || (result.response && result.response.text ? result.response.text() : null);

                if (responseText) {
                    successfulModel = modelId;
                    break;
                }
            } catch (err) {
                console.log(`Model Hunter: ${modelId} failed: ${err.message}`);
                lastError = err;
            }
        }

        if (responseText) {
            return res.status(200).json({
                text: responseText,
                model_used: successfulModel,
                location: "Sweden (Authenticated)"
            });
        }

        // If we reach here, all failed
        throw lastError;

    } catch (error) {
        console.error("Gemini Unified SDK Final Error:", error.message);

        res.status(error.status || 500).json({
            error: "Gemini API Error - All models failed",
            message: error.message,
            diagnostics: {
                location: "Sweden",
                sdk: "@google/genai",
                models_tried: modelsToTry,
                is_404: error.message.includes("404"),
                is_429: error.message.includes("429")
            },
            remediation: "If you see a mix of 404/429, your API Key might be restricted to an older project. Go to AI Studio and create a NEW project for a fresh API key."
        });
    }
};