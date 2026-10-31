/**
 * src/db/repositories/notification.repository.js
 *
 * Eventify — Notification Repository.
 * Handles database operations for persistent attendee notifications and simulated refunds.
 */

"use strict";

const { executeOn, oracledb } = require("./base.repository");

/**
 * Format a raw database row into an API-compatible notification object.
 * @param {object} row - Raw row from Oracle
 * @returns {object|null} Formatted notification object
 */
function formatNotification(row) {
    if (!row) return null;

    const notifObj = {
        id: Number(row.NOTIFICATION_ID),
        userId: Number(row.USER_ID),
        eventId: Number(row.EVENT_ID),
        bookingId: row.BOOKING_ID || null,
        type: row.TYPE,
        title: row.TITLE,
        message: row.MESSAGE,
        status: row.STATUS,
        createdAt: row.CREATED_AT,
        readAt: row.READ_AT || null,
        eventTitle: row.EVENT_TITLE || null
    };

    if (row.REFUND_ID !== undefined && row.REFUND_ID !== null) {
        notifObj.refund = {
            id: Number(row.REFUND_ID),
            amount: Number(row.REFUND_AMOUNT),
            mode: row.REFUND_MODE,
            status: row.REFUND_STATUS
        };
    } else {
        notifObj.refund = null;
    }

    return notifObj;
}

/**
 * Retrieve notifications for a specific user.
 * @param {number|string} userId - User ID
 * @param {object} [options] - Filtering options (e.g. status)
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<Array<object>>} List of notifications
 */
async function getUserNotifications(userId, options = {}, executor = null) {
    const numUserId = Number(userId);
    if (isNaN(numUserId)) return [];

    const { status } = options;

    let sql = `
        SELECT n.notification_id, n.user_id, n.event_id, n.booking_id,
               n.type, n.title, n.message, n.status,
               TO_CHAR(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
               TO_CHAR(n.read_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at,
               e.title AS event_title,
               r.refund_id, r.refund_amount, r.refund_mode, r.status AS refund_status
        FROM NOTIFICATIONS n
        JOIN EVENTS e ON n.event_id = e.event_id
        LEFT JOIN EVENT_REFUNDS r ON n.booking_id = r.booking_id
        WHERE n.user_id = :userId
    `;
    const binds = { userId: numUserId };

    if (status) {
        sql += ` AND n.status = :status`;
        binds.status = status;
    } else {
        // By default, exclude dismissed notifications
        sql += ` AND n.status != 'DISMISSED'`;
    }

    sql += ` ORDER BY n.created_at DESC, n.notification_id DESC`;

    const result = await executeOn(executor, sql, binds);
    return (result.rows || []).map(formatNotification);
}

/**
 * Retrieve a single notification by ID.
 * @param {number|string} id - Notification ID
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object|null>} Notification object or null
 */
async function getNotificationById(id, executor = null) {
    const numId = Number(id);
    if (isNaN(numId)) return null;

    const sql = `
        SELECT n.notification_id, n.user_id, n.event_id, n.booking_id,
               n.type, n.title, n.message, n.status,
               TO_CHAR(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
               TO_CHAR(n.read_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at,
               e.title AS event_title,
               r.refund_id, r.refund_amount, r.refund_mode, r.status AS refund_status
        FROM NOTIFICATIONS n
        JOIN EVENTS e ON n.event_id = e.event_id
        LEFT JOIN EVENT_REFUNDS r ON n.booking_id = r.booking_id
        WHERE n.notification_id = :id
    `;

    const result = await executeOn(executor, sql, { id: numId });
    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return formatNotification(result.rows[0]);
}

/**
 * Dismiss a notification for an authenticated user.
 * Marks the notification status as 'DISMISSED' and sets read_at timestamp.
 *
 * @param {number|string} id - Notification ID
 * @param {number|string} userId - Authenticated user ID
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<{success: boolean, error?: string, notification?: object}>}
 */
async function dismissNotification(id, userId, executor = null) {
    const numId = Number(id);
    const numUserId = Number(userId);
    if (isNaN(numId) || isNaN(numUserId)) {
        return { success: false, error: "INVALID_INPUT" };
    }

    const checkSql = `SELECT notification_id, user_id FROM NOTIFICATIONS WHERE notification_id = :id`;
    const checkRes = await executeOn(executor, checkSql, { id: numId });
    if (!checkRes.rows || checkRes.rows.length === 0) {
        return { success: false, error: "NOT_FOUND" };
    }

    const ownerId = Number(checkRes.rows[0].USER_ID);
    if (ownerId !== numUserId) {
        // Return NOT_FOUND to avoid disclosing other users' notification existence
        return { success: false, error: "NOT_FOUND" };
    }

    const updateSql = `
        UPDATE NOTIFICATIONS
        SET status = 'DISMISSED',
            read_at = CURRENT_TIMESTAMP
        WHERE notification_id = :id AND user_id = :userId
    `;
    await executeOn(executor, updateSql, { id: numId, userId: numUserId });

    const updated = await getNotificationById(numId, executor);
    return { success: true, notification: updated };
}

module.exports = {
    formatNotification,
    getUserNotifications,
    getNotificationById,
    dismissNotification
};
