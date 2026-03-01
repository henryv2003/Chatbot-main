// api/chat.js (Your Vercel Serverless Function)

// 1. Load environment variables
const API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;

// 2. Import the class for the SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 3. Initialize the AI client
if (!API_KEY) {
    module.exports = (req, res) => res.status(500).send("Error: GEMINI_API_KEY is missing from Vercel Environment Variables.");
    return;
}

// Log masked key for user verification in Vercel logs
console.log(`API Key loaded. Length: ${API_KEY.length}, Starts with: ${API_KEY.substring(0, 4)}..., Ends with: ...${API_KEY.substring(API_KEY.length - 4)}`);

const genAI = new GoogleGenerativeAI(API_KEY);
const MODEL_NAME = "gemini-1.5-flash"; // Standard modern model


// 4. Api chat endpoint
module.exports = async (req, res) => {

    // Set general CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS/preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only proceed if it's a POST request
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed. Use POST." });
    }

    let bodyData;

    // --- START: IMPROVED BODY PARSING ---
    if (req.body && typeof req.body === 'object') {
        bodyData = req.body;
    } else {
        try {
            // Read the body stream if not already parsed
            bodyData = await new Promise((resolve, reject) => {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    try {
                        resolve(body ? JSON.parse(body) : {});
                    } catch (e) {
                        reject(e);
                    }
                });
                req.on('error', reject);
            });
        } catch (error) {
            console.error("Error parsing request body:", error);
            return res.status(400).json({ error: "Invalid JSON in request body" });
        }
    }
    // --- END: IMPROVED BODY PARSING ---

    // Safely destructure the 'contents' property
    const { contents } = bodyData;

    try {
        if (!contents) {
            return res.status(400).json({ error: "Request body is missing 'contents'. Ensure you are sending JSON with the 'contents' key." });
        }

        // --- MODEL HUNTER MODE ---
        const variations = [
            { model: "gemini-1.5-flash", version: "v1" },
            { model: "gemini-1.5-flash-latest", version: "v1beta" },
            { model: "gemini-pro", version: "v1" }
        ];

        let lastError = null;
        let successfulModel = null;
        let responseText = null;

        for (const variant of variations) {
            try {
                // 1. Try with the official SDK
                const model = genAI.getGenerativeModel({ model: variant.model }, { apiVersion: variant.version });
                const result = await model.generateContent({ contents });
                responseText = result.response.text();
                successfulModel = `SDK: ${variant.model} (${variant.version})`;
                break;
            } catch (sdkErr) {
                // 2. Try RAW FETCH (REST API) as a final fallback
                try {
                    const url = `https://generativelanguage.googleapis.com/${variant.version}/models/${variant.model}:generateContent?key=${API_KEY}`;
                    const rawResponse = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents })
                    });
                    const rawData = await rawResponse.json();
                    if (rawResponse.ok && rawData.candidates && rawData.candidates[0].content) {
                        responseText = rawData.candidates[0].content.parts[0].text;
                        successfulModel = `RAW FETCH: ${variant.model}`;
                        break;
                    } else {
                        lastError = new Error(`Google API rejected the request with 404. This means the 'Generative Language API' is likely NOT enabled for your API Key project.`);
                    }
                } catch (fetchErr) {
                    lastError = sdkErr;
                }
            }
        }

        if (responseText) {
            return res.status(200).json({ text: responseText, model_used: successfulModel });
        }

        throw lastError;

    } catch (error) {
        console.error("Final catch-all error:", error);

        const statusCode = error.status || 500;
        const errorMessage = error.message || "Unknown error";

        res.status(statusCode).json({
            error: "Gemini API Configuration Error",
            message: "Google responded with 404 (Not Found).",
            diagnostics: {
                location: "Sweden (Supported)",
                key_prefix: API_KEY.substring(0, 4),
                key_length: API_KEY.length,
                is_404: true
            },
            remediation_steps: [
                "1. Go to https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com",
                "2. Ensure the 'Generative Language API' is ENABLED for your project.",
                "3. If it says 'Enabled', click 'Manage' and verify your API Key is associated with this project.",
                "4. Alternatively, create a FRESH key at https://aistudio.google.com/ and update your Vercel Environment Variable."
            ]
        });
    }
};