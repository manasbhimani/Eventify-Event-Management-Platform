/**
 * src/middleware/error.middleware.js
 *
 * Eventify — Centralized Express error and fallback handlers.
 *
 * WHY SEPARATE ERROR HANDLING?
 * ----------------------------
 * Without this, any unhandled error in a route handler crashes the request
 * silently or produces a default Express HTML error page. By registering a
 * single 4-argument middleware at the END of the app, we intercept all errors
 * that routes pass via next(err) and return consistent JSON responses instead.
 *
 * HOW IT WORKS
 * ------------
 * Express recognises error-handling middleware by its 4 parameters:
 *   (err, req, res, next)
 * Register it AFTER all normal routes so it only fires when something has
 * gone wrong.
 */

"use strict";

/**
 * notFoundApiHandler
 *
 * Catches requests to unknown /api/* paths.
 * Must be registered AFTER all valid API routes and BEFORE the SPA fallback.
 */
function notFoundApiHandler(req, res) {
    res.status(404).json({
        success: false,
        message: `API endpoint '${req.originalUrl}' not found.`
    });
}

/**
 * globalErrorHandler
 *
 * Catches errors forwarded by next(err) from any route or middleware.
 * Returns a safe JSON error response without leaking stack traces to clients.
 */
function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    // Log the full error on the server so developers can debug it
    console.error("[Error]", err.message || err);

    const statusCode = (err.statusCode && Number.isInteger(err.statusCode))
        ? err.statusCode
        : 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || "An unexpected server error occurred."
    });
}

module.exports = { notFoundApiHandler, globalErrorHandler };
