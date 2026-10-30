/**
 * src/db/seeder.js
 *
 * Eventify — Oracle Database Development Seeder.
 *
 * Populates development seed records into the Oracle database schema:
 *   - Categories (6)
 *   - Development Users (Admin, Organizer, Attendee)
 *   - Events (6)
 *   - Bookings (2)
 *
 * Invariants:
 *   - Refuses execution if NODE_ENV === 'production' (no bypass).
 *   - Uses dynamic natural-key foreign key resolution (never hardcoded IDs).
 *   - Enforces booking ID range strictly <= EVT-2000 (never touches seq_booking_id).
 *   - Safe to rerun: skips existing records without duplicating or overwriting.
 *   - Never logs credentials, secrets, or password hashes.
 */

"use strict";

const oracledb = require("oracledb");
const { seedCategories, seedUsers, seedEvents, seedBookings } = require("../data/mock-data");

/**
 * Seed development data into the Oracle database.
 * @param {oracledb.Connection} connection - Active Oracle connection.
 * @returns {Promise<Object>} Seeding execution report.
 */
async function seedDatabase(connection) {
    // 1. Strict Production Guard (Zero Bypass)
    if (process.env.NODE_ENV === "production") {
        throw new Error("[Seeder] FATAL: Seeding development demo data is strictly prohibited in production mode.");
    }

    console.log("==================================================");
    console.log("  EVENTIFY ORACLE DEVELOPMENT SEED ENGINE");
    console.log("==================================================");

    const report = {
        categories: { inserted: 0, skipped: 0 },
        users: { inserted: 0, skipped: 0 },
        events: { inserted: 0, skipped: 0 },
        bookings: { inserted: 0, skipped: 0 }
    };

    // -----------------------------------------------------------------------
    // A. Seed Categories
    // -----------------------------------------------------------------------
    console.log("[Seeder] Processing categories...");
    for (const cat of seedCategories) {
        const checkRes = await connection.execute(
            `SELECT category_id FROM CATEGORIES WHERE name = :name`,
            { name: cat.name },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (checkRes.rows && checkRes.rows.length > 0) {
            report.categories.skipped++;
            console.log(`[Seeder] Category '${cat.name}' already exists. Skipped.`);
        } else {
            await connection.execute(
                `INSERT INTO CATEGORIES (name, description) VALUES (:name, :description)`,
                {
                    name: cat.name,
                    description: cat.description || null
                },
                { autoCommit: false }
            );
            report.categories.inserted++;
            console.log(`[Seeder] Inserted category: '${cat.name}'.`);
        }
    }
    await connection.commit();

    // -----------------------------------------------------------------------
    // B. Seed Users (Development Accounts)
    // -----------------------------------------------------------------------
    console.log("[Seeder] Processing development users...");
    for (const user of seedUsers) {
        const normalizedEmail = user.email.trim().toLowerCase();
        const checkRes = await connection.execute(
            `SELECT user_id FROM USERS WHERE email = :email`,
            { email: normalizedEmail },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (checkRes.rows && checkRes.rows.length > 0) {
            report.users.skipped++;
            console.log(`[Seeder] User with email '${normalizedEmail}' already exists. Skipped.`);
        } else {
            await connection.execute(
                `INSERT INTO USERS (
                    name, email, password_hash, role, status, created_at
                 ) VALUES (
                    :name, :email, :passwordHash, :role, 'ACTIVE',
                    TO_TIMESTAMP_TZ(:createdAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')
                 )`,
                {
                    name: user.name.trim(),
                    email: normalizedEmail,
                    passwordHash: user.passwordHash,
                    role: user.role,
                    createdAt: user.createdAt
                },
                { autoCommit: false }
            );
            report.users.inserted++;
            console.log(`[Seeder] Inserted user account for '${normalizedEmail}' [${user.role}].`);
        }
    }
    await connection.commit();

    // Build lookup map for users and categories by natural keys
    const userMapRes = await connection.execute(
        `SELECT user_id, email, role FROM USERS`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const userByEmail = new Map(userMapRes.rows.map(u => [u.EMAIL.toLowerCase(), u.USER_ID]));

    const catMapRes = await connection.execute(
        `SELECT category_id, name FROM CATEGORIES`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const catByName = new Map(catMapRes.rows.map(c => [c.NAME.toLowerCase(), c.CATEGORY_ID]));

    // Find the organizer user ID for event authorship
    const organizerId = userByEmail.get("organizer@eventify.local") || null;

    // -----------------------------------------------------------------------
    // C. Seed Events
    // -----------------------------------------------------------------------
    console.log("[Seeder] Processing baseline events...");
    for (const evt of seedEvents) {
        const checkRes = await connection.execute(
            `SELECT event_id FROM EVENTS WHERE title = :title`,
            { title: evt.title },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (checkRes.rows && checkRes.rows.length > 0) {
            report.events.skipped++;
            console.log(`[Seeder] Event '${evt.title}' already exists. Skipped.`);
        } else {
            const categoryId = catByName.get(evt.category.toLowerCase());
            if (!categoryId) {
                throw new Error(`[Seeder] Unknown category '${evt.category}' for event '${evt.title}'.`);
            }

            await connection.execute(
                `INSERT INTO EVENTS (
                    creator_id, category_id, title, event_date, city, venue, price, capacity, description, image_url, status
                 ) VALUES (
                    :creatorId, :categoryId, :title, TO_DATE(:eventDate, 'YYYY-MM-DD'),
                    :city, :venue, :price, :capacity, :description, :imageUrl, :status
                 )`,
                {
                    creatorId: organizerId,
                    categoryId,
                    title: evt.title,
                    eventDate: evt.date,
                    city: evt.city || "Surat",
                    venue: evt.venue || "Main Auditorium",
                    price: Number(evt.price) || 0,
                    capacity: Number(evt.capacity) || 100,
                    description: evt.description || "",
                    imageUrl: evt.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
                    status: evt.status || "PUBLISHED"
                },
                { autoCommit: false }
            );
            report.events.inserted++;
            console.log(`[Seeder] Inserted event: '${evt.title}'.`);
        }
    }
    await connection.commit();

    // Build lookup map for events by title
    const eventMapRes = await connection.execute(
        `SELECT event_id, title, price, TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date, venue, city 
         FROM EVENTS`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const eventByTitle = new Map(eventMapRes.rows.map(e => [e.TITLE, e]));

    // -----------------------------------------------------------------------
    // D. Seed Bookings
    // -----------------------------------------------------------------------
    console.log("[Seeder] Processing development seed bookings...");
    const attendeeId = userByEmail.get("attendee@eventify.local");
    if (!attendeeId) {
        throw new Error("[Seeder] Attendee user 'attendee@eventify.local' not found in database.");
    }

    for (const bkg of seedBookings) {
        // Enforce booking ID format and range
        if (!/^EVT-[0-9]+$/.test(bkg.id)) {
            throw new Error(`[Seeder] Invalid booking ID format: '${bkg.id}'. Expected '^EVT-[0-9]+$'`);
        }

        const numSuffix = parseInt(bkg.id.replace("EVT-", ""), 10);
        if (!Number.isInteger(numSuffix) || numSuffix >= 2001 || numSuffix < 1000) {
            throw new Error(
                `SEED_BOOKING_RANGE_VIOLATION: Seed booking ID ${bkg.id} is outside the reserved development range (EVT-1000 to EVT-2000).`
            );
        }

        const checkRes = await connection.execute(
            `SELECT booking_id FROM BOOKINGS WHERE booking_id = :id`,
            { id: bkg.id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (checkRes.rows && checkRes.rows.length > 0) {
            report.bookings.skipped++;
            console.log(`[Seeder] Booking '${bkg.id}' already exists. Skipped.`);
        } else {
            // Match event by title
            const event = eventByTitle.get(bkg.title);
            if (!event) {
                throw new Error(`[Seeder] Event '${bkg.title}' for seed booking '${bkg.id}' not found.`);
            }

            const qty = Number(bkg.quantity) || 1;
            const unitPrice = Number(event.PRICE);
            const amount = unitPrice * qty;
            const venueSnapshot = `${event.VENUE}, ${event.CITY}`;
            const dateSnapshotStr = `${event.EVENT_DATE} 10:00:00`;

            await connection.execute(
                `INSERT INTO BOOKINGS (
                    booking_id, user_id, event_id, title_snapshot, date_snapshot,
                    venue_snapshot, unit_price_snapshot, quantity, amount, status, booking_date
                 ) VALUES (
                    :id, :userId, :eventId, :titleSnapshot,
                    TO_DATE(:dateSnapshot, 'YYYY-MM-DD HH24:MI:SS'),
                    :venueSnapshot, :unitPrice, :quantity, :amount, :status,
                    CURRENT_TIMESTAMP
                 )`,
                {
                    id: bkg.id,
                    userId: attendeeId,
                    eventId: event.EVENT_ID,
                    titleSnapshot: event.TITLE,
                    dateSnapshot: dateSnapshotStr,
                    venueSnapshot,
                    unitPrice,
                    quantity: qty,
                    amount,
                    status: bkg.status || "CONFIRMED"
                },
                { autoCommit: false }
            );
            report.bookings.inserted++;
            console.log(`[Seeder] Inserted seed booking '${bkg.id}' for '${event.TITLE}' (Qty: ${qty}, Amount: ₹${amount}).`);
        }
    }
    await connection.commit();

    console.log("==================================================");
    console.log("  SEEDING COMPLETE SUMMARY:");
    console.log(`  Categories : ${report.categories.inserted} inserted, ${report.categories.skipped} skipped`);
    console.log(`  Users      : ${report.users.inserted} inserted, ${report.users.skipped} skipped`);
    console.log(`  Events     : ${report.events.inserted} inserted, ${report.events.skipped} skipped`);
    console.log(`  Bookings   : ${report.bookings.inserted} inserted, ${report.bookings.skipped} skipped`);
    console.log("==================================================");

    return report;
}

/**
 * Perform post-seeding verification of foreign keys, counts, and check constraints.
 * @param {oracledb.Connection} connection
 * @returns {Promise<Object>} Verification audit result.
 */
async function verifySeededData(connection) {
    const audit = {
        allValid: true,
        errors: [],
        counts: {}
    };

    // 1. Table Counts
    const catCount = await connection.execute(`SELECT COUNT(*) AS CNT FROM CATEGORIES`);
    const userCount = await connection.execute(`SELECT COUNT(*) AS CNT FROM USERS`);
    const eventCount = await connection.execute(`SELECT COUNT(*) AS CNT FROM EVENTS`);
    const bookingCount = await connection.execute(`SELECT COUNT(*) AS CNT FROM BOOKINGS`);

    audit.counts = {
        categories: catCount.rows[0][0],
        users: userCount.rows[0][0],
        events: eventCount.rows[0][0],
        bookings: bookingCount.rows[0][0]
    };

    if (audit.counts.categories < 6) {
        audit.allValid = false;
        audit.errors.push(`Expected at least 6 categories, found ${audit.counts.categories}`);
    }
    if (audit.counts.users < 3) {
        audit.allValid = false;
        audit.errors.push(`Expected at least 3 users, found ${audit.counts.users}`);
    }
    if (audit.counts.events < 6) {
        audit.allValid = false;
        audit.errors.push(`Expected at least 6 events, found ${audit.counts.events}`);
    }
    if (audit.counts.bookings < 2) {
        audit.allValid = false;
        audit.errors.push(`Expected at least 2 bookings, found ${audit.counts.bookings}`);
    }

    // 2. Foreign Key Integrity Checks
    // Bookings -> Users
    const orphanedBookingUsers = await connection.execute(
        `SELECT b.booking_id FROM BOOKINGS b LEFT JOIN USERS u ON b.user_id = u.user_id WHERE u.user_id IS NULL`
    );
    if (orphanedBookingUsers.rows && orphanedBookingUsers.rows.length > 0) {
        audit.allValid = false;
        audit.errors.push(`Found orphaned bookings with invalid user_id: ${orphanedBookingUsers.rows.length}`);
    }

    // Bookings -> Events
    const orphanedBookingEvents = await connection.execute(
        `SELECT b.booking_id FROM BOOKINGS b LEFT JOIN EVENTS e ON b.event_id = e.event_id WHERE e.event_id IS NULL`
    );
    if (orphanedBookingEvents.rows && orphanedBookingEvents.rows.length > 0) {
        audit.allValid = false;
        audit.errors.push(`Found orphaned bookings with invalid event_id: ${orphanedBookingEvents.rows.length}`);
    }

    // Events -> Categories
    const orphanedEventCats = await connection.execute(
        `SELECT e.event_id FROM EVENTS e LEFT JOIN CATEGORIES c ON e.category_id = c.category_id WHERE c.category_id IS NULL`
    );
    if (orphanedEventCats.rows && orphanedEventCats.rows.length > 0) {
        audit.allValid = false;
        audit.errors.push(`Found orphaned events with invalid category_id: ${orphanedEventCats.rows.length}`);
    }

    // 3. Monetary and Calculation Verification
    const invalidAmounts = await connection.execute(
        `SELECT booking_id, amount, unit_price_snapshot, quantity 
         FROM BOOKINGS 
         WHERE amount != (unit_price_snapshot * quantity)`
    );
    if (invalidAmounts.rows && invalidAmounts.rows.length > 0) {
        audit.allValid = false;
        audit.errors.push(`Found bookings violating amount = unit_price * quantity: ${invalidAmounts.rows.length}`);
    }

    // 4. Sequence Range Verification (No bookings >= 2001)
    const rangeViolations = await connection.execute(
        `SELECT booking_id FROM BOOKINGS WHERE TO_NUMBER(SUBSTR(booking_id, 5)) >= 2001`
    );
    if (rangeViolations.rows && rangeViolations.rows.length > 0) {
        audit.allValid = false;
        audit.errors.push(`Found seed bookings violating range (< 2001): ${rangeViolations.rows.length}`);
    }

    return audit;
}

module.exports = {
    seedDatabase,
    verifySeededData
};
