/**
 * src/routes/bookings.routes.js
 *
 * GET  /api/bookings            — List all bookings.
 * POST /api/bookings            — Create a new booking.
 * POST /api/bookings/:id/cancel — Cancel an existing booking.
 *
 * ⚠ LIMITATIONS (intentional in this phase)
 * ------------------------------------------
 * - No authentication check: anyone can book or cancel.
 * - No capacity enforcement: overbooking is possible.
 * - Booking IDs are random 4-digit numbers — collision is unlikely but
 *   possible with many bookings.
 *
 * These will be addressed in Phase 5 (Authentication & Authorization).
 */

"use strict";

const express = require("express");
const store   = require("../data/store");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/bookings
// ---------------------------------------------------------------------------
router.get("/", (req, res) => {
    const bookings = store.getBookings();
    res.json({
        success: true,
        count: bookings.length,
        data: bookings
    });
});

// ---------------------------------------------------------------------------
// POST /api/bookings
// Required body fields: eventId, quantity
// ---------------------------------------------------------------------------
router.post("/", (req, res) => {
    const { eventId, quantity } = req.body;

    const event = store.getEventById(Number(eventId));

    if (!event) {
        return res.status(404).json({
            success: false,
            message: "Event not found."
        });
    }

    const newBooking = store.createBooking(event, quantity);

    res.status(201).json({
        success: true,
        message: "Booking confirmed successfully.",
        data: newBooking
    });
});

// ---------------------------------------------------------------------------
// POST /api/bookings/:id/cancel
// ---------------------------------------------------------------------------
router.post("/:id/cancel", (req, res) => {
    const cancelled = store.cancelBooking(req.params.id);

    if (!cancelled) {
        return res.status(404).json({
            success: false,
            message: "Booking not found."
        });
    }

    res.json({
        success: true,
        message: `Booking ${req.params.id} cancelled successfully.`,
        data: cancelled
    });
});

module.exports = router;
