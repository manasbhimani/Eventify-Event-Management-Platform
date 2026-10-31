/**
 * src/routes/notifications.routes.js
 *
 * Eventify — Notifications API routes.
 *
 * Endpoints:
 *   GET  /api/notifications            — Retrieve current user's notifications (requireAuth).
 *   POST /api/notifications/:id/dismiss — Dismiss a notification (requireAuth + CSRF).
 */

"use strict";

const express = require("express");
const { notificationRepository } = require("../db/repositories");
const { requireAuth, csrfProtection } = require("../middleware/auth.middleware");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/notifications
// Protected: requireAuth.
// Returns only the authenticated user's notifications.
// ---------------------------------------------------------------------------
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const { status } = req.query;
        const notifications = await notificationRepository.getUserNotifications(req.user.id, { status });

        res.json({
            success: true,
            count: notifications.length,
            data: notifications
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/notifications/:id/dismiss
// Protected: requireAuth + csrfProtection.
// Dismisses a notification belonging to the authenticated user.
// ---------------------------------------------------------------------------
router.post("/:id/dismiss", requireAuth, csrfProtection, async (req, res, next) => {
    try {
        const notifId = parseInt(req.params.id, 10);
        if (isNaN(notifId)) {
            return res.status(400).json({
                success: false,
                code: "INVALID_NOTIFICATION_ID",
                message: "Notification ID must be a number."
            });
        }

        const result = await notificationRepository.dismissNotification(notifId, req.user.id);

        if (result.error === "NOT_FOUND") {
            return res.status(404).json({
                success: false,
                code: "NOTIFICATION_NOT_FOUND",
                message: "Notification not found."
            });
        }

        res.json({
            success: true,
            message: "Notification dismissed successfully.",
            data: result.notification
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
