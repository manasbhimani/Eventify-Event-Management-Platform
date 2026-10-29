/**
 * src/middleware/auth.middleware.js
 *
 * Eventify — Authentication, Authorization & CSRF Middleware.
 *
 * Provides:
 *   1. parseCookies & cookieParserMiddleware: Zero-dependency RFC 6265 cookie parser.
 *   2. sessionMiddleware: Authenticates requests using in-memory session tokens,
 *      issues guest CSRF tokens, and clears stale/expired session cookies.
 *   3. requireAuth: Guards routes requiring an authenticated user (401).
 *   4. requireRole: Guards routes requiring specific roles (403).
 *   5. csrfProtection: Two-layer defense against CSRF:
 *      - Strict same-origin / referer verification against host.
 *      - Cryptographic token verification: session-bound for authenticated users;
 *        double-submit token for unauthenticated operations (e.g. login, register).
 */

"use strict";

const crypto = require("crypto");
const store  = require("../data/store");

const isProduction = process.env.NODE_ENV === "production";

const SESSION_COOKIE_NAME = "eventify_session";
const CSRF_COOKIE_NAME    = "eventify_csrf";

const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
};

const CSRF_COOKIE_OPTIONS = {
    httpOnly: false,            // Intentionally readable by client JS for X-CSRF-Token header
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
};

/**
 * Minimal, robust cookie parser for incoming Cookie headers (RFC 6265).
 * Safely handles punctuation, malformed URI encodings, and empty pairs.
 */
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader || typeof cookieHeader !== "string") {
        return cookies;
    }

    const pairs = cookieHeader.split(";");
    for (const pair of pairs) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx === -1) continue;

        const key = pair.slice(0, eqIdx).trim();
        const val = pair.slice(eqIdx + 1).trim();

        if (key) {
            try {
                cookies[key] = decodeURIComponent(val);
            } catch {
                cookies[key] = val;
            }
        }
    }
    return cookies;
}

/**
 * Express middleware to parse cookies and attach them to req.cookies.
 */
function cookieParserMiddleware(req, res, next) {
    req.cookies = parseCookies(req.headers.cookie);
    next();
}

/**
 * Session verification and guest CSRF provisioning middleware.
 * - Attaches req.session and req.user if an active session cookie is present.
 * - Automatically issues a guest CSRF token cookie if no CSRF cookie exists.
 * - Evicts and clears stale or expired session cookies.
 */
function sessionMiddleware(req, res, next) {
    // 1. Ensure a CSRF token cookie is present for all visitors (authenticated or guest)
    if (!req.cookies || !req.cookies[CSRF_COOKIE_NAME] || req.cookies[CSRF_COOKIE_NAME].trim() === "") {
        const guestCsrfToken = crypto.randomBytes(32).toString("hex");
        res.cookie(CSRF_COOKIE_NAME, guestCsrfToken, CSRF_COOKIE_OPTIONS);
        if (!req.cookies) req.cookies = {};
        req.cookies[CSRF_COOKIE_NAME] = guestCsrfToken;
    }

    // 2. Validate session cookie if provided
    const sessionId = req.cookies && req.cookies[SESSION_COOKIE_NAME];

    if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "" || sessionId === "undefined" || sessionId === "null") {
        req.session = null;
        req.user = null;
        return next();
    }

    const session = store.getSession(sessionId);

    if (!session) {
        req.session = null;
        req.user = null;

        // Clear expired or invalid session cookie from client
        res.clearCookie(SESSION_COOKIE_NAME, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction
        });
        return next();
    }

    req.session = session;
    req.user = {
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role
    };

    next();
}

/**
 * Guard middleware: Rejects unauthenticated requests with 401 Unauthorized.
 */
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in."
        });
    }
    next();
}

/**
 * Guard middleware: Checks if authenticated user has one of the allowed roles.
 * Returns 401 if unauthenticated, 403 if role is insufficient.
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please log in."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Requires one of: ${allowedRoles.join(", ")}.`
            });
        }

        next();
    };
}

/**
 * Verify that state-changing requests originate from the same host.
 * Checks Origin and Referer headers against the Host header.
 */
function verifySameOrigin(req) {
    const host = req.headers.host;
    if (!host) return false;

    const origin = req.headers.origin;
    if (origin) {
        try {
            const originUrl = new URL(origin);
            return originUrl.host === host;
        } catch {
            return false;
        }
    }

    const referer = req.headers.referer;
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            return refererUrl.host === host;
        } catch {
            return false;
        }
    }

    // Direct / non-browser requests without Origin or Referer are permitted
    // provided they carry the expected custom CSRF token
    return true;
}

/**
 * CSRF Protection Middleware.
 * Defends against cross-origin request forgery across BOTH authenticated
 * and unauthenticated state-changing endpoints (including login & register).
 *
 * 1. Validates same-origin / referer against host.
 * 2. If authenticated: strictly validates against session.csrfToken.
 * 3. If unauthenticated: validates client X-CSRF-Token against eventify_csrf cookie.
 */
function csrfProtection(req, res, next) {
    const stateChangingMethods = ["POST", "PUT", "PATCH", "DELETE"];

    if (!stateChangingMethods.includes(req.method)) {
        return next();
    }

    // Step 1: Reject foreign cross-origin submissions
    if (!verifySameOrigin(req)) {
        return res.status(403).json({
            success: false,
            message: "Cross-origin request rejected."
        });
    }

    // Step 2: Validate CSRF Token
    const clientToken = req.headers["x-csrf-token"] || (req.body && req.body._csrf);

    if (!clientToken || typeof clientToken !== "string") {
        return res.status(403).json({
            success: false,
            message: "Invalid or missing CSRF token."
        });
    }

    let expectedToken = null;

    if (req.session && req.session.csrfToken) {
        // Authenticated: strictly session-bound token
        expectedToken = req.session.csrfToken;
    } else if (req.cookies && req.cookies[CSRF_COOKIE_NAME]) {
        // Unauthenticated (Login / Registration): double-submit cookie token
        expectedToken = req.cookies[CSRF_COOKIE_NAME];
    } else {
        return res.status(403).json({
            success: false,
            message: "CSRF cookie not found. Please refresh the page."
        });
    }

    // Constant-time comparison to prevent timing side-channel attacks
    const clientBuf = Buffer.from(clientToken);
    const expectedBuf = Buffer.from(expectedToken);

    if (clientBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(clientBuf, expectedBuf)) {
        return res.status(403).json({
            success: false,
            message: "Invalid or missing CSRF token."
        });
    }

    next();
}

module.exports = {
    SESSION_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_OPTIONS,
    CSRF_COOKIE_OPTIONS,
    parseCookies,
    cookieParserMiddleware,
    sessionMiddleware,
    requireAuth,
    requireRole,
    verifySameOrigin,
    csrfProtection
};
