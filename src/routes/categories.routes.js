/**
 * src/routes/categories.routes.js
 *
 * Eventify — Category API routes backed by Oracle Database.
 *
 * Endpoints:
 *   GET /api/categories     — Return all event categories.
 *   GET /api/categories/:id — Return single event category by numeric ID.
 */

"use strict";

const express = require("express");
const { categoryRepository } = require("../db/repositories");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/categories
// ---------------------------------------------------------------------------
router.get("/", async (req, res, next) => {
    try {
        const categories = await categoryRepository.getCategories();
        res.json({
            success: true,
            data: categories
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// GET /api/categories/:id
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res, next) => {
    try {
        const catId = Number(req.params.id);
        if (isNaN(catId)) {
            return res.status(400).json({
                success: false,
                message: "Category ID must be a number."
            });
        }

        const category = await categoryRepository.getCategoryById(catId);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: `Category with ID ${req.params.id} not found.`
            });
        }

        res.json({
            success: true,
            data: category
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
