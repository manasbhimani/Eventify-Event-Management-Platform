/**
 * src/routes/bookings.routes.js
 *
 * Eventify — Bookings API routes with user ownership & authorization.
 *
 * Endpoints:
 *   GET  /api/bookings            — List bookings (caller's own bookings; ADMIN sees all).
 *   POST /api/bookings            — Create a new booking bound to authenticated user ID.
 *   POST /api/bookings/:id/cancel — Cancel booking (owner or ADMIN only).
 */

"use strict";

const express = require("express");
const store   = require("../data/store");
const { requireAuth, csrfProtection } = require("../middleware/auth.middleware");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/bookings
// Requires authentication.
// ATTENDEE/ORGANIZER: only see their own bookings.
// ADMIN: can view all bookings.
// ---------------------------------------------------------------------------
router.get("/", requireAuth, (req, res) => {
    const isUserAdmin = req.user.role === "ADMIN";
    const bookings = isUserAdmin
        ? store.getBookings()
        : store.getBookings({ userId: req.user.id });

    res.json({
        success: true,
        count: bookings.length,
        data: bookings
    });
});

// ---------------------------------------------------------------------------
// POST /api/bookings
// Requires authentication + CSRF protection.
// User ID is strictly taken from the authenticated session (never from req.body).
// ---------------------------------------------------------------------------
router.post("/", requireAuth, csrfProtection, (req, res) => {
    const { eventId, quantity } = req.body;

    const numEventId = Number(eventId);
    const numQty = Number(quantity);

    if (!eventId || isNaN(numEventId)) {
        return res.status(400).json({
            success: false,
            message: "A valid event ID is required."
        });
    }

    if (!quantity || isNaN(numQty) || numQty < 1 || numQty > 10) {
        return res.status(400).json({
            success: false,
            message: "Quantity must be a number between 1 and 10."
        });
    }

    const event = store.getEventById(numEventId);

    if (!event) {
        return res.status(404).json({
            success: false,
            message: "Event not found."
        });
    }

    // Bind booking to the authenticated user ID
    const newBooking = store.createBooking(event, numQty, req.user.id);

    res.status(201).json({
        success: true,
        message: "Booking confirmed successfully.",
        data: newBooking
    });
});

// ---------------------------------------------------------------------------
// POST /api/bookings/:id/cancel
// Requires authentication + CSRF protection.
// Owner-only check enforced server-side (ADMIN can cancel any booking).
// ---------------------------------------------------------------------------
router.post("/:id/cancel", requireAuth, csrfProtection, (req, res) => {
    const result = store.cancelBooking(req.params.id, req.user);

    if (result.error === "NOT_FOUND") {
        return res.status(404).json({
            success: false,
            message: "Booking not found."
        });
    }

    if (result.error === "FORBIDDEN") {
        return res.status(403).json({
            success: false,
            message: "You are not authorized to cancel this booking."
        });
    }

    res.json({
        success: true,
        message: `Booking ${req.params.id} cancelled successfully.`,
        data: result.booking
    });
});

module.exports = router;
