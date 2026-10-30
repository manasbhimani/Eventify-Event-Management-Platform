/**
 * src/db/repositories/category.repository.js
 *
 * Eventify — Category Repository.
 * Handles database operations for event categories.
 */

"use strict";

const { executeOn, oracledb } = require("./base.repository");

/**
 * Format a raw database row to API-compatible category contract.
 * @param {object} row - Raw row from Oracle
 * @returns {object|null} Formatted category object
 */
function formatCategory(row) {
    if (!row) return null;
    return {
        id: Number(row.CATEGORY_ID),
        name: row.NAME,
        description: row.DESCRIPTION || ""
    };
}

/**
 * Retrieve all categories ordered by ID ascending.
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<Array<object>>} List of categories
 */
async function getCategories(executor = null) {
    const result = await executeOn(
        executor,
        `SELECT category_id, name, description 
         FROM CATEGORIES 
         ORDER BY category_id ASC`
    );
    return (result.rows || []).map(formatCategory);
}

/**
 * Retrieve a category by its numeric ID.
 * @param {number|string} id - Category ID
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<object|null>} Category or null if not found
 */
async function getCategoryById(id, executor = null) {
    const numId = Number(id);
    if (isNaN(numId)) return null;

    const result = await executeOn(
        executor,
        `SELECT category_id, name, description 
         FROM CATEGORIES 
         WHERE category_id = :id`,
        { id: numId }
    );

    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return formatCategory(result.rows[0]);
}

/**
 * Retrieve a category by its name (case-insensitive).
 * @param {string} name - Category name
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<object|null>} Category or null if not found
 */
async function getCategoryByName(name, executor = null) {
    if (!name || typeof name !== "string") return null;

    const result = await executeOn(
        executor,
        `SELECT category_id, name, description 
         FROM CATEGORIES 
         WHERE LOWER(name) = LOWER(TRIM(:name))`,
        { name }
    );

    if (!result.rows || result.rows.length === 0) {
        return null;
    }
    return formatCategory(result.rows[0]);
}

/**
 * Create a new category.
 * @param {object} params - { name, description }
 * @param {object|null} executor - Optional transaction executor
 * @returns {Promise<object>} Created category
 */
async function createCategory({ name, description }, executor = null) {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
        throw new Error("Category name is required.");
    }

    const trimmedName = name.trim();
    const desc = description ? description.trim() : null;

    const result = await executeOn(
        executor,
        `INSERT INTO CATEGORIES (name, description) 
         VALUES (:name, :description)
         RETURNING category_id INTO :categoryId`,
        {
            name: trimmedName,
            description: desc,
            categoryId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
    );

    const generatedId = result.outBinds.categoryId[0];
    return {
        id: Number(generatedId),
        name: trimmedName,
        description: desc || ""
    };
}

module.exports = {
    formatCategory,
    getCategories,
    getCategoryById,
    getCategoryByName,
    createCategory
};
