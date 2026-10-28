/**
 * src/data/store.js
 *
 * Eventify — Centralized in-memory data store.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * In the original server.js, mock arrays (mockEvents, mockCategories,
 * mockBookings) were declared as plain variables inside the same file as
 * the routes.  That worked, but it meant:
 *   - Every route shared the SAME reference to those arrays (fine)
 *   - But as the file grew, it was hard to see what data existed and
 *     what the routes were doing to it.
 *
 * This store module gathers all mutable data into one place and exports
 * simple accessor functions. Route modules import the store and call
 * these functions instead of touching the arrays directly. Because Node.js
 * caches module exports, every file that imports this store gets the SAME
 * object in memory — changes made in one route are immediately visible in
 * all other routes.
 *
 * PERSISTENCE WARNING
 * -------------------
 * All data lives in JavaScript variables. When the server process stops,
 * everything is lost. The next `npm start` resets to the seed data.
 * This is intentional during development. Oracle Database integration is
 * a separate, later phase.
 *
 * NEXT STEP (Phase 8 - Oracle)
 * ----------------------------
 * When the database is ready, each function here can be replaced with a
 * SQL query. Route controllers will not need to change.
 */

"use strict";

const { seedEvents, seedCategories, seedBookings } = require("./mock-data");

// ---------------------------------------------------------------------------
// Working copies — these are mutable during the server session.
// We use spread copies so the seed arrays in mock-data.js stay pristine.
// ---------------------------------------------------------------------------

let events     = seedEvents.map(e => ({ ...e }));
let categories = seedCategories.map(c => ({ ...c }));
let bookings   = seedBookings.map(b => ({ ...b }));

// ---------------------------------------------------------------------------
// A simple counter for generating unique numeric event IDs.
// Starts after the highest seed ID so new IDs never collide with seeds.
// ---------------------------------------------------------------------------
let nextEventId = Math.max(...events.map(e => e.id)) + 1;

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
    return events.find(e => e.id === id);
}

/** Add a new event and return the created record. */
function createEvent({ title, category, date, city, venue, price, capacity, description }) {
    const newEvent = {
        id: nextEventId++,
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
// BOOKINGS
// ===========================================================================

/** Return all bookings. */
function getBookings() {
    return [...bookings];
}

/** Add a new booking and return the created record. */
function createBooking(event, quantity) {
    const qty = Number(quantity) || 1;
    const newBooking = {
        id: `EVT-${Math.floor(1000 + Math.random() * 9000)}`,
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
 * Cancel a booking by ID.
 * Returns the updated booking object, or undefined if not found.
 */
function cancelBooking(id) {
    const booking = bookings.find(b => b.id === id);
    if (!booking) return undefined;
    booking.status = "CANCELLED";
    return booking;
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
        totalUsers: 4,          // Placeholder — no real user table yet
        totalEvents: events.length,
        totalBookings: bookings.length,
        revenue
    };
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
    // Events
    getEvents,
    getEventById,
    createEvent,

    // Categories
    getCategories,

    // Bookings
    getBookings,
    createBooking,
    cancelBooking,

    // Admin
    getAdminStats
};
