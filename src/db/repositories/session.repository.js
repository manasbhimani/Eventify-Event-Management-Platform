/**
 * src/db/repositories/session.repository.js
 *
 * Eventify — Session Repository.
 * Handles database operations for user sessions and CSRF tokens.
 */

"use strict";

const crypto = require("crypto");
const { executeOn } = require("./base.repository");

const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Compute SHA-256 hash of a raw session token string.
 * @param {string} rawToken - Raw session token
 * @returns {string} 64-character hex hash
 */
function hashSessionToken(rawToken) {
    if (!rawToken || typeof rawToken !== "string") {
        throw new TypeError("Session token must be a non-empty string.");
    }
    return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Create a new persistent session for a user.
 * @param {object} user - User object containing at least { id, name, email, role }
 * @param {object} [options] - Optional settings ({ ttlMs })
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object>} Session data containing raw sessionId and csrfToken
 */
async function createSession(user, options = {}, executor = null) {
    if (!user || !user.id) {
        throw new Error("Cannot create session: valid user with id is required.");
    }

    const ttlMs = Number(options.ttlMs) || DEFAULT_SESSION_TTL_MS;
    const rawSessionId = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(rawSessionId);
    const now = Date.now();
    const expiresAtDate = new Date(now + ttlMs);

    await executeOn(
        executor,
        `INSERT INTO SESSIONS (session_token_hash, user_id, csrf_token, expires_at)
         VALUES (:tokenHash, :userId, :csrfToken, :expiresAt)`,
        {
            tokenHash,
            userId: Number(user.id),
            csrfToken,
            expiresAt: expiresAtDate
        }
    );

    return {
        sessionId: rawSessionId,
        sessionTokenHash: tokenHash,
        userId: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        csrfToken,
        createdAt: now,
        expiresAt: expiresAtDate.getTime()
    };
}

/**
 * Retrieve a valid, unexpired session by raw session token.
 * Evicts expired session rows and verifies active user status.
 * @param {string} rawSessionId - Raw session token from cookie
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<object|null>} Active session or null
 */
async function getSession(rawSessionId, executor = null) {
    if (!rawSessionId || typeof rawSessionId !== "string" || rawSessionId.trim() === "") {
        return null;
    }

    let tokenHash;
    try {
        tokenHash = hashSessionToken(rawSessionId.trim());
    } catch {
        return null;
    }

    const result = await executeOn(
        executor,
        `SELECT s.session_token_hash, s.user_id, s.csrf_token, s.expires_at, s.created_at,
                u.name, u.email, u.role, u.status
         FROM SESSIONS s
         JOIN USERS u ON s.user_id = u.user_id
         WHERE s.session_token_hash = :tokenHash`,
        { tokenHash }
    );

    if (!result.rows || result.rows.length === 0) {
        return null;
    }

    const row = result.rows[0];
    const expiresAtMs = new Date(row.EXPIRES_AT).getTime();

    // Check expiration
    if (Date.now() > expiresAtMs) {
        await deleteSession(rawSessionId, executor);
        return null;
    }

    // Verify user status
    if (row.STATUS !== "ACTIVE") {
        return null;
    }

    // Update last_accessed_at asynchronously without blocking response
    try {
        await executeOn(
            executor,
            `UPDATE SESSIONS 
             SET last_accessed_at = CURRENT_TIMESTAMP 
             WHERE session_token_hash = :tokenHash`,
            { tokenHash }
        );
    } catch (touchErr) {
        console.warn("[SessionRepository] Failed to update last_accessed_at:", touchErr.message);
    }

    return {
        sessionId: rawSessionId,
        sessionTokenHash: tokenHash,
        userId: Number(row.USER_ID),
        name: row.NAME,
        email: row.EMAIL,
        role: row.ROLE,
        csrfToken: row.CSRF_TOKEN,
        createdAt: new Date(row.CREATED_AT).getTime(),
        expiresAt: expiresAtMs
    };
}

/**
 * Delete a session by its raw session token (logout).
 * @param {string} rawSessionId - Raw session token
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteSession(rawSessionId, executor = null) {
    if (!rawSessionId || typeof rawSessionId !== "string") {
        return false;
    }

    let tokenHash;
    try {
        tokenHash = hashSessionToken(rawSessionId.trim());
    } catch {
        return false;
    }

    const result = await executeOn(
        executor,
        `DELETE FROM SESSIONS WHERE session_token_hash = :tokenHash`,
        { tokenHash }
    );

    return (result.rowsAffected || 0) > 0;
}

/**
 * Invalidate all active sessions for a specific user.
 * @param {number|string} userId - User ID
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<number>} Number of invalidated sessions
 */
async function deleteSessionsByUserId(userId, executor = null) {
    const numId = Number(userId);
    if (isNaN(numId)) return 0;

    const result = await executeOn(
        executor,
        `DELETE FROM SESSIONS WHERE user_id = :userId`,
        { userId: numId }
    );

    return result.rowsAffected || 0;
}

/**
 * Cleanup all expired sessions from the database.
 * @param {object|null} [executor] - Optional transaction executor
 * @returns {Promise<number>} Number of deleted expired sessions
 */
async function cleanupExpiredSessions(executor = null) {
    const result = await executeOn(
        executor,
        `DELETE FROM SESSIONS WHERE expires_at < CURRENT_TIMESTAMP`
    );
    return result.rowsAffected || 0;
}

module.exports = {
    DEFAULT_SESSION_TTL_MS,
    hashSessionToken,
    createSession,
    getSession,
    deleteSession,
    deleteSessionsByUserId,
    cleanupExpiredSessions
};
