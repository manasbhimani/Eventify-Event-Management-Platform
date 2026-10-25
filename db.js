/**
 * Database Connection Module for Eventify
 * Uses node-oracledb (Thin mode by default in v6+)
 */

const oracledb = require("oracledb");
require("dotenv").config();

let pool = null;
let isConnected = false;

const dbConfig = {
    user: process.env.DB_USER || "eventify_admin",
    password: process.env.DB_PASSWORD || "",
    connectString: process.env.DB_CONNECT_STRING || "localhost:1521/XEPDB1",
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 2
};

/**
 * Initialize Oracle connection pool
 */
async function initDB() {
    if (!dbConfig.password) {
        console.warn("[Database] Warning: DB_PASSWORD is not set in .env. Oracle connection pool skipped.");
        return false;
    }

    try {
        pool = await oracledb.createPool(dbConfig);
        isConnected = true;
        console.log(`[Database] Connected successfully to Oracle Database (${dbConfig.connectString})`);
        return true;
    } catch (err) {
        console.warn(`[Database] Could not connect to Oracle Database: ${err.message}`);
        console.warn("[Database] The server will run in offline/fallback mode for testing.");
        return false;
    }
}

/**
 * Execute a SQL query using the connection pool
 * @param {string} sql - SQL query string
 * @param {object|array} binds - Bind parameters
 * @param {object} options - Execution options
 */
async function executeQuery(sql, binds = {}, options = {}) {
    if (!pool) {
        throw new Error("Database connection pool is not initialized. Please configure Oracle DB credentials.");
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const defaultOptions = {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: true,
            ...options
        };
        const result = await connection.execute(sql, binds, defaultOptions);
        return result;
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (closeErr) {
                console.error("[Database] Error closing connection:", closeErr);
            }
        }
    }
}

/**
 * Close database pool on server shutdown
 */
async function closeDB() {
    if (pool) {
        try {
            await pool.close(10);
            isConnected = false;
            console.log("[Database] Oracle connection pool closed.");
        } catch (err) {
            console.error("[Database] Error closing Oracle connection pool:", err);
        }
    }
}

module.exports = {
    initDB,
    executeQuery,
    closeDB,
    getIsConnected: () => isConnected,
    dbConfig
};
