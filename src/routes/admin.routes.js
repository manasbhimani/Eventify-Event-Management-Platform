/**
 * src/routes/admin.routes.js
 *
 * Eventify — Admin API routes backed by Oracle Database.
 *
 * Endpoints:
 *   GET /api/admin/stats — Platform-wide statistics (ADMIN role required).
 */

"use strict";

const express = require("express");
const { adminRepository } = require("../db/repositories");
const { requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// Requires ADMIN role. Unauthenticated returns 401; non-ADMIN returns 403.
// ---------------------------------------------------------------------------
router.get("/stats", requireRole("ADMIN"), async (req, res, next) => {
    try {
        const stats = await adminRepository.getAdminStats();
        res.json({
            success: true,
            stats
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
