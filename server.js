const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();

// Create a limiter that allows 100 requests per IP per 15 minutes
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply rate limiting to all routes
app.use(limiter);

// Serve static files from the public directory
app.use(express.static('public'));

// Serve files from the demo directory
app.use('/demo', express.static('demo'));

// Route for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
