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

        // Call the Gemini API forcing version 'v1'
        const model = genAI.getGenerativeModel({ model: MODEL_NAME }, { apiVersion: 'v1' });

        // Use the simplest possible call format
        const result = await model.generateContent({ contents });
        const responseText = result.response.text();

        // Extract and send the response text
        res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini API Error details:", error);

        // Try to list available models to see what this key actually has access to
        let availableModels = [];
        try {
            const list = await genAI.listModels();
            availableModels = list.models ? list.models.map(m => m.name) : ["No models found in list"];
        } catch (listError) {
            availableModels = [`Failed to list models: ${listError.message}`];
        }

        const statusCode = error.status || 500;
        const errorMessage = error.message || "Unknown error";

        res.status(statusCode).json({
            error: "Gemini API Error",
            message: errorMessage,
            diagnostics: {
                model_queried: MODEL_NAME,
                version_tried: "v1",
                key_info: `Prefix: ${API_KEY.substring(0, 4)}..., Length: ${API_KEY.length}`,
                available_models: availableModels
            },
            instruction: "If your available_models list is empty or fails, your API Key is likely not configured for the 'Generative Language API'. Go to AI Studio and create a NEW key."
        });
    }
};