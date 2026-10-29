/**
 * src/data/store.js
 *
 * Eventify — Centralized in-memory data store.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Gathers all mutable in-memory data (events, categories, bookings, users,
 * and active sessions) into a single module with exported accessor functions.
 *
 * PERSISTENCE WARNING
 * -------------------
 * All data lives in JavaScript process memory. When the Node.js server process
 * restarts, all user registrations, newly created bookings, and active sessions
 * reset to initial seed state. In-memory sessions are NOT persistent.
 * Persistent storage is planned for Phase 8 (Oracle Database).
 */

"use strict";

const crypto = require("crypto");
const { seedEvents, seedCategories, seedBookings, seedUsers } = require("./mock-data");

// ---------------------------------------------------------------------------
// Working copies in memory
//
// SEED ACCOUNT SAFETY:
// When NODE_ENV === "production", development seed accounts and seed bookings
// are UNCONDITIONALLY disabled. No override or bypass flag is permitted in production.
// Staging or automated test suites that require seed data must run under a
// separate, explicit non-production configuration (e.g. NODE_ENV="test" or "development").
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === "production";

let events     = seedEvents.map(e => ({ ...e }));
let categories = seedCategories.map(c => ({ ...c }));
let users      = isProduction ? [] : seedUsers.map(u => ({ ...u }));
let bookings   = isProduction ? [] : seedBookings.map(b => ({ ...b }));

// In-memory active sessions Map: sessionId -> sessionData
const sessions = new Map();

// Session TTL: 2 hours in milliseconds
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// Unique ID counters
let nextEventId = Math.max(...events.map(e => e.id), 0) + 1;
let nextUserId  = Math.max(...users.map(u => u.id), 0) + 1;

// ===========================================================================
// USERS & IDENTITY
// ===========================================================================

/**
 * Return a sanitized user object without the password hash.
 */
function sanitizeUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
    };
}

/**
 * Find user by email (case-insensitive).
 * Returns the full user record (including passwordHash) for auth checks.
 */
function getUserByEmail(email) {
    if (!email || typeof email !== "string") return undefined;
    const normalized = email.trim().toLowerCase();
    return users.find(u => u.email.toLowerCase() === normalized);
}

/**
 * Find user by numeric ID.
 */
function getUserById(id) {
    const numId = Number(id);
    return users.find(u => u.id === numId);
}

/**
 * Create a new user account.
 * Note: Role is strictly controlled by callers (default: ATTENDEE).
 */
function createUser({ name, email, passwordHash, role = "ATTENDEE" }) {
    const normalizedEmail = email.trim().toLowerCase();

    if (getUserByEmail(normalizedEmail)) {
        throw new Error("An account with this email address already exists.");
    }

    const newUser = {
        id: nextUserId++,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    return sanitizeUser(newUser);
}

// ===========================================================================
// SESSIONS & CSRF
// ===========================================================================

/**
 * Create a fresh cryptographically secure session.
 * Regenerates session ID and CSRF token.
 */
function createSession(user) {
    const sessionId = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    const sessionData = {
        sessionId,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        csrfToken,
        createdAt: now,
        expiresAt
    };

    sessions.set(sessionId, sessionData);
    return sessionData;
}

/**
 * Retrieve a valid, unexpired session by session ID.
 * Automatically evicts expired sessions.
 */
function getSession(sessionId) {
    if (!sessionId || !sessions.has(sessionId)) return null;

    const session = sessions.get(sessionId);
    if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId);
        return null;
    }

    return session;
}

/**
 * Invalidate a single session by session ID (logout).
 */
function deleteSession(sessionId) {
    if (!sessionId) return false;
    return sessions.delete(sessionId);
}

/**
 * Invalidate all active sessions for a user (e.g. password change / admin revoke).
 */
function deleteSessionsByUserId(userId) {
    const numId = Number(userId);
    let count = 0;
    for (const [sId, session] of sessions.entries()) {
        if (session.userId === numId) {
            sessions.delete(sId);
            count++;
        }
    }
    return count;
}

// ===========================================================================
// EVENTS
// ===========================================================================

/** Return all events, optionally filtered by category and/or search text. */
function getEvents({ category, search } = {}) {
    let results = [...events];

    if (category && category !== "All") {
        results = results.filter(
            e => e.category.toLowerCase() === category.toLowerCase()
        );
    }

    if (search) {
        const q = search.toLowerCase();
        results = results.filter(
            e =>
                e.title.toLowerCase().includes(q) ||
                e.category.toLowerCase().includes(q) ||
                e.city.toLowerCase().includes(q) ||
                e.venue.toLowerCase().includes(q)
        );
    }

    return results;
}

/** Return a single event by numeric ID, or undefined if not found. */
function getEventById(id) {
    return events.find(e => e.id === Number(id));
}

/** Add a new event and return the created record. */
function createEvent({ title, category, date, city, venue, price, capacity, description, creatorId }) {
    const newEvent = {
        id: nextEventId++,
        creatorId: creatorId ? Number(creatorId) : null,
        title,
        category,
        date,
        city: city || "Surat",
        venue: venue || "Main Auditorium",
        price: Number(price) || 0,
        capacity: Number(capacity) || 100,
        description: description || "",
        image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    };

    events.push(newEvent);
    return newEvent;
}

// ===========================================================================
// CATEGORIES
// ===========================================================================

/** Return all categories. */
function getCategories() {
    return [...categories];
}

// ===========================================================================
// BOOKINGS (User Ownership & Server-Side Authorization)
// ===========================================================================

/**
 * Return bookings.
 * If filter.userId is provided, returns ONLY bookings for that user.
 */
function getBookings({ userId } = {}) {
    if (userId !== undefined && userId !== null) {
        const numId = Number(userId);
        return bookings.filter(b => b.userId === numId);
    }
    return [...bookings];
}

/**
 * Return a single booking by ID.
 */
function getBookingById(id) {
    return bookings.find(b => b.id === id);
}

/**
 * Add a new booking bound to the authenticated user ID.
 */
function createBooking(event, quantity, userId) {
    const qty = Number(quantity) || 1;
    const newBooking = {
        id: `EVT-${Math.floor(1000 + Math.random() * 9000)}`,
        userId: Number(userId),
        eventId: event.id,
        title: event.title,
        date: event.date + "T10:00:00",
        venue: `${event.venue}, ${event.city}`,
        quantity: qty,
        amount: event.price * qty,
        status: "CONFIRMED",
        icon: "🎟️"
    };

    bookings.push(newBooking);
    return newBooking;
}

/**
 * Cancel a booking by ID with ownership enforcement.
 * - ADMIN role can cancel any booking.
 * - Non-admin users can ONLY cancel their own bookings.
 */
function cancelBooking(id, requestingUser) {
    const booking = bookings.find(b => b.id === id);
    if (!booking) {
        return { error: "NOT_FOUND" };
    }

    if (requestingUser.role !== "ADMIN" && booking.userId !== requestingUser.id) {
        return { error: "FORBIDDEN" };
    }

    booking.status = "CANCELLED";
    return { success: true, booking };
}

// ===========================================================================
// ADMIN / STATS
// ===========================================================================

/** Return platform-wide statistics calculated from live store data. */
function getAdminStats() {
    const revenue = bookings.reduce(
        (sum, b) => sum + (b.status !== "CANCELLED" ? b.amount : 0),
        0
    );

    return {
        totalUsers: users.length,
        totalEvents: events.length,
        totalBookings: bookings.length,
        revenue
    };
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
    // Users & Identity
    sanitizeUser,
    getUserByEmail,
    getUserById,
    createUser,

    // Sessions & CSRF
    createSession,
    getSession,
    deleteSession,
    deleteSessionsByUserId,

    // Events
    getEvents,
    getEventById,
    createEvent,

    // Categories
    getCategories,

    // Bookings
    getBookings,
    getBookingById,
    createBooking,
    cancelBooking,

    // Admin
    getAdminStats
};
