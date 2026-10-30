/**
 * src/db/repositories/user.repository.js
 *
 * Eventify — User Repository.
 * Handles database operations for users and authentication identities.
 */

"use strict";

const { executeOn, oracledb } = require("./base.repository");

/**
 * Format a raw database row into an application user object.
 * @param {object} row - Raw row from Oracle
 * @returns {object|null} Formatted user object
 */
function formatUser(row) {
    if (!row) return null;
    return {
        id: Number(row.USER_ID),
        name: row.NAME,
        email: row.EMAIL,
        passwordHash: row.PASSWORD_HASH,
        role: row.ROLE,
        status: row.STATUS,
        createdAt: row.CREATED_AT instanceof Date ? row.CREATED_AT.toISOString() : String(row.CREATED_AT),
        updatedAt: row.UPDATED_AT instanceof Date ? row.UPDATED_AT.toISOString() : String(row.UPDATED_AT)
    };
}

/**
 * Return a sanitized user object without password hash.
 * @param {object|null} user - Full user object
 * @returns {object|null} Sanitized user object
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
 * Retrieve a user by numeric ID.
 * @param {number|string} id - User ID
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<object|null>} User object or null
 */
async function getUserById(id, executor = null) {
    const numId = Number(id);
    if (isNaN(numId)) return null;

    const result = await executeOn(
        executor,
        `SELECT user_id, name, email, password_hash, role, status, created_at, updated_at 
         FROM USERS 
         WHERE user_id = :id`,
        { id: numId }
    );

    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return formatUser(result.rows[0]);
}

/**
 * Retrieve a user by email address (case-insensitive).
 * @param {string} email - Email address
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByEmail(email, executor = null) {
    if (!email || typeof email !== "string") return null;

    const normalized = email.trim().toLowerCase();
    const result = await executeOn(
        executor,
        `SELECT user_id, name, email, password_hash, role, status, created_at, updated_at 
         FROM USERS 
         WHERE email = :email`,
        { email: normalized }
    );

    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return formatUser(result.rows[0]);
}

/**
 * Create a new user in the database.
 * @param {object} params - { name, email, passwordHash, role, status }
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<object>} Created user object (full record)
 */
async function createUser(
    { name, email, passwordHash, role = "ATTENDEE", status = "ACTIVE" },
    executor = null
) {
    if (!name || typeof name !== "string" || name.trim().length < 2) {
        throw new Error("Full name must be at least 2 characters long.");
    }
    if (!email || typeof email !== "string") {
        throw new Error("A valid email address is required.");
    }
    if (!passwordHash || typeof passwordHash !== "string") {
        throw new Error("Password hash is required.");
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const result = await executeOn(
        executor,
        `INSERT INTO USERS (name, email, password_hash, role, status)
         VALUES (:name, :email, :passwordHash, :role, :status)
         RETURNING user_id INTO :userId`,
        {
            name: trimmedName,
            email: normalizedEmail,
            passwordHash,
            role,
            status,
            userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
    );

    const newId = Number(result.outBinds.userId[0]);
    return getUserById(newId, executor);
}

/**
 * Update user status (ACTIVE, SUSPENDED, DEACTIVATED).
 * @param {number|string} id - User ID
 * @param {string} status - New status
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<boolean>} True if updated
 */
async function updateUserStatus(id, status, executor = null) {
    const numId = Number(id);
    if (isNaN(numId)) return false;

    const result = await executeOn(
        executor,
        `UPDATE USERS 
         SET status = :status, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = :id`,
        { id: numId, status }
    );

    return (result.rowsAffected || 0) > 0;
}

module.exports = {
    formatUser,
    sanitizeUser,
    getUserById,
    getUserByEmail,
    createUser,
    updateUserStatus
};
