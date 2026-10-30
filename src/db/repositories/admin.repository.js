/**
 * src/db/repositories/admin.repository.js
 *
 * Eventify — Admin Statistics Repository.
 * Handles database operations for administrative platform-wide metrics and aggregates.
 */

"use strict";

const { executeOn } = require("./base.repository");

/**
 * Retrieve platform-wide aggregates matching the existing API contract.
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object>} { totalUsers, totalEvents, totalBookings, revenue }
 */
async function getAdminStats(executor = null) {
    const sql = `
        SELECT 
            (SELECT COUNT(*) FROM USERS) AS total_users,
            (SELECT COUNT(*) FROM EVENTS) AS total_events,
            (SELECT COUNT(*) FROM BOOKINGS) AS total_bookings,
            (SELECT NVL(SUM(amount), 0) FROM BOOKINGS WHERE status != 'CANCELLED') AS revenue
        FROM DUAL
    `;

    const result = await executeOn(executor, sql);
    const row = result.rows[0];

    return {
        totalUsers: Number(row.TOTAL_USERS),
        totalEvents: Number(row.TOTAL_EVENTS),
        totalBookings: Number(row.TOTAL_BOOKINGS),
        revenue: Number(row.REVENUE)
    };
}

/**
 * Retrieve user counts grouped by role.
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object>} Counts mapped by role name
 */
async function getUserCountsByRole(executor = null) {
    const sql = `
        SELECT role, COUNT(*) AS count 
        FROM USERS 
        GROUP BY role 
        ORDER BY role ASC
    `;

    const result = await executeOn(executor, sql);
    const counts = {};
    for (const row of result.rows || []) {
        counts[row.ROLE] = Number(row.COUNT);
    }
    return counts;
}

/**
 * Retrieve booking counts and revenue grouped by status.
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object>} Aggregates mapped by booking status
 */
async function getBookingStatusBreakdown(executor = null) {
    const sql = `
        SELECT status, COUNT(*) AS count, NVL(SUM(amount), 0) AS total_amount
        FROM BOOKINGS 
        GROUP BY status 
        ORDER BY status ASC
    `;

    const result = await executeOn(executor, sql);
    const breakdown = {};
    for (const row of result.rows || []) {
        breakdown[row.STATUS] = {
            count: Number(row.COUNT),
            amount: Number(row.TOTAL_AMOUNT)
        };
    }
    return breakdown;
}

module.exports = {
    getAdminStats,
    getUserCountsByRole,
    getBookingStatusBreakdown
};
