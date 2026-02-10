const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();

// Create a limiter that allows 100 requests per IP per 15 minutes
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    skip: (req) => {
        // Skip rate limiting for static assets (not HTML pages)
        return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)$/i.test(req.path);
    }
});

// Apply rate limiting before static files (HTML pages are rate-limited, assets are skipped)
app.use(limiter);

// Serve static files
app.use(express.static('public'));
app.use('/demo', express.static('demo'));

// Route for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
