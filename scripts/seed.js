/**
 * scripts/seed.js
 *
 * CLI runner for the Eventify Oracle Database Seeder.
 *
 * Usage:
 *   node scripts/seed.js
 *
 * Note:
 *   Will strictly fail if NODE_ENV === 'production'.
 */

"use strict";

require("dotenv").config();

// Enforce production guard before even loading oracledb
if (process.env.NODE_ENV === "production") {
    console.error("[Script] FATAL: Cannot run seed script in production mode (NODE_ENV=production).");
    process.exit(1);
}

const oracledb = require("oracledb");
const { dbConfig } = require("../db");
const { seedDatabase, verifySeededData } = require("../src/db/seeder");

async function main() {
    let connection;
    try {
        console.log(`[Script] Connecting to Oracle Database (${dbConfig.connectString}) as ${dbConfig.user}...`);
        connection = await oracledb.getConnection({
            user: dbConfig.user,
            password: dbConfig.password,
            connectString: dbConfig.connectString
        });

        const report = await seedDatabase(connection);
        console.log("[Script] Verifying seeded data integrity...");
        const audit = await verifySeededData(connection);

        if (!audit.allValid) {
            console.error("[Script] FATAL: Seed data verification failed!");
            console.error(audit.errors.join("\n"));
            process.exitCode = 1;
        } else {
            console.log("[Script] All foreign keys, counts, and mathematical calculations verified successfully.");
            console.log("[Script] Table counts:", JSON.stringify(audit.counts));
        }
    } catch (err) {
        console.error("[Script] Seeding failed with error:", err.message);
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
