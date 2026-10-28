/**
 * src/routes/categories.routes.js
 *
 * GET /api/categories  — Return all event categories.
 */

"use strict";

const express = require("express");
const store   = require("../data/store");

const router = express.Router();

router.get("/", (req, res) => {
    res.json({
        success: true,
        data: store.getCategories()
    });
});

module.exports = router;
