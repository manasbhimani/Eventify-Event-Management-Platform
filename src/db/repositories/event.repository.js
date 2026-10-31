/**
 * src/db/repositories/event.repository.js
 *
 * Eventify — Event Repository.
 * Handles database operations for events and listings.
 */

"use strict";

const { executeOn, withTransaction, oracledb } = require("./base.repository");

const DEFAULT_EVENT_IMAGE = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80";

/**
 * Format a raw database row into an API-compatible event object.
 * @param {object} row - Raw row from Oracle
 * @returns {object|null} Formatted event object
 */
function formatEvent(row) {
    if (!row) return null;
    const timeVal = (row.EVENT_TIME && row.EVENT_TIME !== "00:00") ? row.EVENT_TIME : null;
    const eventObj = {
        id: Number(row.EVENT_ID),
        creatorId: (row.CREATOR_ID !== null && row.CREATOR_ID !== undefined) ? Number(row.CREATOR_ID) : null,
        categoryId: Number(row.CATEGORY_ID),
        category: row.CATEGORY_NAME,
        title: row.TITLE,
        date: row.EVENT_DATE, // Already serialized as YYYY-MM-DD via TO_CHAR
        time: timeVal,
        city: row.CITY,
        venue: row.VENUE,
        price: Number(row.PRICE),
        capacity: Number(row.CAPACITY),
        description: row.DESCRIPTION || "",
        image: row.IMAGE_URL,
        status: row.STATUS
    };
    if (row.BOOKED_COUNT !== undefined && row.BOOKED_COUNT !== null) {
        eventObj.bookedCount = Number(row.BOOKED_COUNT);
    }
    return eventObj;
}

/**
 * Retrieve events with optional category, search, and status filtering.
 * @param {object} [filters] - { category, search, status }
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<Array<object>>} Filtered list of events
 */
async function getEvents(filters = {}, executor = null) {
    const { category, search, status = "PUBLISHED" } = filters;

    let sql = `
        SELECT e.event_id, e.creator_id, e.category_id, c.name AS category_name,
               e.title, TO_CHAR(e.event_date, 'YYYY-MM-DD') AS event_date,
               TO_CHAR(e.event_date, 'HH24:MI') AS event_time,
               e.city, e.venue, e.price, e.capacity, e.description,
               e.image_url, e.status
        FROM EVENTS e
        JOIN CATEGORIES c ON e.category_id = c.category_id
        WHERE 1 = 1
    `;
    const binds = {};

    if (status && status !== "ALL") {
        sql += ` AND e.status = :status`;
        binds.status = status;
    }

    if (category && category !== "All") {
        sql += ` AND LOWER(c.name) = LOWER(:category)`;
        binds.category = category.trim();
    }

    if (search && typeof search === "string" && search.trim().length > 0) {
        sql += ` AND (
            LOWER(e.title) LIKE :search 
            OR LOWER(c.name) LIKE :search 
            OR LOWER(e.city) LIKE :search 
            OR LOWER(e.venue) LIKE :search
        )`;
        binds.search = `%${search.trim().toLowerCase()}%`;
    }

    sql += ` ORDER BY e.event_date ASC, e.event_id ASC`;

    const result = await executeOn(executor, sql, binds);
    return (result.rows || []).map(formatEvent);
}

/**
 * Retrieve a single event by numeric ID.
 * @param {number|string} id - Event ID
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object|null>} Event object or null
 */
async function getEventById(id, executor = null) {
    const numId = Number(id);
    if (isNaN(numId)) return null;

    const sql = `
        SELECT e.event_id, e.creator_id, e.category_id, c.name AS category_name,
               e.title, TO_CHAR(e.event_date, 'YYYY-MM-DD') AS event_date,
               TO_CHAR(e.event_date, 'HH24:MI') AS event_time,
               e.city, e.venue, e.price, e.capacity, e.description,
               e.image_url, e.status,
               (SELECT NVL(SUM(b.quantity), 0) FROM BOOKINGS b WHERE b.event_id = e.event_id AND b.status = 'CONFIRMED') AS booked_count
        FROM EVENTS e
        JOIN CATEGORIES c ON e.category_id = c.category_id
        WHERE e.event_id = :id
    `;

    const result = await executeOn(executor, sql, { id: numId });
    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return formatEvent(result.rows[0]);
}

/**
 * Create a new event.
 * @param {object} params - Event fields
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object>} Created event object
 */
async function createEvent(
    {
        title,
        category,
        categoryId,
        date,
        time = null,
        city = "Surat",
        venue = "Main Auditorium",
        price = 0,
        capacity = 100,
        description = "",
        image,
        imageUrl,
        creatorId,
        status = "PUBLISHED"
    },
    executor = null
) {
    if (!title || typeof title !== "string" || title.trim().length === 0) {
        throw new Error("Title is required.");
    }
    if (!date || typeof date !== "string") {
        throw new Error("A valid event date (YYYY-MM-DD) is required.");
    }

    // Resolve categoryId if category name string or numeric ID provided
    let resolvedCategoryId = categoryId ? Number(categoryId) : null;
    if (resolvedCategoryId) {
        const catRes = await executeOn(
            executor,
            `SELECT category_id FROM CATEGORIES WHERE category_id = :id`,
            { id: resolvedCategoryId }
        );
        if (!catRes.rows || catRes.rows.length === 0) {
            const err = new Error(`Category with ID ${resolvedCategoryId} does not exist.`);
            err.statusCode = 400;
            err.code = "CATEGORY_NOT_FOUND";
            throw err;
        }
    } else if (category && typeof category === "string") {
        const catRes = await executeOn(
            executor,
            `SELECT category_id FROM CATEGORIES WHERE LOWER(name) = LOWER(TRIM(:category))`,
            { category }
        );
        if (catRes.rows && catRes.rows.length > 0) {
            resolvedCategoryId = Number(catRes.rows[0].CATEGORY_ID);
        } else {
            const err = new Error(`Category '${category}' does not exist.`);
            err.statusCode = 400;
            err.code = "CATEGORY_NOT_FOUND";
            throw err;
        }
    }

    if (!resolvedCategoryId) {
        throw new Error("A valid category is required.");
    }

    const numPrice = Number(price) || 0;
    const numCapacity = Number(capacity) || 100;
    const resolvedImage = imageUrl || image || DEFAULT_EVENT_IMAGE;

    const dateStr = date.trim().split("T")[0];
    let eventDateTimeStr;
    if (time && typeof time === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(time.trim())) {
        const timeParts = time.trim().split(":");
        const hh = timeParts[0].padStart(2, "0");
        const mm = timeParts[1].padStart(2, "0");
        const ss = timeParts[2] ? timeParts[2].padStart(2, "0") : "00";
        eventDateTimeStr = `${dateStr} ${hh}:${mm}:${ss}`;
    } else {
        eventDateTimeStr = `${dateStr} 00:00:00`;
    }

    const sql = `
        INSERT INTO EVENTS (
            creator_id, category_id, title, event_date, city, venue, price, capacity, description, image_url, status
        ) VALUES (
            :creatorId, :categoryId, :title, TO_DATE(:eventDateTime, 'YYYY-MM-DD HH24:MI:SS'), :city, :venue, :price, :capacity, :description, :imageUrl, :status
        ) RETURNING event_id INTO :eventId
    `;

    const binds = {
        creatorId: creatorId ? Number(creatorId) : null,
        categoryId: resolvedCategoryId,
        title: title.trim(),
        eventDateTime: eventDateTimeStr,
        city: (city || "Surat").trim(),
        venue: (venue || "Main Auditorium").trim(),
        price: numPrice,
        capacity: numCapacity,
        description: description ? description.trim() : null,
        imageUrl: resolvedImage.trim(),
        status,
        eventId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    };

    const result = await executeOn(executor, sql, binds);
    const newId = Number(result.outBinds.eventId[0]);
    return getEventById(newId, executor);
}

/**
 * Update event status (DRAFT, PUBLISHED, CANCELLED, COMPLETED).
 * @param {number|string} id - Event ID
 * @param {string} status - New status
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<boolean>} True if updated
 */
async function updateEventStatus(id, status, executor = null) {
    const numId = Number(id);
    if (isNaN(numId)) return false;

    const result = await executeOn(
        executor,
        `UPDATE EVENTS 
         SET status = :status, updated_at = CURRENT_TIMESTAMP 
         WHERE event_id = :id`,
        { id: numId, status }
    );

    return (result.rowsAffected || 0) > 0;
}

/**
 * Transaction-safe atomic event update primitive.
 * Locks the event row, verifies authorization, calculates current confirmed bookings,
 * and enforces title/price freeze invariants when tickets are booked.
 *
 * @param {number|string} eventId - Event ID
 * @param {object} requestingUser - Authenticated user { id, role }
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated event object
 */
async function updateEventAtomic(eventId, requestingUser, updates = {}) {
    const numId = Number(eventId);
    if (isNaN(numId)) {
        const err = new Error("Invalid event ID.");
        err.code = "INVALID_EVENT_ID";
        err.statusCode = 400;
        throw err;
    }

    if (!requestingUser || !requestingUser.id) {
        const err = new Error("Authentication required.");
        err.code = "UNAUTHORIZED";
        err.statusCode = 401;
        throw err;
    }

    return withTransaction(async (tx) => {
        // 1. Lock the event row for update (exclusive Oracle row lock)
        const lockSql = `
            SELECT event_id, creator_id, category_id, title,
                   TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date,
                   TO_CHAR(event_date, 'HH24:MI') AS event_time,
                   city, venue, price, capacity, description, image_url, status
            FROM EVENTS
            WHERE event_id = :id
            FOR UPDATE
        `;
        const lockRes = await tx.execute(lockSql, { id: numId });
        if (!lockRes.rows || lockRes.rows.length === 0) {
            const err = new Error(`Event with ID ${numId} not found.`);
            err.code = "EVENT_NOT_FOUND";
            err.statusCode = 404;
            throw err;
        }
        const currentEvent = lockRes.rows[0];

        // 2. Verify authorization: Creator or ADMIN
        const eventCreatorId = (currentEvent.CREATOR_ID !== null && currentEvent.CREATOR_ID !== undefined)
            ? Number(currentEvent.CREATOR_ID)
            : null;
        const requestingUserId = Number(requestingUser.id);
        const isAdmin = requestingUser.role === "ADMIN";

        if (!isAdmin && (eventCreatorId === null || eventCreatorId !== requestingUserId)) {
            const err = new Error("You are not authorized to edit this event.");
            err.code = "FORBIDDEN";
            err.statusCode = 403;
            throw err;
        }

        // 3. Status checks: Reject editing CANCELLED or COMPLETED events
        if (currentEvent.STATUS === "CANCELLED" || currentEvent.STATUS === "COMPLETED") {
            const err = new Error(`Cannot edit an event with status '${currentEvent.STATUS}'.`);
            err.code = "EVENT_LOCKED_STATUS";
            err.statusCode = 400;
            throw err;
        }

        // 4. Authoritative confirmed booked ticket count within the same transaction
        const bookedRes = await tx.execute(
            `SELECT NVL(SUM(quantity), 0) AS total_booked
             FROM BOOKINGS
             WHERE event_id = :eventId AND status = 'CONFIRMED'`,
            { eventId: numId }
        );
        const confirmedBookedCount = Number(bookedRes.rows[0].TOTAL_BOOKED);

        // 5. Invariant: If confirmed tickets exist, title and price cannot be changed
        if (confirmedBookedCount > 0) {
            if (updates.title !== undefined) {
                const newTitle = updates.title.trim();
                const curTitle = (currentEvent.TITLE || "").trim();
                if (newTitle !== curTitle) {
                    const err = new Error("Event title cannot be changed because tickets have already been booked.");
                    err.code = "TITLE_LOCKED_BOOKINGS_EXIST";
                    err.statusCode = 400;
                    throw err;
                }
            }

            if (updates.price !== undefined) {
                const newPrice = Number(updates.price);
                const curPrice = Number(currentEvent.PRICE);
                if (newPrice !== curPrice) {
                    const err = new Error("Ticket price cannot be changed because tickets have already been booked.");
                    err.code = "PRICE_LOCKED_BOOKINGS_EXIST";
                    err.statusCode = 400;
                    throw err;
                }
            }
        }

        // 6. Invariant: Capacity cannot be reduced below confirmed ticket count
        const resolvedCapacity = updates.capacity !== undefined
            ? Number(updates.capacity)
            : Number(currentEvent.CAPACITY);

        if (resolvedCapacity < confirmedBookedCount) {
            const err = new Error(`Capacity cannot be reduced below the number of confirmed bookings (${confirmedBookedCount}).`);
            err.code = "CAPACITY_BELOW_BOOKED";
            err.statusCode = 400;
            throw err;
        }

        // 7. Resolve category if provided
        let resolvedCategoryId = Number(currentEvent.CATEGORY_ID);
        if (updates.categoryId !== undefined && updates.categoryId !== null) {
            const catRes = await tx.execute(
                `SELECT category_id FROM CATEGORIES WHERE category_id = :id`,
                { id: Number(updates.categoryId) }
            );
            if (!catRes.rows || catRes.rows.length === 0) {
                const err = new Error(`Category with ID ${updates.categoryId} does not exist.`);
                err.code = "CATEGORY_NOT_FOUND";
                err.statusCode = 400;
                throw err;
            }
            resolvedCategoryId = Number(catRes.rows[0].CATEGORY_ID);
        } else if (updates.category && typeof updates.category === "string") {
            const catRes = await tx.execute(
                `SELECT category_id FROM CATEGORIES WHERE LOWER(name) = LOWER(TRIM(:category))`,
                { category: updates.category }
            );
            if (!catRes.rows || catRes.rows.length === 0) {
                const err = new Error(`Category '${updates.category}' does not exist.`);
                err.code = "CATEGORY_NOT_FOUND";
                err.statusCode = 400;
                throw err;
            }
            resolvedCategoryId = Number(catRes.rows[0].CATEGORY_ID);
        }

        // 8. Resolve date & time safely without timezone shift
        const targetDate = updates.date !== undefined
            ? updates.date.trim().split("T")[0]
            : currentEvent.EVENT_DATE;

        let targetTime = currentEvent.EVENT_TIME || "00:00";
        if (updates.time !== undefined && updates.time !== null && typeof updates.time === "string" && updates.time.trim() !== "") {
            targetTime = updates.time.trim();
        } else if (updates.date !== undefined && updates.date.includes("T")) {
            const parts = updates.date.trim().split("T");
            if (parts[1] && /^\d{1,2}:\d{2}/.test(parts[1])) {
                targetTime = parts[1].slice(0, 5);
            }
        }

        const timeParts = targetTime.split(":");
        const hh = (timeParts[0] || "00").padStart(2, "0");
        const mm = (timeParts[1] || "00").padStart(2, "0");
        const ss = (timeParts[2] || "00").padStart(2, "0");
        const eventDateTimeStr = `${targetDate} ${hh}:${mm}:${ss}`;

        // 9. Resolve remaining fields (handling omitted fields by preserving current values)
        const resolvedTitle = updates.title !== undefined ? updates.title.trim() : currentEvent.TITLE;
        const resolvedCity = updates.city !== undefined ? updates.city.trim() : currentEvent.CITY;
        const resolvedVenue = updates.venue !== undefined ? updates.venue.trim() : currentEvent.VENUE;
        const resolvedPrice = updates.price !== undefined ? Number(updates.price) : Number(currentEvent.PRICE);
        const resolvedDescription = updates.description !== undefined
            ? (updates.description ? updates.description.trim() : null)
            : currentEvent.DESCRIPTION;
        const resolvedImageUrl = (updates.imageUrl || updates.image) !== undefined
            ? (updates.imageUrl || updates.image).trim()
            : currentEvent.IMAGE_URL;

        // 10. Execute the UPDATE statement
        const updateSql = `
            UPDATE EVENTS
            SET title = :title,
                category_id = :categoryId,
                event_date = TO_DATE(:eventDateTime, 'YYYY-MM-DD HH24:MI:SS'),
                city = :city,
                venue = :venue,
                price = :price,
                capacity = :capacity,
                description = :description,
                image_url = :imageUrl,
                updated_at = CURRENT_TIMESTAMP
            WHERE event_id = :id
        `;

        await tx.execute(updateSql, {
            id: numId,
            title: resolvedTitle,
            categoryId: resolvedCategoryId,
            eventDateTime: eventDateTimeStr,
            city: resolvedCity,
            venue: resolvedVenue,
            price: resolvedPrice,
            capacity: resolvedCapacity,
            description: resolvedDescription,
            imageUrl: resolvedImageUrl
        });

        // 11. Return authoritative updated event object with booked count
        return getEventById(numId, tx);
    });
}

/**
 * Atomic event cancellation transaction.
 * Locks the event row, updates all affected confirmed bookings to CANCELLED,
 * inserts simulated refund records into EVENT_REFUNDS for paid bookings,
 * generates EVENT_CANCELLED notifications in NOTIFICATIONS, and updates the event to CANCELLED.
 *
 * @param {object} params
 * @param {number|string} params.eventId - Event ID to cancel
 * @param {number|string} params.cancelledByUserId - ID of user initiating cancellation
 * @param {string} params.userRole - Role of user ('ORGANIZER' or 'ADMIN')
 * @param {string} [params.cancellationReason] - Optional reason for cancellation (max 500 chars)
 * @returns {Promise<object>} Cancellation summary
 */
async function cancelEventAtomic({ eventId, cancelledByUserId, userRole, cancellationReason = null }) {
    const numEventId = Number(eventId);
    if (isNaN(numEventId)) {
        const err = new Error("Invalid event ID.");
        err.code = "INVALID_EVENT_ID";
        err.statusCode = 400;
        throw err;
    }

    const numUserId = Number(cancelledByUserId);
    if (isNaN(numUserId)) {
        const err = new Error("Authentication required.");
        err.code = "UNAUTHORIZED";
        err.statusCode = 401;
        throw err;
    }

    const sanitizedReason = (cancellationReason && typeof cancellationReason === "string")
        ? cancellationReason.trim().slice(0, 500)
        : null;

    return withTransaction(async (tx) => {
        // 1. Lock the event row for update
        const lockSql = `
            SELECT event_id, creator_id, title, price, status
            FROM EVENTS
            WHERE event_id = :id
            FOR UPDATE
        `;
        const lockRes = await tx.execute(lockSql, { id: numEventId });
        if (!lockRes.rows || lockRes.rows.length === 0) {
            const err = new Error(`Event with ID ${numEventId} not found.`);
            err.code = "EVENT_NOT_FOUND";
            err.statusCode = 404;
            throw err;
        }

        const eventRow = lockRes.rows[0];
        const eventCreatorId = (eventRow.CREATOR_ID !== null && eventRow.CREATOR_ID !== undefined)
            ? Number(eventRow.CREATOR_ID)
            : null;
        const isAdmin = userRole === "ADMIN";

        // 2. Creator authorization check
        if (!isAdmin && (eventCreatorId === null || eventCreatorId !== numUserId)) {
            const err = new Error("You are not authorized to cancel this event.");
            err.code = "FORBIDDEN";
            err.statusCode = 403;
            throw err;
        }

        // 3. Status checks
        if (eventRow.STATUS === "CANCELLED") {
            const err = new Error("Event is already cancelled.");
            err.code = "EVENT_ALREADY_CANCELLED";
            err.statusCode = 400;
            throw err;
        }

        if (eventRow.STATUS === "COMPLETED") {
            const err = new Error("Cannot cancel an event that is already COMPLETED.");
            err.code = "EVENT_COMPLETED";
            err.statusCode = 400;
            throw err;
        }

        // 4. Query all CONFIRMED bookings for this event (lock them)
        const bookingsSql = `
            SELECT booking_id, user_id, event_id, title_snapshot,
                   unit_price_snapshot, quantity, amount, status
            FROM BOOKINGS
            WHERE event_id = :eventId AND status = 'CONFIRMED'
            FOR UPDATE
        `;
        const bookingsRes = await tx.execute(bookingsSql, { eventId: numEventId });
        const confirmedBookings = bookingsRes.rows || [];

        let refundsCount = 0;
        let notificationsCount = 0;

        const reasonText = sanitizedReason ? ` Reason: "${sanitizedReason}".` : "";

        // 5. Process affected bookings
        for (const b of confirmedBookings) {
            const bId = b.BOOKING_ID;
            const bUserId = Number(b.USER_ID);
            const bAmount = Number(b.AMOUNT);

            // Update booking status to CANCELLED
            await tx.execute(
                `UPDATE BOOKINGS
                 SET status = 'CANCELLED',
                     cancelled_at = CURRENT_TIMESTAMP
                 WHERE booking_id = :bId`,
                { bId }
            );

            // Insert simulated refund if positive amount
            if (bAmount > 0) {
                await tx.execute(
                    `INSERT INTO EVENT_REFUNDS (
                        booking_id, event_id, user_id, refund_amount,
                        refund_mode, status, reason
                     ) VALUES (
                        :bookingId, :eventId, :userId, :refundAmount,
                        'SIMULATED', 'SIMULATED_RECORDED', :reason
                     )`,
                    {
                        bookingId: bId,
                        eventId: numEventId,
                        userId: bUserId,
                        refundAmount: bAmount,
                        reason: sanitizedReason || "Event cancelled by organizer"
                    }
                );
                refundsCount++;
            }

            // Insert notification
            let notifMsg;
            if (bAmount > 0) {
                notifMsg = `The event "${eventRow.TITLE}" has been cancelled by the organizer.${reasonText} A simulated refund of ₹${bAmount.toLocaleString("en-IN")} has been recorded for booking ${bId} (simulated refund recorded — no real money was transferred).`;
            } else {
                notifMsg = `The event "${eventRow.TITLE}" has been cancelled by the organizer.${reasonText} No payment was collected; your reservation (${bId}) was cancelled without charge.`;
            }

            await tx.execute(
                `INSERT INTO NOTIFICATIONS (
                    user_id, event_id, booking_id, type, title, message, status
                 ) VALUES (
                    :userId, :eventId, :bookingId, 'EVENT_CANCELLED', :title, :message, 'UNREAD'
                 )`,
                {
                    userId: bUserId,
                    eventId: numEventId,
                    bookingId: bId,
                    title: `Event Cancelled: ${eventRow.TITLE}`,
                    message: notifMsg
                }
            );
            notificationsCount++;
        }

        // 6. Update event status to CANCELLED
        await tx.execute(
            `UPDATE EVENTS
             SET status = 'CANCELLED',
                 cancelled_by = :cancelledBy,
                 cancelled_at = CURRENT_TIMESTAMP,
                 cancellation_reason = :cancellationReason,
                 updated_at = CURRENT_TIMESTAMP
             WHERE event_id = :id`,
            {
                id: numEventId,
                cancelledBy: numUserId,
                cancellationReason: sanitizedReason
            }
        );

        return {
            success: true,
            eventId: numEventId,
            eventTitle: eventRow.TITLE,
            status: "CANCELLED",
            affectedBookingsCount: confirmedBookings.length,
            refundsCount,
            notificationsCount,
            cancelledBy: numUserId,
            cancellationReason: sanitizedReason
        };
    });
}

module.exports = {
    DEFAULT_EVENT_IMAGE,
    formatEvent,
    getEvents,
    getEventById,
    createEvent,
    updateEventStatus,
    updateEventAtomic,
    cancelEventAtomic
};
