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

    // 4. THE EU/EEA MODEL HUNTER 
    // Trying experimental and stable models to find any active quota
    const modelsToTry = [
        "gemini-2.0-flash-exp",   // Experimental (often has separate quota)
        "gemini-2.0-flash",       // Standard 2.0
        "gemini-1.5-flash",       // Standard 1.5
        "gemini-1.5-pro",        // Pro 1.5
        "gemini-1.0-pro"         // Legacy Pro (sometimes works when others are 429)
    ];

    const results = [];
    let successfulModel = null;
    let responseText = null;

    try {
        for (const modelId of modelsToTry) {
            try {
                // Use a short timeout to speed up the hunt
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
                    status: err.status || (err.message.includes("404") ? 404 : 429)
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

        // If all failed, provide the "Sweden Quota Fix" response
        return res.status(429).json({
            error: "Gemini Quota Block (Sweden/EU)",
            message: "Your project has 'Limit: 0' quota. This is a common Google restriction for new EU projects.",
            diagnostics: {
                location: "Sweden",
                detailed_report: results
            },
            remediation_guide: {
                step1: "Go to Google AI Studio (https://aistudio.google.com/)",
                step2: "Click 'Settings' (cog icon) -> 'Plan & Billing'",
                step3: "Ensure your project is on the 'Free of Charge' plan. If it says 'Limit: 0', you MUST link a Billing Account (even a free trial one) to unlock the quota.",
                step4: "Alternatively, create a completely NEW project in AI Studio. Sometimes the first project gets stuck with 0 quota in the EU."
            }
        });

    } catch (criticalErr) {
        res.status(500).json({ error: "Critical Error", message: criticalErr.message });
    }
};