/**
 * src/db/repositories/event.repository.js
 *
 * Eventify — Event Repository.
 * Handles database operations for events and listings.
 */

"use strict";

const { executeOn, oracledb } = require("./base.repository");

const DEFAULT_EVENT_IMAGE = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80";

/**
 * Format a raw database row into an API-compatible event object.
 * @param {object} row - Raw row from Oracle
 * @returns {object|null} Formatted event object
 */
function formatEvent(row) {
    if (!row) return null;
    return {
        id: Number(row.EVENT_ID),
        creatorId: (row.CREATOR_ID !== null && row.CREATOR_ID !== undefined) ? Number(row.CREATOR_ID) : null,
        categoryId: Number(row.CATEGORY_ID),
        category: row.CATEGORY_NAME,
        title: row.TITLE,
        date: row.EVENT_DATE, // Already serialized as YYYY-MM-DD via TO_CHAR
        city: row.CITY,
        venue: row.VENUE,
        price: Number(row.PRICE),
        capacity: Number(row.CAPACITY),
        description: row.DESCRIPTION || "",
        image: row.IMAGE_URL,
        status: row.STATUS
    };
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
               e.city, e.venue, e.price, e.capacity, e.description,
               e.image_url, e.status
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

    const sql = `
        INSERT INTO EVENTS (
            creator_id, category_id, title, event_date, city, venue, price, capacity, description, image_url, status
        ) VALUES (
            :creatorId, :categoryId, :title, TO_DATE(:eventDate, 'YYYY-MM-DD'), :city, :venue, :price, :capacity, :description, :imageUrl, :status
        ) RETURNING event_id INTO :eventId
    `;

    const binds = {
        creatorId: creatorId ? Number(creatorId) : null,
        categoryId: resolvedCategoryId,
        title: title.trim(),
        eventDate: date.trim().split("T")[0], // Normalize to YYYY-MM-DD
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

module.exports = {
    DEFAULT_EVENT_IMAGE,
    formatEvent,
    getEvents,
    getEventById,
    createEvent,
    updateEventStatus
};
