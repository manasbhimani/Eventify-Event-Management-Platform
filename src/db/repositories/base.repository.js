/**
 * src/db/repositories/base.repository.js
 *
 * Eventify — Base Repository Utilities.
 *
 * Provides shared execution helpers to unify standalone queries (via db.executeQuery)
 * and transaction-scoped queries (via tx.execute) with strict bind parametrization.
 */

"use strict";

const oracledb = require("oracledb");
const db = require("../../../db");

/**
 * Execute a SQL statement on a transaction executor if provided,
 * or against the database connection pool if standalone.
 *
 * @param {object|null} executor - Optional transaction client ({ execute }) or null.
 * @param {string} sql - Parameterized SQL statement.
 * @param {object|array} binds - Parameter bindings.
 * @param {object} options - Additional execution options.
 * @returns {Promise<object>} Oracle execution result.
 */
async function executeOn(executor, sql, binds = {}, options = {}) {
    if (executor && typeof executor.execute === "function") {
        return executor.execute(sql, binds, options);
    }
    return db.executeQuery(sql, binds, options);
}

module.exports = {
    executeOn,
    oracledb,
    withTransaction: db.withTransaction,
    mapOracleError: db.mapOracleError
};
