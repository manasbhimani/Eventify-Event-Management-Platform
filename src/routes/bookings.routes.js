/**
 * src/routes/bookings.routes.js
 *
 * Eventify — Bookings API routes backed by Oracle Database.
 *
 * Endpoints:
 *   GET  /api/bookings            — List bookings (caller's own bookings; ADMIN sees all).
 *   POST /api/bookings            — Create a new booking bound to authenticated user ID.
 *   POST /api/bookings/:id/cancel — Cancel booking (owner or ADMIN only).
 */

"use strict";

const express = require("express");
const { bookingRepository } = require("../db/repositories");
const { requireAuth, csrfProtection } = require("../middleware/auth.middleware");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/bookings
// Requires authentication.
// ATTENDEE/ORGANIZER: only see their own bookings.
// ADMIN: can view all bookings.
// ---------------------------------------------------------------------------
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const isUserAdmin = req.user.role === "ADMIN";
        const bookings = isUserAdmin
            ? await bookingRepository.getBookings()
            : await bookingRepository.getBookings({ userId: req.user.id });

        res.json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/bookings
// Requires authentication + CSRF protection.
// User ID is strictly taken from the authenticated session (never from req.body).
// ---------------------------------------------------------------------------
router.post("/", requireAuth, csrfProtection, async (req, res, next) => {
    try {
        const { eventId, quantity } = req.body;

        const numEventId = Number(eventId);
        if (!eventId || isNaN(numEventId) || !Number.isInteger(numEventId) || numEventId <= 0) {
            return res.status(400).json({
                success: false,
                message: "A valid event ID is required."
            });
        }

        const numQty = Number(quantity);
        if (!quantity || isNaN(numQty) || !Number.isInteger(numQty) || numQty < 1 || numQty > 10) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be a number between 1 and 10."
            });
        }

        // SECURITY: User ID is strictly taken from the authenticated session (never from req.body)
        const userId = req.user.id;

        const newBooking = await bookingRepository.createBookingAtomic({
            userId,
            eventId: numEventId,
            quantity: numQty
        });

        res.status(201).json({
            success: true,
            message: "Booking confirmed successfully.",
            data: newBooking
        });
    } catch (err) {
        if (err.code === "EVENT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Event not found."
            });
        }
        if (err.code === "INSUFFICIENT_CAPACITY" || err.code === "EVENT_NOT_PUBLISHED") {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/bookings/:id/cancel
// Requires authentication + CSRF protection.
// Owner-only check enforced server-side (ADMIN can cancel any booking).
// ---------------------------------------------------------------------------
router.post("/:id/cancel", requireAuth, csrfProtection, async (req, res, next) => {
    try {
        const result = await bookingRepository.cancelBookingAtomic(req.params.id, req.user);

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
    } catch (err) {
        next(err);
    }
});

module.exports = router;
