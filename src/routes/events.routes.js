/**
 * src/routes/events.routes.js
 *
 * Eventify — Events API routes.
 *
 * Endpoints:
 *   GET  /api/events     — List events with optional category/search filters (public).
 *   GET  /api/events/:id — Get details of a single event by ID (public).
 *   POST /api/events     — Create a new event (ORGANIZER or ADMIN role required).
 */

"use strict";

const express = require("express");
const store   = require("../data/store");
const { requireRole, csrfProtection } = require("../middleware/auth.middleware");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/events
// Query params: category (string), search (string) — Public
// ---------------------------------------------------------------------------
router.get("/", (req, res) => {
    const { category, search } = req.query;
    const results = store.getEvents({ category, search });

    res.json({
        success: true,
        count: results.length,
        data: results
    });
});

// ---------------------------------------------------------------------------
// GET /api/events/:id
// Public
// ---------------------------------------------------------------------------
router.get("/:id", (req, res) => {
    const eventId = parseInt(req.params.id, 10);

    // Guard: reject non-numeric IDs early
    if (isNaN(eventId)) {
        return res.status(400).json({
            success: false,
            message: "Event ID must be a number."
        });
    }

    const event = store.getEventById(eventId);

    if (!event) {
        return res.status(404).json({
            success: false,
            message: `Event with ID ${req.params.id} not found.`
        });
    }

    res.json({
        success: true,
        data: event
    });
});

// ---------------------------------------------------------------------------
// POST /api/events
// Required body fields: title, category, date
// Protected: ORGANIZER or ADMIN role required + CSRF protection.
// ---------------------------------------------------------------------------
router.post("/", requireRole("ORGANIZER", "ADMIN"), csrfProtection, (req, res) => {
    const { title, category, date, city, venue, price, capacity, description } = req.body;

    if (!title || !category || !date) {
        return res.status(400).json({
            success: false,
            message: "Title, category, and date are required fields."
        });
    }

    const newEvent = store.createEvent({
        title,
        category,
        date,
        city,
        venue,
        price,
        capacity,
        description,
        creatorId: req.user.id
    });

    res.status(201).json({
        success: true,
        message: "Event created successfully.",
        data: newEvent
    });
});

module.exports = router;
