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

        // --- RAW FETCH TEST (THE ULTIMATE DIAGNOSTIC) ---
        // If the SDK fails, we try a direct REST call to see exactly what Google says.
        const variations = [
            { model: "gemini-1.5-flash", version: "v1" },
            { model: "gemini-pro", version: "v1" }
        ];

        let lastError = null;
        let successfulModel = null;
        let responseText = null;

        for (const variant of variations) {
            try {
                // 1. Try with the official SDK first
                console.log(`Trying SDK for ${variant.model} on ${variant.version}...`);
                const model = genAI.getGenerativeModel({ model: variant.model }, { apiVersion: variant.version });
                const result = await model.generateContent({ contents });
                responseText = result.response.text();
                successfulModel = `SDK: ${variant.model} (${variant.version})`;
                break;
            } catch (sdkErr) {
                console.log(`SDK failed for ${variant.model}: ${sdkErr.message}`);

                // 2. Try HARD FALLBACK with Raw Fetch (REST API)
                // This bypasses the library entirely.
                try {
                    console.log(`Trying RAW FETCH for ${variant.model}...`);
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
                        console.log(`Raw fetch failed for ${variant.model}: ${rawResponse.status} ${JSON.stringify(rawData)}`);
                        lastError = new Error(`Both SDK and Raw Fetch failed. Status: ${rawResponse.status}`);
                    }
                } catch (fetchErr) {
                    console.log(`Fetch logic error for ${variant.model}: ${fetchErr.message}`);
                    lastError = fetchErr;
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
            error: "Gemini API Error - SDK & Fetch Failed",
            message: errorMessage,
            diagnostics: {
                key_info: `Prefix: ${API_KEY.substring(0, 4)}, Suffix: ${API_KEY.substring(API_KEY.length - 4)}, Length: ${API_KEY.length}`,
                node_env: process.env.NODE_ENV,
                is_404: errorMessage.includes("404")
            },
            remediation: "If you see a 404, please tell me which COUNTRY you are in. Also, ensure 'Generative Language API' is ENABLED in Google Cloud/AI Studio for this specific key."
        });
    }
};