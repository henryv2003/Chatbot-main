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

    // 4. THE ULTIMATE MODEL HUNTER (with multi-error reporting)
    const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.0-flash"
    ];

    const results = [];
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
                results.push({
                    model: modelId,
                    error: err.message,
                    is_p_0: err.message.includes("limit: 0") || err.message.includes("429")
                });
            }
        }

        if (responseText) {
            return res.status(200).json({
                text: responseText,
                model_used: successfulModel,
                meta: { location: "Sweden", sdk: "@google/genai" }
            });
        }

        // If we reach here, all failed - construct a detailed report
        const isAllQuota = results.every(r => r.is_p_0);

        return res.status(429).json({
            error: "Gemini Quota/Permission Error",
            message: "None of the available models worked for your API Key.",
            diagnostics: {
                location: "Sweden (EU/EEA)",
                sdk: "@google/genai",
                detailed_errors: results
            },
            remediation: isAllQuota
                ? "Your API Key has 0 quota for THESE models. In the EU (Sweden), Google requires you to enable Billing or use a specific Paid Tier project in AI Studio for some models."
                : "A mix of 404/429 errors suggests your API Key is restricted. Please create a NEW project at https://aistudio.google.com/ and get a fresh key."
        });

    } catch (criticalErr) {
        console.error("Critical SDK Error:", criticalErr.message);
        res.status(500).json({ error: "Server Error", message: criticalErr.message });
    }
};