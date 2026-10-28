/**
 * src/routes/auth.routes.js
 *
 * POST /api/auth/register  — Demo registration (no real persistence).
 * POST /api/auth/login     — Demo login (no password verification).
 * GET  /api/auth/me        — Returns a hardcoded demo user.
 *
 * ⚠ SECURITY WARNING
 * ------------------
 * These endpoints are DEMONSTRATION PLACEHOLDERS ONLY.
 * - Passwords are NOT stored or checked.
 * - The token returned ("demo-session-token") is a plain string, NOT a
 *   cryptographically signed JWT.
 * - Role assignment is based on the email string, NOT a database lookup.
 * - No session, cookie, or real authentication exists yet.
 *
 * Real authentication using bcrypt + JWT is planned for Phase 5.
 * Do NOT use this in production.
 */

"use strict";

const express = require("express");

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post("/register", (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "Name, email, and password are required."
        });
    }

    // DEMO ONLY: no real user is stored
    res.status(201).json({
        success: true,
        message: "User registered successfully.",
        data: {
            id: 101,
            name,
            email,
            role: role || "ATTENDEE"
        }
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required."
        });
    }

    // DEMO ONLY: role is inferred from email — NOT a security mechanism
    const role = email.includes("admin")
        ? "ADMIN"
        : email.includes("org")
            ? "ORGANIZER"
            : "ATTENDEE";

    res.json({
        success: true,
        message: "Login successful.",
        token: "demo-session-token",  // NOT a real JWT — demo only
        user: {
            id: 1,
            name: "Demo User",
            email,
            role
        }
    });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get("/me", (req, res) => {
    // DEMO ONLY: always returns the same hardcoded user
    res.json({
        success: true,
        user: {
            id: 1,
            name: "Demo User",
            email: "user@eventify.local",
            role: "ATTENDEE"
        }
    });
});

module.exports = router;
