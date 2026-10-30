/**
 * scripts/migrate.js
 *
 * CLI runner for the Eventify Oracle Database Migration Engine.
 *
 * Usage:
 *   node scripts/migrate.js
 */

"use strict";

require("dotenv").config();
const oracledb = require("oracledb");
const { dbConfig } = require("../db");
const { runMigration } = require("../src/db/migrator");

async function main() {
    let connection;
    try {
        console.log(`[Script] Connecting to Oracle Database (${dbConfig.connectString}) as ${dbConfig.user}...`);
        connection = await oracledb.getConnection({
            user: dbConfig.user,
            password: dbConfig.password,
            connectString: dbConfig.connectString
        });

        const result = await runMigration(connection);
        console.log("[Script] Migration runner result:", result.status);
    } catch (err) {
        console.error("[Script] Migration failed with error:", err.message);
        process.exitCode = 1;
    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log("[Script] Database connection closed cleanly.");
            } catch (closeErr) {
                console.error("[Script] Error closing connection:", closeErr.message);
            }
        }
    }
}

main();
