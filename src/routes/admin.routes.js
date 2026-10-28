/**
 * src/routes/admin.routes.js
 *
 * GET /api/admin/stats — Platform-wide statistics for the admin dashboard.
 *
 * ⚠ SECURITY WARNING
 * ------------------
 * This endpoint has NO authentication or role check.
 * Any visitor can read platform statistics.
 * Role-based protection is planned for Phase 5.
 */

"use strict";

const express = require("express");
const store   = require("../data/store");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------
router.get("/stats", (req, res) => {
    res.json({
        success: true,
        stats: store.getAdminStats()
    });
});

module.exports = router;
