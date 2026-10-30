/**
 * src/routes/events.routes.js
 *
 * Eventify — Events API routes backed by Oracle Database.
 *
 * Endpoints:
 *   GET  /api/events     — List events with optional category/search filters (public).
 *   GET  /api/events/:id — Get details of a single event by ID (public).
 *   POST /api/events     — Create a new event (ORGANIZER or ADMIN role required).
 */

"use strict";

const express = require("express");
const { eventRepository, categoryRepository } = require("../db/repositories");
const { requireRole, csrfProtection } = require("../middleware/auth.middleware");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/events
// Query params: category (string), search (string) — Public
// ---------------------------------------------------------------------------
router.get("/", async (req, res, next) => {
    try {
        const { category, search } = req.query;
        const results = await eventRepository.getEvents({ category, search });

        res.json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// GET /api/events/:id
// Public
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res, next) => {
    try {
        const eventId = parseInt(req.params.id, 10);

        // Guard: reject non-numeric IDs early
        if (isNaN(eventId)) {
            return res.status(400).json({
                success: false,
                message: "Event ID must be a number."
            });
        }

        const event = await eventRepository.getEventById(eventId);

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
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/events
// Required body fields: title, category (or categoryId), date
// Protected: ORGANIZER or ADMIN role required + CSRF protection.
// ---------------------------------------------------------------------------
router.post("/", requireRole("ORGANIZER", "ADMIN"), csrfProtection, async (req, res, next) => {
    try {
        const { title, category, categoryId, date, time, city, venue, price, capacity, description, image, imageUrl } = req.body;

        if (!title || typeof title !== "string" || title.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: "Event title must be at least 2 characters long."
            });
        }

        if (!category && !categoryId) {
            return res.status(400).json({
                success: false,
                message: "Title, category, and date are required fields."
            });
        }

        if (!date || typeof date !== "string") {
            return res.status(400).json({
                success: false,
                message: "Title, category, and date are required fields."
            });
        }

        const dateStr = date.trim().split("T")[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(Date.parse(dateStr))) {
            return res.status(400).json({
                success: false,
                message: "A valid event date in YYYY-MM-DD format is required."
            });
        }

        let validatedTime = null;
        if (time !== undefined && time !== null && typeof time === "string" && time.trim() !== "") {
            const timeTrim = time.trim();
            if (!/^\d{1,2}:\d{2}$/.test(timeTrim)) {
                return res.status(400).json({
                    success: false,
                    message: "Event time must be in HH:mm format (e.g. 18:30)."
                });
            }
            validatedTime = timeTrim;
        } else if (date.includes("T")) {
            const parts = date.trim().split("T");
            if (parts[1]) {
                const t = parts[1].slice(0, 5);
                if (/^\d{1,2}:\d{2}$/.test(t)) {
                    validatedTime = t;
                }
            }
        }

        const numPrice = Number(price);
        if (price !== undefined && price !== null && (isNaN(numPrice) || numPrice < 0)) {
            return res.status(400).json({
                success: false,
                message: "Event price must be a non-negative number."
            });
        }

        const numCapacity = Number(capacity);
        if (capacity !== undefined && capacity !== null && (isNaN(numCapacity) || numCapacity < 1)) {
            return res.status(400).json({
                success: false,
                message: "Event capacity must be a positive number greater than 0."
            });
        }

        // Validate category exists in Oracle
        let resolvedCategoryId = null;
        if (categoryId !== undefined && categoryId !== null) {
            const numCatId = Number(categoryId);
            if (isNaN(numCatId)) {
                return res.status(400).json({
                    success: false,
                    message: "Category ID must be a number."
                });
            }
            const existingCat = await categoryRepository.getCategoryById(numCatId);
            if (!existingCat) {
                return res.status(400).json({
                    success: false,
                    message: `Category with ID ${categoryId} does not exist.`
                });
            }
            resolvedCategoryId = existingCat.id;
        } else if (category && typeof category === "string") {
            const existingCat = await categoryRepository.getCategoryByName(category);
            if (!existingCat) {
                return res.status(400).json({
                    success: false,
                    message: `Category '${category}' does not exist.`
                });
            }
            resolvedCategoryId = existingCat.id;
        }

        // SECURITY: creatorId is strictly taken from the authenticated user session (never from req.body)
        const creatorId = req.user.id;

        const newEvent = await eventRepository.createEvent({
            title: title.trim(),
            categoryId: resolvedCategoryId,
            date: dateStr,
            time: validatedTime,
            city: (city && typeof city === "string") ? city.trim() : "Surat",
            venue: (venue && typeof venue === "string") ? venue.trim() : "Main Auditorium",
            price: !isNaN(numPrice) ? numPrice : 0,
            capacity: !isNaN(numCapacity) ? numCapacity : 100,
            description: (description && typeof description === "string") ? description.trim() : "",
            imageUrl: (imageUrl || image || eventRepository.DEFAULT_EVENT_IMAGE).trim(),
            creatorId,
            status: "PUBLISHED"
        });

        res.status(201).json({
            success: true,
            message: "Event created successfully.",
            data: newEvent
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
