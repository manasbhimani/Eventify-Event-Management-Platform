/**
 * src/routes/health.routes.js
 *
 * GET /api/health  — Server and database status check.
 */

"use strict";

const express = require("express");

const router = express.Router();

// getIsConnected is passed in from server.js so this route stays decoupled
// from db.js, yet can still report the live Oracle pool status.
module.exports = function (getIsConnected) {
    router.get("/", (req, res) => {
        res.json({
            status: "OK",
            app: "Eventify Event Management Platform",
            database: getIsConnected()
                ? "CONNECTED (Oracle DB)"
                : "DISCONNECTED / STANDALONE",
            timestamp: new Date().toISOString()
        });
    });

    return router;
};
