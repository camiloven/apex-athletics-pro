// /api/predictions — Shared predictions backend
// GET: Returns predictions from the shared data file

const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Try to read from the data file
        const dataPath = path.join(process.cwd(), 'data', 'predictions.json');
        
        if (fs.existsSync(dataPath)) {
            const raw = fs.readFileSync(dataPath, 'utf8');
            const data = JSON.parse(raw);
            return res.status(200).json(data);
        }

        // Fallback: return empty
        return res.status(200).json({ sports: {}, updatedAt: null });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load predictions', details: err.message });
    }
};
