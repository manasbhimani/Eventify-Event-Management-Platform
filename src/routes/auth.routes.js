/**
 * src/routes/auth.routes.js
 *
 * Eventify — Authentication API routes.
 *
 * Endpoints:
 *   POST /api/auth/register — Public account registration (ATTENDEE only).
 *   POST /api/auth/login    — Session-based authentication with bcrypt verification.
 *   POST /api/auth/logout   — Session invalidation & cookie clearance.
 *   GET  /api/auth/me       — Current authenticated user identity.
 *   GET  /api/auth/csrf     — Active session CSRF token lookup.
 */

"use strict";

const express = require("express");
const bcrypt  = require("bcryptjs");
const store   = require("../data/store");
const {
    SESSION_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_OPTIONS,
    CSRF_COOKIE_OPTIONS,
    csrfProtection
} = require("../middleware/auth.middleware");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_SALT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post("/register", csrfProtection, async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        if (!name || typeof name !== "string" || name.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: "Full name must be at least 2 characters long."
            });
        }

        if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
            return res.status(400).json({
                success: false,
                message: "A valid email address is required."
            });
        }

        if (!password || typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (store.getUserByEmail(normalizedEmail)) {
            return res.status(409).json({
                success: false,
                message: "An account with this email address already exists."
            });
        }

        // ROLE POLICY: Public registration strictly assigns ATTENDEE.
        // Client-supplied roles (e.g., ORGANIZER or ADMIN) are intentionally ignored.
        // Trusted roles must be seeded or provisioned via administrator channels.
        const role = "ATTENDEE";

        const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        const newUser = store.createUser({
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
            role
        });

        // Regenerate session for newly registered user
        if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
            store.deleteSession(req.cookies[SESSION_COOKIE_NAME]);
        }
        const session = store.createSession(newUser);

        res.cookie(SESSION_COOKIE_NAME, session.sessionId, SESSION_COOKIE_OPTIONS);
        res.cookie(CSRF_COOKIE_NAME, session.csrfToken, CSRF_COOKIE_OPTIONS);

        res.status(201).json({
            success: true,
            message: "Account created successfully.",
            user: newUser,
            csrfToken: session.csrfToken
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/login", csrfProtection, async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password || typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = store.getUserByEmail(normalizedEmail);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        // Session regeneration on login: delete old session if exists
        if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
            store.deleteSession(req.cookies[SESSION_COOKIE_NAME]);
        }

        const session = store.createSession(user);

        res.cookie(SESSION_COOKIE_NAME, session.sessionId, SESSION_COOKIE_OPTIONS);
        res.cookie(CSRF_COOKIE_NAME, session.csrfToken, CSRF_COOKIE_OPTIONS);

        res.json({
            success: true,
            message: "Login successful.",
            user: store.sanitizeUser(user),
            csrfToken: session.csrfToken
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post("/logout", csrfProtection, (req, res) => {
    const sessionId = req.cookies && req.cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
        store.deleteSession(sessionId);
    }

    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie(SESSION_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction
    });
    res.clearCookie(CSRF_COOKIE_NAME, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        secure: isProduction
    });

    res.json({
        success: true,
        message: "Logged out successfully."
    });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get("/me", (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Not authenticated."
        });
    }

    res.json({
        success: true,
        user: req.user,
        csrfToken: req.session ? req.session.csrfToken : null
    });
});

// ---------------------------------------------------------------------------
// GET /api/auth/csrf
// ---------------------------------------------------------------------------
router.get("/csrf", (req, res) => {
    const csrfToken = (req.session && req.session.csrfToken)
        ? req.session.csrfToken
        : (req.cookies && req.cookies[CSRF_COOKIE_NAME]);

    res.json({
        success: true,
        csrfToken: csrfToken || null
    });
});

module.exports = router;
