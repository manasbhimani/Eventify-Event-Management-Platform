/**
 * src/routes/events.routes.js
 *
 * GET  /api/events          — List events with optional filtering.
 * GET  /api/events/:id      — Get one event by ID.
 * POST /api/events          — Create a new event (demo — no auth required yet).
 */

"use strict";

const express = require("express");
const store   = require("../data/store");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/events
// Query params: category (string), search (string)
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
// ---------------------------------------------------------------------------
router.post("/", (req, res) => {
    const { title, category, date, city, venue, price, capacity, description } = req.body;

    if (!title || !category || !date) {
        return res.status(400).json({
            success: false,
            message: "Title, category, and date are required fields."
        });
    }

    const newEvent = store.createEvent({ title, category, date, city, venue, price, capacity, description });

    res.status(201).json({
        success: true,
        message: "Event created successfully.",
        data: newEvent
    });
});

module.exports = router;
