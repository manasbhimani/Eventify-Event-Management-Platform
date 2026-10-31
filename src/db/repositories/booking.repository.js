/**
 * src/db/repositories/booking.repository.js
 *
 * Eventify — Booking Repository.
 * Handles database operations and transaction-safe concurrency primitives for bookings.
 */

"use strict";

const { executeOn, withTransaction } = require("./base.repository");

/**
 * Format a raw database row into an API-compatible booking object.
 * @param {object} row - Raw row from Oracle
 * @returns {object|null} Formatted booking object
 */
function formatBooking(row) {
    if (!row) return null;
    return {
        id: row.BOOKING_ID,
        userId: Number(row.USER_ID),
        eventId: Number(row.EVENT_ID),
        title: row.TITLE_SNAPSHOT,
        date: row.DATE_SNAPSHOT, // Serialized as YYYY-MM-DDTHH:mm:ss via TO_CHAR
        venue: row.VENUE_SNAPSHOT,
        unitPrice: Number(row.UNIT_PRICE_SNAPSHOT),
        quantity: Number(row.QUANTITY),
        amount: Number(row.AMOUNT),
        status: row.STATUS,
        bookingDate: row.BOOKING_DATE || null,
        cancelledAt: row.CANCELLED_AT || null,
        icon: "🎟️"
    };
}

/**
 * Retrieve bookings, optionally filtered by user ID.
 * @param {object} [filters] - { userId }
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<Array<object>>} List of formatted bookings
 */
async function getBookings(filters = {}, executor = null) {
    const { userId } = filters;

    let sql = `
        SELECT booking_id, user_id, event_id,
               title_snapshot,
               TO_CHAR(date_snapshot, 'YYYY-MM-DD"T"HH24:MI:SS') AS date_snapshot,
               venue_snapshot, unit_price_snapshot, quantity, amount, status,
               TO_CHAR(booking_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS booking_date,
               TO_CHAR(cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cancelled_at
        FROM BOOKINGS
    `;
    const binds = {};

    if (userId !== undefined && userId !== null) {
        sql += ` WHERE user_id = :userId`;
        binds.userId = Number(userId);
    }

    sql += ` ORDER BY booking_date DESC, booking_id DESC`;

    const result = await executeOn(executor, sql, binds);
    return (result.rows || []).map(formatBooking);
}

/**
 * Retrieve a single booking by ID.
 * @param {string} id - Booking ID (e.g. 'EVT-1001')
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object|null>} Booking object or null
 */
async function getBookingById(id, executor = null) {
    if (!id || typeof id !== "string") return null;

    const sql = `
        SELECT booking_id, user_id, event_id,
               title_snapshot,
               TO_CHAR(date_snapshot, 'YYYY-MM-DD"T"HH24:MI:SS') AS date_snapshot,
               venue_snapshot, unit_price_snapshot, quantity, amount, status,
               TO_CHAR(booking_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS booking_date,
               TO_CHAR(cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cancelled_at
        FROM BOOKINGS
        WHERE booking_id = :id
    `;

    const result = await executeOn(executor, sql, { id: id.trim() });
    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return formatBooking(result.rows[0]);
}

// ---------------------------------------------------------------------------
// TRANSACTION-SAFE PRIMITIVES FOR BOOKING CREATION
// ---------------------------------------------------------------------------

/**
 * Primitive 1: Lock the event row for update (pessimistic concurrency control).
 * Guarantees serial execution of concurrent bookings against this event.
 * @param {object} tx - Transaction executor with tx.execute
 * @param {number|string} eventId - Event ID
 * @returns {Promise<object|null>} Locked event row or null
 */
async function getEventForUpdate(tx, eventId) {
    const numId = Number(eventId);
    if (isNaN(numId)) return null;

    const sql = `
        SELECT event_id, creator_id, category_id, title,
               TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date,
               city, venue, price, capacity, status
        FROM EVENTS
        WHERE event_id = :id
        FOR UPDATE
    `;

    const result = await tx.execute(sql, { id: numId });
    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return result.rows[0];
}

/**
 * Primitive 2: Calculate the total confirmed tickets booked for an event.
 * @param {object} tx - Transaction executor with tx.execute
 * @param {number|string} eventId - Event ID
 * @returns {Promise<number>} Total number of confirmed booked tickets
 */
async function getConfirmedTicketCountForEvent(tx, eventId) {
    const numId = Number(eventId);
    const sql = `
        SELECT NVL(SUM(quantity), 0) AS total_booked
        FROM BOOKINGS
        WHERE event_id = :eventId AND status = 'CONFIRMED'
    `;

    const result = await tx.execute(sql, { eventId: numId });
    return Number(result.rows[0].TOTAL_BOOKED);
}

/**
 * Primitive 3: Generate the next booking ID from the sequence (EVT-<number>).
 * @param {object} tx - Transaction executor with tx.execute
 * @returns {Promise<string>} Next booking ID
 */
async function getNextBookingId(tx) {
    const sql = `SELECT 'EVT-' || seq_booking_id.NEXTVAL AS booking_id FROM DUAL`;
    const result = await tx.execute(sql);
    return result.rows[0].BOOKING_ID;
}

/**
 * Primitive 4: Insert the booking record inside an active transaction.
 * @param {object} tx - Transaction executor with tx.execute
 * @param {object} params - Booking parameters
 * @returns {Promise<object>} Insertion result metadata
 */
async function insertBooking(tx, {
    bookingId,
    userId,
    eventId,
    titleSnapshot,
    dateSnapshot,
    venueSnapshot,
    unitPriceSnapshot,
    quantity,
    amount,
    status = "CONFIRMED"
}) {
    const sql = `
        INSERT INTO BOOKINGS (
            booking_id, user_id, event_id,
            title_snapshot, date_snapshot, venue_snapshot, unit_price_snapshot,
            quantity, amount, status
        ) VALUES (
            :bookingId, :userId, :eventId,
            :titleSnapshot,
            TO_DATE(:dateSnapshot, 'YYYY-MM-DD"T"HH24:MI:SS'),
            :venueSnapshot, :unitPriceSnapshot,
            :quantity, :amount, :status
        )
    `;

    return tx.execute(sql, {
        bookingId,
        userId: Number(userId),
        eventId: Number(eventId),
        titleSnapshot,
        dateSnapshot,
        venueSnapshot,
        unitPriceSnapshot: Number(unitPriceSnapshot),
        quantity: Number(quantity),
        amount: Number(amount),
        status
    });
}

/**
 * High-level atomic booking creation wrapper.
 * Combines lock, capacity check, price calculation, ID generation, and insertion
 * within a single atomic database transaction.
 *
 * @param {object} params - { userId, eventId, quantity }
 * @returns {Promise<object>} Confirmed booking object
 */
async function createBookingAtomic({ userId, eventId, quantity }) {
    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty < 1 || numQty > 10) {
        const err = new Error("Quantity must be a number between 1 and 10.");
        err.code = "INVALID_QUANTITY";
        throw err;
    }

    const numUserId = Number(userId);
    if (isNaN(numUserId)) {
        const err = new Error("Valid authenticated user ID is required.");
        err.code = "INVALID_USER";
        throw err;
    }

    return withTransaction(async (tx) => {
        // 1. Lock event row
        const eventRow = await getEventForUpdate(tx, eventId);
        if (!eventRow) {
            const err = new Error("Event not found.");
            err.code = "EVENT_NOT_FOUND";
            throw err;
        }

        if (eventRow.STATUS !== "PUBLISHED") {
            const err = new Error("Event is not currently open for bookings.");
            err.code = "EVENT_NOT_PUBLISHED";
            throw err;
        }

        // Owner self-booking prohibition: organizers receive complimentary entry
        const creatorId = (eventRow.CREATOR_ID !== null && eventRow.CREATOR_ID !== undefined)
            ? Number(eventRow.CREATOR_ID)
            : null;
        if (creatorId !== null && !isNaN(creatorId) && creatorId === numUserId) {
            const err = new Error("Event organizers receive complimentary entry and cannot book their own event.");
            err.code = "OWNER_BOOKING_PROHIBITED";
            throw err;
        }

        // 2. Check remaining capacity
        const totalBooked = await getConfirmedTicketCountForEvent(tx, eventId);
        const capacity = Number(eventRow.CAPACITY);
        const remaining = capacity - totalBooked;

        if (numQty > remaining) {
            const err = new Error(`Insufficient tickets remaining. Available: ${remaining}, Requested: ${numQty}.`);
            err.code = "INSUFFICIENT_CAPACITY";
            err.details = { capacity, booked: totalBooked, remaining, requested: numQty };
            throw err;
        }

        // 3. Compute totals from authoritative database price
        const unitPrice = Number(eventRow.PRICE);
        const amount = unitPrice * numQty;
        const titleSnapshot = eventRow.TITLE;
        const dateSnapshot = eventRow.EVENT_DATE + "T10:00:00";
        const venueSnapshot = `${eventRow.VENUE}, ${eventRow.CITY}`;

        // 4. Generate next booking ID
        const bookingId = await getNextBookingId(tx);

        // 5. Insert booking
        await insertBooking(tx, {
            bookingId,
            userId: numUserId,
            eventId: Number(eventRow.EVENT_ID),
            titleSnapshot,
            dateSnapshot,
            venueSnapshot,
            unitPriceSnapshot: unitPrice,
            quantity: numQty,
            amount,
            status: "CONFIRMED"
        });

        // 6. Return fully formatted booking
        const created = await getBookingById(bookingId, tx);
        return created;
    });
}

/**
 * Cancel a booking with server-side authorization check.
 * @param {string} id - Booking ID
 * @param {object} requestingUser - { id, role }
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object>} Result object: { success: true, booking } or { error: string }
 */
async function cancelBooking(id, requestingUser, executor = null) {
    if (!id || typeof id !== "string") {
        return { error: "NOT_FOUND" };
    }

    const isTx = executor && typeof executor.execute === "function";
    const checkSql = isTx
        ? `SELECT booking_id, user_id, status FROM BOOKINGS WHERE booking_id = :id FOR UPDATE`
        : `SELECT booking_id, user_id, status FROM BOOKINGS WHERE booking_id = :id`;
    const checkRes = await executeOn(executor, checkSql, { id: id.trim() });

    if (!checkRes.rows || checkRes.rows.length === 0) {
        return { error: "NOT_FOUND" };
    }

    const bookingRow = checkRes.rows[0];

    // Ownership check: ADMIN can cancel any; non-admin can only cancel their own
    if (requestingUser.role !== "ADMIN" && Number(bookingRow.USER_ID) !== Number(requestingUser.id)) {
        return { error: "FORBIDDEN" };
    }

    if (bookingRow.STATUS === "CANCELLED") {
        const existing = await getBookingById(id, executor);
        return { error: "ALREADY_CANCELLED", booking: existing };
    }

    await executeOn(
        executor,
        `UPDATE BOOKINGS 
         SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP 
         WHERE booking_id = :id`,
        { id: id.trim() }
    );

    const updated = await getBookingById(id, executor);
    return { success: true, booking: updated };
}

/**
 * Atomic cancellation helper wrapped in a database transaction.
 * @param {string} id - Booking ID
 * @param {object} requestingUser - { id, role }
 * @returns {Promise<object>} Result object
 */
async function cancelBookingAtomic(id, requestingUser) {
    return withTransaction(async (tx) => {
        return cancelBooking(id, requestingUser, tx);
    });
}

module.exports = {
    formatBooking,
    getBookings,
    getBookingById,
    getEventForUpdate,
    getConfirmedTicketCountForEvent,
    getNextBookingId,
    insertBooking,
    createBookingAtomic,
    cancelBooking,
    cancelBookingAtomic
};
