// api/chat.js (Your Vercel Serverless Function)

// 1. Load environment variables (dotenv is handled by Vercel for env vars)
// We just need the key from the environment
const API_KEY = process.env.GEMINI_API_KEY;

// 2. Import the class for the SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 3. Initialize the AI client
if (!API_KEY) {
    // If the key is missing, return an error function immediately
    module.exports = (req, res) => res.status(500).send("Error: GEMINI_API_KEY is missing from Vercel Environment Variables.");
    return;
}

const genAI = new GoogleGenerativeAI(API_KEY);
const MODEL_NAME = "gemini-1.5-flash"; // Using the stable Flash model


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

        // Call the Gemini API
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent({
            contents: contents
        });
        const responseText = result.response.text();

        // Extract and send the response text
        res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini API Error details:", error);
        res.status(500).json({
            error: "Internal Server Error during Gemini communication",
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};