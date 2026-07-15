'use strict';

// Vercel serverless entry point. vercel.json rewrites all /api/* requests
// here; an Express app is a valid (req, res) handler.
module.exports = require('../app');
