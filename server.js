/**
 * server.js
 *
 * Eventify — Application entry point.
 *
 * Responsibilities:
 *   1. Load environment variables.
 *   2. Create and configure the Express application
 *      (middleware, static files, routes).
 *   3. Initialise the Oracle connection pool (if credentials are available).
 *   4. Start the HTTP server.
 *   5. Shut down gracefully on SIGINT / SIGTERM.
 *
 * Business logic, mock data, and route handling all live in src/.
 * This file is intentionally thin — it is the "wiring" layer only.
 */

"use strict";

const express = require("express");
const path    = require("path");
const cors    = require("cors");
require("dotenv").config();

const { initDB, closeDB, getIsConnected } = require("./db");

// ---------------------------------------------------------------------------
// Route modules
// ---------------------------------------------------------------------------
const healthRouter     = require("./src/routes/health.routes");
const categoriesRouter = require("./src/routes/categories.routes");
const eventsRouter     = require("./src/routes/events.routes");
const authRouter       = require("./src/routes/auth.routes");
const bookingsRouter   = require("./src/routes/bookings.routes");
const adminRouter      = require("./src/routes/admin.routes");

// ---------------------------------------------------------------------------
// Auth / Session middleware
// ---------------------------------------------------------------------------
const { cookieParserMiddleware, sessionMiddleware } = require("./src/middleware/auth.middleware");

// ---------------------------------------------------------------------------
// Error / fallback middleware
// ---------------------------------------------------------------------------
const { notFoundApiHandler, globalErrorHandler } = require("./src/middleware/error.middleware");

// ---------------------------------------------------------------------------
// Application setup
// ---------------------------------------------------------------------------
const app  = express();
const PORT = process.env.PORT || 3000;

// ---------- Core middleware ----------
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
    : null;

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins && allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        if (!isProduction) {
            try {
                const url = new URL(origin);
                if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
                    return callback(null, true);
                }
            } catch (_) {}
        }
        const corsErr = new Error("CORS policy rejected access from this origin.");
        corsErr.statusCode = 403;
        return callback(corsErr);
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParserMiddleware);
app.use(sessionMiddleware);

// ---------- Static frontend files ----------
// Express serves everything in public/ (HTML, CSS, JS assets).
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
// Health check — needs getIsConnected so it can report Oracle pool status
app.use("/api/health",      healthRouter(getIsConnected));

app.use("/api/categories",  categoriesRouter);
app.use("/api/events",      eventsRouter);
app.use("/api/auth",        authRouter);
app.use("/api/bookings",    bookingsRouter);
app.use("/api/admin",       adminRouter);

// ---------------------------------------------------------------------------
// 404 handler for unknown API routes
// Must come AFTER all /api/* route registrations.
// ---------------------------------------------------------------------------
app.all("/api/*", notFoundApiHandler);

// ---------------------------------------------------------------------------
// SPA fallback — serve index.html for any non-API GET request.
// Allows browser navigation to any page URL without a real web server.
// ---------------------------------------------------------------------------
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------------------------------------------------------------------
// Global error handler — must be registered LAST, after all routes.
// ---------------------------------------------------------------------------
app.use(globalErrorHandler);

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------
async function startServer() {
    // Attempt to connect to Oracle (silently skipped if credentials absent)
    await initDB();

    const server = app.listen(PORT, () => {
        console.log("==================================================");
        console.log(`  Eventify Server is running on http://localhost:${PORT}`);
        console.log(`  Open your browser and visit: http://localhost:${PORT}`);
        if (process.env.NODE_ENV === "production") {
            console.log("  [Security] Production mode: Development seed accounts are unconditionally disabled.");
        } else {
            console.log("  [Security] Development mode: Seed accounts active.");
        }
        console.log("==================================================");
    });

    // Graceful shutdown — close Oracle pool before exiting
    process.on("SIGINT", async () => {
        console.log("\nShutting down server gracefully...");
        server.close(async () => {
            await closeDB();
            process.exit(0);
        });
    });

    process.on("SIGTERM", async () => {
        console.log("\nShutting down server gracefully...");
        server.close(async () => {
            await closeDB();
            process.exit(0);
        });
    });
}

startServer();
