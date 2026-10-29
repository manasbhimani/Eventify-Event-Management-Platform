/**
 * src/routes/admin.routes.js
 *
 * Eventify — Admin API routes.
 *
 * Endpoints:
 *   GET /api/admin/stats — Platform-wide statistics (ADMIN role required).
 */

"use strict";

const express = require("express");
const store   = require("../data/store");
const { requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// Requires ADMIN role. Unauthenticated returns 401; non-ADMIN returns 403.
// ---------------------------------------------------------------------------
router.get("/stats", requireRole("ADMIN"), (req, res) => {
    res.json({
        success: true,
        stats: store.getAdminStats()
    });
});

module.exports = router;
