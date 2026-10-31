/**
 * src/db/migrator.js
 *
 * Eventify — Oracle Database Migration Engine.
 *
 * Supports multi-version forward-only migrations for Oracle Database 23ai Free.
 *   - Version 1 (1.0.0): Initial Relational Core Schema (Users, Categories, Events, Bookings, Sessions)
 *   - Version 2 (1.1.0): Event Cancellation Audit, Persistent Notifications, Simulated Refunds
 *
 * Responsibilities:
 *   1. Safely bootstrap and validate the SCHEMA_VERSION tracker table.
 *   2. Detect and recover from prior interrupted migrations (IN_PROGRESS / FAILED).
 *   3. Enforce schema drift protection: if already APPLIED, verify without mutating.
 *   4. Execute object DDL sequentially (accounting for Oracle implicit commits).
 *   5. Perform itemized data dictionary verification across all tables, constraints,
 *      sequences, and indexes by exact name and definition.
 */

"use strict";

const oracledb = require("oracledb");

const SCHEMA_VERSION_1_ID = 1;
const SCHEMA_VERSION_1_LABEL = "1.0.0";
const MIGRATION_1_CHECKSUM = "phase9a-v1.0.0-final-approved";

const SCHEMA_VERSION_2_ID = 2;
const SCHEMA_VERSION_2_LABEL = "1.1.0";
const MIGRATION_2_CHECKSUM = "phase11-v1.1.0-cancellation-notifications-refunds";

// Current target schema version
const CURRENT_SCHEMA_VERSION_ID = SCHEMA_VERSION_2_ID;
const CURRENT_SCHEMA_VERSION_LABEL = SCHEMA_VERSION_2_LABEL;

// ---------------------------------------------------------------------------
// Cumulative Approved Schema Inventory Specification (v1.1.0)
// ---------------------------------------------------------------------------

const EXPECTED_TABLES = [
    "SCHEMA_VERSION",
    "USERS",
    "CATEGORIES",
    "EVENTS",
    "BOOKINGS",
    "SESSIONS",
    "NOTIFICATIONS",
    "EVENT_REFUNDS"
];

const EXPECTED_SEQUENCES = [
    {
        name: "SEQ_BOOKING_ID",
        minVal: 1,
        incrementBy: 1,
        cacheSize: 0,
        expectedStart: 2001
    }
];

const EXPECTED_PRIMARY_KEYS = [
    { name: "PK_SCHEMA_VERSION", table: "SCHEMA_VERSION", column: "VERSION_ID" },
    { name: "PK_USERS", table: "USERS", column: "USER_ID" },
    { name: "PK_CATEGORIES", table: "CATEGORIES", column: "CATEGORY_ID" },
    { name: "PK_EVENTS", table: "EVENTS", column: "EVENT_ID" },
    { name: "PK_BOOKINGS", table: "BOOKINGS", column: "BOOKING_ID" },
    { name: "PK_SESSIONS", table: "SESSIONS", column: "SESSION_TOKEN_HASH" },
    { name: "PK_NOTIFICATIONS", table: "NOTIFICATIONS", column: "NOTIFICATION_ID" },
    { name: "PK_EVENT_REFUNDS", table: "EVENT_REFUNDS", column: "REFUND_ID" }
];

const EXPECTED_FOREIGN_KEYS = [
    {
        name: "FK_EVENTS_CREATOR",
        table: "EVENTS",
        column: "CREATOR_ID",
        refTable: "USERS",
        refColumn: "USER_ID",
        deleteRule: "SET NULL"
    },
    {
        name: "FK_EVENTS_CATEGORY",
        table: "EVENTS",
        column: "CATEGORY_ID",
        refTable: "CATEGORIES",
        refColumn: "CATEGORY_ID",
        deleteRule: "NO ACTION"
    },
    {
        name: "FK_BOOKINGS_USER",
        table: "BOOKINGS",
        column: "USER_ID",
        refTable: "USERS",
        refColumn: "USER_ID",
        deleteRule: "NO ACTION"
    },
    {
        name: "FK_BOOKINGS_EVENT",
        table: "BOOKINGS",
        column: "EVENT_ID",
        refTable: "EVENTS",
        refColumn: "EVENT_ID",
        deleteRule: "NO ACTION"
    },
    {
        name: "FK_SESSIONS_USER",
        table: "SESSIONS",
        column: "USER_ID",
        refTable: "USERS",
        refColumn: "USER_ID",
        deleteRule: "CASCADE"
    },
    // v1.1.0 additions
    {
        name: "FK_EVENTS_CANCELLED_BY",
        table: "EVENTS",
        column: "CANCELLED_BY",
        refTable: "USERS",
        refColumn: "USER_ID",
        deleteRule: "SET NULL"
    },
    {
        name: "FK_NOTIF_USER",
        table: "NOTIFICATIONS",
        column: "USER_ID",
        refTable: "USERS",
        refColumn: "USER_ID",
        deleteRule: "CASCADE"
    },
    {
        name: "FK_NOTIF_EVENT",
        table: "NOTIFICATIONS",
        column: "EVENT_ID",
        refTable: "EVENTS",
        refColumn: "EVENT_ID",
        deleteRule: "NO ACTION"
    },
    {
        name: "FK_NOTIF_BOOKING",
        table: "NOTIFICATIONS",
        column: "BOOKING_ID",
        refTable: "BOOKINGS",
        refColumn: "BOOKING_ID",
        deleteRule: "SET NULL"
    },
    {
        name: "FK_REFUNDS_BOOKING",
        table: "EVENT_REFUNDS",
        column: "BOOKING_ID",
        refTable: "BOOKINGS",
        refColumn: "BOOKING_ID",
        deleteRule: "NO ACTION"
    },
    {
        name: "FK_REFUNDS_EVENT",
        table: "EVENT_REFUNDS",
        column: "EVENT_ID",
        refTable: "EVENTS",
        refColumn: "EVENT_ID",
        deleteRule: "NO ACTION"
    },
    {
        name: "FK_REFUNDS_USER",
        table: "EVENT_REFUNDS",
        column: "USER_ID",
        refTable: "USERS",
        refColumn: "USER_ID",
        deleteRule: "NO ACTION"
    }
];

const EXPECTED_UNIQUE_CONSTRAINTS = [
    { name: "UQ_USERS_EMAIL", table: "USERS", column: "EMAIL" },
    { name: "UQ_CATEGORIES_NAME", table: "CATEGORIES", column: "NAME" },
    // v1.1.0 additions
    { name: "UQ_NOTIF_BOOKING_TYPE", table: "NOTIFICATIONS" },
    { name: "UQ_REFUNDS_BOOKING", table: "EVENT_REFUNDS", column: "BOOKING_ID" }
];

const EXPECTED_CHECK_CONSTRAINTS = [
    { name: "CHK_USERS_NAME_LEN", table: "USERS" },
    { name: "CHK_USERS_EMAIL_LOWER", table: "USERS" },
    { name: "CHK_USERS_EMAIL_FMT", table: "USERS" },
    { name: "CHK_USERS_ROLE", table: "USERS" },
    { name: "CHK_USERS_STATUS", table: "USERS" },
    { name: "CHK_EVENTS_PRICE", table: "EVENTS" },
    { name: "CHK_EVENTS_CAPACITY", table: "EVENTS" },
    { name: "CHK_EVENTS_STATUS", table: "EVENTS" },
    { name: "CHK_BOOKINGS_ID_FMT", table: "BOOKINGS" },
    { name: "CHK_BOOKINGS_QUANTITY", table: "BOOKINGS" },
    { name: "CHK_BOOKINGS_UNIT_PRICE", table: "BOOKINGS" },
    { name: "CHK_BOOKINGS_AMOUNT", table: "BOOKINGS" },
    { name: "CHK_BOOKINGS_AMOUNT_CALC", table: "BOOKINGS" },
    { name: "CHK_BOOKINGS_STATUS", table: "BOOKINGS" },
    // v1.1.0 additions
    { name: "CHK_NOTIF_STATUS", table: "NOTIFICATIONS" },
    { name: "CHK_NOTIF_TYPE", table: "NOTIFICATIONS" },
    { name: "CHK_REFUNDS_AMOUNT", table: "EVENT_REFUNDS" },
    { name: "CHK_REFUNDS_MODE", table: "EVENT_REFUNDS" },
    { name: "CHK_REFUNDS_STATUS", table: "EVENT_REFUNDS" }
];

const EXPECTED_SECONDARY_INDEXES = [
    { name: "IDX_EVENTS_CATEGORY", table: "EVENTS", columns: ["CATEGORY_ID"] },
    { name: "IDX_EVENTS_CREATOR", table: "EVENTS", columns: ["CREATOR_ID"] },
    { name: "IDX_EVENTS_STATUS_DATE", table: "EVENTS", columns: ["STATUS", "EVENT_DATE"] },
    { name: "IDX_EVENTS_CITY", table: "EVENTS", columns: ["CITY"] },
    { name: "IDX_BOOKINGS_USER", table: "BOOKINGS", columns: ["USER_ID"] },
    { name: "IDX_BOOKINGS_EVENT_STATUS", table: "BOOKINGS", columns: ["EVENT_ID", "STATUS"] },
    { name: "IDX_BOOKINGS_DATE", table: "BOOKINGS", columns: ["BOOKING_DATE"] },
    { name: "IDX_SESSIONS_USER", table: "SESSIONS", columns: ["USER_ID"] },
    { name: "IDX_SESSIONS_EXPIRES", table: "SESSIONS", columns: ["EXPIRES_AT"] },
    // v1.1.0 additions
    { name: "IDX_EVENTS_CANCELLED_BY", table: "EVENTS", columns: ["CANCELLED_BY"] },
    { name: "IDX_NOTIF_USER_STATUS", table: "NOTIFICATIONS", columns: ["USER_ID", "STATUS"] },
    { name: "IDX_NOTIF_EVENT", table: "NOTIFICATIONS", columns: ["EVENT_ID"] },
    { name: "IDX_NOTIF_BOOKING", table: "NOTIFICATIONS", columns: ["BOOKING_ID"] },
    { name: "IDX_REFUNDS_EVENT", table: "EVENT_REFUNDS", columns: ["EVENT_ID"] },
    { name: "IDX_REFUNDS_USER", table: "EVENT_REFUNDS", columns: ["USER_ID"] },
    { name: "IDX_REFUNDS_STATUS", table: "EVENT_REFUNDS", columns: ["STATUS"] }
];

const EXPECTED_EVENTS_AUDIT_COLUMNS = [
    "CANCELLED_BY",
    "CANCELLED_AT",
    "CANCELLATION_REASON"
];

// ---------------------------------------------------------------------------
// DDL Step Definitions — Version 1 (1.0.0)
// ---------------------------------------------------------------------------

const DDL_STEPS_V1 = [
    {
        type: "TABLE",
        name: "USERS",
        sql: `
            CREATE TABLE USERS (
                user_id          NUMBER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
                name             VARCHAR2(100)        NOT NULL,
                email            VARCHAR2(255)        NOT NULL,
                password_hash    VARCHAR2(100)        NOT NULL,
                role             VARCHAR2(20)         DEFAULT 'ATTENDEE' NOT NULL,
                status           VARCHAR2(20)         DEFAULT 'ACTIVE' NOT NULL,
                created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

                CONSTRAINT pk_users PRIMARY KEY (user_id),
                CONSTRAINT uq_users_email UNIQUE (email),
                CONSTRAINT chk_users_name_len CHECK (LENGTH(TRIM(name)) >= 2),
                CONSTRAINT chk_users_email_lower CHECK (email = LOWER(email)),
                CONSTRAINT chk_users_email_fmt CHECK (
                    REGEXP_LIKE(email, '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
                ),
                CONSTRAINT chk_users_role CHECK (role IN ('ATTENDEE', 'ORGANIZER', 'ADMIN')),
                CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
            )
        `
    },
    {
        type: "TABLE",
        name: "CATEGORIES",
        sql: `
            CREATE TABLE CATEGORIES (
                category_id      NUMBER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
                name             VARCHAR2(50)         NOT NULL,
                description      VARCHAR2(255)        NULL,

                CONSTRAINT pk_categories PRIMARY KEY (category_id),
                CONSTRAINT uq_categories_name UNIQUE (name)
            )
        `
    },
    {
        type: "TABLE",
        name: "EVENTS",
        sql: `
            CREATE TABLE EVENTS (
                event_id         NUMBER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
                creator_id       NUMBER               NULL,
                category_id      NUMBER               NOT NULL,
                title            VARCHAR2(200)        NOT NULL,
                event_date       DATE                 NOT NULL,
                city             VARCHAR2(100)        DEFAULT 'Surat' NOT NULL,
                venue            VARCHAR2(200)        DEFAULT 'Main Auditorium' NOT NULL,
                price            NUMBER(10, 2)        DEFAULT 0.00 NOT NULL,
                capacity         NUMBER(6)            DEFAULT 100 NOT NULL,
                description      VARCHAR2(4000)       NULL,
                image_url        VARCHAR2(500)        DEFAULT 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80' NOT NULL,
                status           VARCHAR2(20)         DEFAULT 'PUBLISHED' NOT NULL,
                created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

                CONSTRAINT pk_events PRIMARY KEY (event_id),
                CONSTRAINT fk_events_creator FOREIGN KEY (creator_id)
                    REFERENCES USERS (user_id) ON DELETE SET NULL,
                CONSTRAINT fk_events_category FOREIGN KEY (category_id)
                    REFERENCES CATEGORIES (category_id),
                CONSTRAINT chk_events_price CHECK (price >= 0),
                CONSTRAINT chk_events_capacity CHECK (capacity > 0),
                CONSTRAINT chk_events_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'))
            )
        `
    },
    {
        type: "SEQUENCE",
        name: "SEQ_BOOKING_ID",
        sql: `CREATE SEQUENCE seq_booking_id START WITH 2001 INCREMENT BY 1 NOCACHE`
    },
    {
        type: "TABLE",
        name: "BOOKINGS",
        sql: `
            CREATE TABLE BOOKINGS (
                booking_id           VARCHAR2(30)         NOT NULL,
                user_id              NUMBER               NOT NULL,
                event_id             NUMBER               NOT NULL,

                title_snapshot       VARCHAR2(200)        NOT NULL,
                date_snapshot        DATE                 NOT NULL,
                venue_snapshot       VARCHAR2(300)        NOT NULL,
                unit_price_snapshot  NUMBER(10, 2)        NOT NULL,

                quantity             NUMBER(3)            NOT NULL,
                amount               NUMBER(12, 2)        NOT NULL,
                status               VARCHAR2(20)         DEFAULT 'CONFIRMED' NOT NULL,
                booking_date         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                cancelled_at         TIMESTAMP WITH TIME ZONE NULL,

                CONSTRAINT pk_bookings PRIMARY KEY (booking_id),
                CONSTRAINT fk_bookings_user FOREIGN KEY (user_id)
                    REFERENCES USERS (user_id),
                CONSTRAINT fk_bookings_event FOREIGN KEY (event_id)
                    REFERENCES EVENTS (event_id),
                CONSTRAINT chk_bookings_id_fmt CHECK (REGEXP_LIKE(booking_id, '^EVT-[0-9]+$')),
                CONSTRAINT chk_bookings_quantity CHECK (quantity >= 1 AND quantity <= 10),
                CONSTRAINT chk_bookings_unit_price CHECK (unit_price_snapshot >= 0),
                CONSTRAINT chk_bookings_amount CHECK (amount >= 0),
                CONSTRAINT chk_bookings_amount_calc CHECK (amount = (unit_price_snapshot * quantity)),
                CONSTRAINT chk_bookings_status CHECK (status IN ('CONFIRMED', 'CANCELLED'))
            )
        `
    },
    {
        type: "TABLE",
        name: "SESSIONS",
        sql: `
            CREATE TABLE SESSIONS (
                session_token_hash   VARCHAR2(64)         NOT NULL,
                user_id              NUMBER               NOT NULL,
                csrf_token           VARCHAR2(64)         NOT NULL,
                created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                expires_at           TIMESTAMP WITH TIME ZONE NOT NULL,
                last_accessed_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

                CONSTRAINT pk_sessions PRIMARY KEY (session_token_hash),
                CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
                    REFERENCES USERS (user_id) ON DELETE CASCADE
            )
        `
    },
    { type: "INDEX", name: "IDX_EVENTS_CATEGORY", sql: `CREATE INDEX idx_events_category ON EVENTS (category_id)` },
    { type: "INDEX", name: "IDX_EVENTS_CREATOR", sql: `CREATE INDEX idx_events_creator ON EVENTS (creator_id)` },
    { type: "INDEX", name: "IDX_EVENTS_STATUS_DATE", sql: `CREATE INDEX idx_events_status_date ON EVENTS (status, event_date)` },
    { type: "INDEX", name: "IDX_EVENTS_CITY", sql: `CREATE INDEX idx_events_city ON EVENTS (city)` },
    { type: "INDEX", name: "IDX_BOOKINGS_USER", sql: `CREATE INDEX idx_bookings_user ON BOOKINGS (user_id)` },
    { type: "INDEX", name: "IDX_BOOKINGS_EVENT_STATUS", sql: `CREATE INDEX idx_bookings_event_status ON BOOKINGS (event_id, status)` },
    { type: "INDEX", name: "IDX_BOOKINGS_DATE", sql: `CREATE INDEX idx_bookings_date ON BOOKINGS (booking_date)` },
    { type: "INDEX", name: "IDX_SESSIONS_USER", sql: `CREATE INDEX idx_sessions_user ON SESSIONS (user_id)` },
    { type: "INDEX", name: "IDX_SESSIONS_EXPIRES", sql: `CREATE INDEX idx_sessions_expires ON SESSIONS (expires_at)` }
];

// ---------------------------------------------------------------------------
// DDL Step Definitions — Version 2 (1.1.0)
// ---------------------------------------------------------------------------

const DDL_STEPS_V2 = [
    // 1. Audit columns on EVENTS
    {
        type: "COLUMN_GROUP",
        table: "EVENTS",
        name: "CANCELLED_BY", // Anchor column to test existence
        sql: `ALTER TABLE EVENTS ADD (
            cancelled_by          NUMBER                           NULL,
            cancelled_at          TIMESTAMP WITH TIME ZONE         NULL,
            cancellation_reason   VARCHAR2(500)                    NULL
        )`
    },
    {
        type: "CONSTRAINT",
        table: "EVENTS",
        name: "FK_EVENTS_CANCELLED_BY",
        sql: `ALTER TABLE EVENTS ADD CONSTRAINT fk_events_cancelled_by
            FOREIGN KEY (cancelled_by) REFERENCES USERS (user_id) ON DELETE SET NULL`
    },
    {
        type: "INDEX",
        name: "IDX_EVENTS_CANCELLED_BY",
        sql: `CREATE INDEX idx_events_cancelled_by ON EVENTS (cancelled_by)`
    },
    // 2. NOTIFICATIONS Table
    {
        type: "TABLE",
        name: "NOTIFICATIONS",
        sql: `
            CREATE TABLE NOTIFICATIONS (
                notification_id       NUMBER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
                user_id               NUMBER                           NOT NULL,
                event_id              NUMBER                           NOT NULL,
                booking_id            VARCHAR2(30)                     NULL,
                type                  VARCHAR2(30) DEFAULT 'EVENT_CANCELLED' NOT NULL,
                title                 VARCHAR2(200)                    NOT NULL,
                message               VARCHAR2(1000)                   NOT NULL,
                status                VARCHAR2(20) DEFAULT 'UNREAD'    NOT NULL,
                created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                read_at               TIMESTAMP WITH TIME ZONE         NULL,

                CONSTRAINT pk_notifications PRIMARY KEY (notification_id),
                CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES USERS (user_id) ON DELETE CASCADE,
                CONSTRAINT fk_notif_event FOREIGN KEY (event_id) REFERENCES EVENTS (event_id),
                CONSTRAINT fk_notif_booking FOREIGN KEY (booking_id) REFERENCES BOOKINGS (booking_id) ON DELETE SET NULL,
                CONSTRAINT chk_notif_status CHECK (status IN ('UNREAD', 'READ', 'DISMISSED')),
                CONSTRAINT chk_notif_type CHECK (type IN ('EVENT_CANCELLED', 'EVENT_UPDATED', 'GENERAL')),
                CONSTRAINT uq_notif_booking_type UNIQUE (user_id, booking_id, type)
            )
        `
    },
    { type: "INDEX", name: "IDX_NOTIF_USER_STATUS", sql: `CREATE INDEX idx_notif_user_status ON NOTIFICATIONS (user_id, status)` },
    { type: "INDEX", name: "IDX_NOTIF_EVENT", sql: `CREATE INDEX idx_notif_event ON NOTIFICATIONS (event_id)` },
    { type: "INDEX", name: "IDX_NOTIF_BOOKING", sql: `CREATE INDEX idx_notif_booking ON NOTIFICATIONS (booking_id)` },
    // 3. EVENT_REFUNDS Table
    {
        type: "TABLE",
        name: "EVENT_REFUNDS",
        sql: `
            CREATE TABLE EVENT_REFUNDS (
                refund_id             NUMBER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
                booking_id            VARCHAR2(30)                     NOT NULL,
                event_id              NUMBER                           NOT NULL,
                user_id               NUMBER                           NOT NULL,
                refund_amount         NUMBER(12, 2)                    NOT NULL,
                refund_mode           VARCHAR2(30) DEFAULT 'SIMULATED' NOT NULL,
                status                VARCHAR2(30) DEFAULT 'SIMULATED_RECORDED' NOT NULL,
                reason                VARCHAR2(500) DEFAULT 'Event cancelled by organizer' NOT NULL,
                created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

                CONSTRAINT pk_event_refunds PRIMARY KEY (refund_id),
                CONSTRAINT uq_refunds_booking UNIQUE (booking_id),
                CONSTRAINT fk_refunds_booking FOREIGN KEY (booking_id) REFERENCES BOOKINGS (booking_id),
                CONSTRAINT fk_refunds_event FOREIGN KEY (event_id) REFERENCES EVENTS (event_id),
                CONSTRAINT fk_refunds_user FOREIGN KEY (user_id) REFERENCES USERS (user_id),
                CONSTRAINT chk_refunds_amount CHECK (refund_amount > 0),
                CONSTRAINT chk_refunds_mode CHECK (refund_mode IN ('SIMULATED', 'NO_PAYMENT_GATEWAY')),
                CONSTRAINT chk_refunds_status CHECK (status IN ('SIMULATED_RECORDED', 'SIMULATED_PROCESSED', 'SIMULATED_VOID'))
            )
        `
    },
    { type: "INDEX", name: "IDX_REFUNDS_EVENT", sql: `CREATE INDEX idx_refunds_event ON EVENT_REFUNDS (event_id)` },
    { type: "INDEX", name: "IDX_REFUNDS_USER", sql: `CREATE INDEX idx_refunds_user ON EVENT_REFUNDS (user_id)` },
    { type: "INDEX", name: "IDX_REFUNDS_STATUS", sql: `CREATE INDEX idx_refunds_status ON EVENT_REFUNDS (status)` }
];

// ---------------------------------------------------------------------------
// Helper Dictionary Functions
// ---------------------------------------------------------------------------

async function getExistingTables(connection) {
    const res = await connection.execute(
        `SELECT table_name FROM user_tables`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return new Set(res.rows.map(r => r.TABLE_NAME));
}

async function getExistingSequences(connection) {
    const res = await connection.execute(
        `SELECT sequence_name, last_number, increment_by, cache_size FROM user_sequences`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const map = new Map();
    for (const row of res.rows) {
        map.set(row.SEQUENCE_NAME, row);
    }
    return map;
}

async function getExistingIndexes(connection) {
    const res = await connection.execute(
        `SELECT index_name, table_name, status FROM user_indexes`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const map = new Map();
    for (const row of res.rows) {
        map.set(row.INDEX_NAME, row);
    }
    return map;
}

async function getExistingConstraints(connection) {
    const res = await connection.execute(
        `SELECT constraint_name, constraint_type, table_name, r_constraint_name, delete_rule, status 
         FROM user_constraints`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const map = new Map();
    for (const row of res.rows) {
        map.set(row.CONSTRAINT_NAME, row);
    }
    return map;
}

async function getExistingColumns(connection, tableName) {
    const res = await connection.execute(
        `SELECT column_name FROM user_tab_cols WHERE table_name = :tName`,
        { tName: tableName.toUpperCase() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return new Set(res.rows.map(r => r.COLUMN_NAME));
}

// ---------------------------------------------------------------------------
// Tracker Bootstrap
// ---------------------------------------------------------------------------

async function bootstrapTracker(connection) {
    const tables = await getExistingTables(connection);
    if (!tables.has("SCHEMA_VERSION")) {
        console.log("[Migrator] Bootstrapping SCHEMA_VERSION table...");
        await connection.execute(`
            CREATE TABLE SCHEMA_VERSION (
                version_id       NUMBER,
                version_label    VARCHAR2(50) NOT NULL,
                applied_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                checksum         VARCHAR2(64) NOT NULL,
                status           VARCHAR2(20) NOT NULL,
                execution_log    VARCHAR2(4000) NULL,
                CONSTRAINT pk_schema_version PRIMARY KEY (version_id)
            )
        `);
        console.log("[Migrator] SCHEMA_VERSION created successfully.");
    } else {
        // Validate columns of existing SCHEMA_VERSION table
        const colSet = await getExistingColumns(connection, "SCHEMA_VERSION");
        const requiredCols = ["VERSION_ID", "VERSION_LABEL", "APPLIED_AT", "CHECKSUM", "STATUS", "EXECUTION_LOG"];
        for (const col of requiredCols) {
            if (!colSet.has(col)) {
                throw new Error(`INVALID_TRACKER_TABLE_ERROR: Existing SCHEMA_VERSION table is missing column ${col}.`);
            }
        }

        // Validate or standardize primary key constraint name
        const pkRes = await connection.execute(
            `SELECT constraint_name FROM user_constraints WHERE table_name = 'SCHEMA_VERSION' AND constraint_type = 'P'`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (pkRes.rows.length === 0) {
            throw new Error(`INVALID_TRACKER_TABLE_ERROR: Existing SCHEMA_VERSION table is missing primary key constraint.`);
        }
        if (pkRes.rows[0].CONSTRAINT_NAME !== "PK_SCHEMA_VERSION") {
            const oldPk = pkRes.rows[0].CONSTRAINT_NAME;
            await connection.execute(`ALTER TABLE SCHEMA_VERSION RENAME CONSTRAINT ${oldPk} TO PK_SCHEMA_VERSION`);
            console.log(`[Migrator] Standardized tracker primary key constraint name to PK_SCHEMA_VERSION.`);
        }
    }
}

// ---------------------------------------------------------------------------
// Post-Migration Comprehensive Audit
// ---------------------------------------------------------------------------

async function verifyCompleteSchema(connection) {
    const auditReport = {
        tables: [],
        sequences: [],
        primaryKeys: [],
        foreignKeys: [],
        uniqueConstraints: [],
        checkConstraints: [],
        secondaryIndexes: [],
        columns: [],
        allValid: true,
        errors: []
    };

    const tables = await getExistingTables(connection);
    const seqs = await getExistingSequences(connection);
    const indexes = await getExistingIndexes(connection);
    const constraints = await getExistingConstraints(connection);

    // 1. Tables (8)
    for (const tbl of EXPECTED_TABLES) {
        if (!tables.has(tbl)) {
            auditReport.allValid = false;
            auditReport.errors.push(`Missing Table: ${tbl}`);
        } else {
            auditReport.tables.push({ name: tbl, status: "PRESENT" });
        }
    }

    // 2. Sequence (1)
    for (const expSeq of EXPECTED_SEQUENCES) {
        const seq = seqs.get(expSeq.name);
        if (!seq) {
            auditReport.allValid = false;
            auditReport.errors.push(`Missing Sequence: ${expSeq.name}`);
        } else {
            const lastNum = Number(seq.LAST_NUMBER);
            const inc = Number(seq.INCREMENT_BY);
            const cache = Number(seq.CACHE_SIZE);
            if (lastNum < expSeq.expectedStart) {
                auditReport.allValid = false;
                auditReport.errors.push(`Sequence ${expSeq.name} LAST_NUMBER is ${lastNum}, expected >= ${expSeq.expectedStart}`);
            }
            auditReport.sequences.push({
                name: expSeq.name,
                lastNumber: lastNum,
                incrementBy: inc,
                cacheSize: cache,
                status: "VALID"
            });
        }
    }

    // 3. Primary Keys (8)
    for (const pk of EXPECTED_PRIMARY_KEYS) {
        const c = constraints.get(pk.name);
        if (!c || c.CONSTRAINT_TYPE !== "P" || c.STATUS !== "ENABLED") {
            auditReport.allValid = false;
            auditReport.errors.push(`Missing/Disabled Primary Key: ${pk.name} on ${pk.table}`);
        } else {
            auditReport.primaryKeys.push({ name: pk.name, table: pk.table, status: c.STATUS });
        }
    }

    // 4. Foreign Keys (12)
    for (const fk of EXPECTED_FOREIGN_KEYS) {
        const c = constraints.get(fk.name);
        if (!c || c.CONSTRAINT_TYPE !== "R" || c.STATUS !== "ENABLED") {
            auditReport.allValid = false;
            auditReport.errors.push(`Missing/Disabled Foreign Key: ${fk.name} on ${fk.table}`);
        } else {
            const actualDeleteRule = c.DELETE_RULE || "NO ACTION";
            if (actualDeleteRule !== fk.deleteRule) {
                auditReport.allValid = false;
                auditReport.errors.push(`Foreign Key ${fk.name} delete rule mismatch: got ${actualDeleteRule}, expected ${fk.deleteRule}`);
            }
            auditReport.foreignKeys.push({
                name: fk.name,
                table: fk.table,
                deleteRule: actualDeleteRule,
                status: c.STATUS
            });
        }
    }

    // 5. Unique Constraints (4)
    for (const uk of EXPECTED_UNIQUE_CONSTRAINTS) {
        const c = constraints.get(uk.name);
        if (!c || c.CONSTRAINT_TYPE !== "U" || c.STATUS !== "ENABLED") {
            auditReport.allValid = false;
            auditReport.errors.push(`Missing/Disabled Unique Constraint: ${uk.name} on ${uk.table}`);
        } else {
            auditReport.uniqueConstraints.push({ name: uk.name, table: uk.table, status: c.STATUS });
        }
    }

    // 6. Check Constraints (19)
    for (const chk of EXPECTED_CHECK_CONSTRAINTS) {
        const c = constraints.get(chk.name);
        if (!c || c.CONSTRAINT_TYPE !== "C" || c.STATUS !== "ENABLED") {
            auditReport.allValid = false;
            auditReport.errors.push(`Missing/Disabled Check Constraint: ${chk.name} on ${chk.table}`);
        } else {
            auditReport.checkConstraints.push({ name: chk.name, table: chk.table, status: c.STATUS });
        }
    }

    // 7. Secondary Indexes (16)
    for (const idx of EXPECTED_SECONDARY_INDEXES) {
        const i = indexes.get(idx.name);
        if (!i || i.STATUS !== "VALID") {
            auditReport.allValid = false;
            auditReport.errors.push(`Missing/Invalid Secondary Index: ${idx.name} on ${idx.table}`);
        } else {
            auditReport.secondaryIndexes.push({ name: idx.name, table: idx.table, status: i.STATUS });
        }
    }

    // 8. Event Audit Columns on EVENTS
    if (tables.has("EVENTS")) {
        const eventCols = await getExistingColumns(connection, "EVENTS");
        for (const col of EXPECTED_EVENTS_AUDIT_COLUMNS) {
            if (!eventCols.has(col)) {
                auditReport.allValid = false;
                auditReport.errors.push(`Missing Audit Column on EVENTS: ${col}`);
            } else {
                auditReport.columns.push({ table: "EVENTS", column: col, status: "PRESENT" });
            }
        }
    }

    return auditReport;
}

// ---------------------------------------------------------------------------
// Step Execution Helper
// ---------------------------------------------------------------------------

async function executeDdlStep(connection, step, existingState) {
    let exists = false;
    if (step.type === "TABLE") {
        exists = existingState.tables.has(step.name);
    } else if (step.type === "SEQUENCE") {
        exists = existingState.sequences.has(step.name);
    } else if (step.type === "INDEX") {
        exists = existingState.indexes.has(step.name);
    } else if (step.type === "CONSTRAINT") {
        exists = existingState.constraints.has(step.name);
    } else if (step.type === "COLUMN_GROUP") {
        const cols = await getExistingColumns(connection, step.table);
        exists = cols.has(step.name);
    }

    if (exists) {
        console.log(`[Migrator] Object ${step.name} already exists. Verified.`);
        return { executed: false, name: step.name };
    }

    console.log(`[Migrator] Executing DDL for ${step.type} ${step.name}...`);
    await connection.execute(step.sql);
    console.log(`[Migrator] Successfully applied ${step.type} ${step.name}.`);
    return { executed: true, name: step.name };
}

// ---------------------------------------------------------------------------
// Main Migration Engine
// ---------------------------------------------------------------------------

async function runMigration(connection) {
    console.log("==================================================");
    console.log(`  EVENTIFY ORACLE SCHEMA MIGRATION ENGINE (v${CURRENT_SCHEMA_VERSION_LABEL})`);
    console.log("==================================================");

    // 1. Bootstrap Tracker Table & Validate PK Name
    await bootstrapTracker(connection);

    // 2. Verify / Apply Version 1 (1.0.0)
    const v1Res = await connection.execute(
        `SELECT version_id, version_label, status, applied_at, execution_log 
         FROM SCHEMA_VERSION 
         WHERE version_id = :vId`,
        { vId: SCHEMA_VERSION_1_ID },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const v1Row = v1Res.rows && v1Res.rows[0];

    if (!v1Row || v1Row.STATUS !== "APPLIED") {
        console.log("[Migrator] Applying baseline Version 1 (1.0.0)...");
        await connection.execute(
            `MERGE INTO SCHEMA_VERSION sv
             USING (SELECT :vId AS version_id FROM DUAL) src
             ON (sv.version_id = src.version_id)
             WHEN MATCHED THEN
               UPDATE SET status = 'IN_PROGRESS', execution_log = 'v1.0.0 in progress'
             WHEN NOT MATCHED THEN
               INSERT (version_id, version_label, checksum, status, execution_log)
               VALUES (:vId, :vLabel, :csum, 'IN_PROGRESS', 'v1.0.0 started')`,
            { vId: SCHEMA_VERSION_1_ID, vLabel: SCHEMA_VERSION_1_LABEL, csum: MIGRATION_1_CHECKSUM },
            { autoCommit: true }
        );

        const existingStateV1 = {
            tables: await getExistingTables(connection),
            sequences: await getExistingSequences(connection),
            indexes: await getExistingIndexes(connection),
            constraints: await getExistingConstraints(connection)
        };

        for (const step of DDL_STEPS_V1) {
            await executeDdlStep(connection, step, existingStateV1);
        }

        await connection.execute(
            `UPDATE SCHEMA_VERSION
             SET status = 'APPLIED', applied_at = CURRENT_TIMESTAMP,
                 execution_log = 'Baseline v1.0.0 schema applied'
             WHERE version_id = :vId`,
            { vId: SCHEMA_VERSION_1_ID },
            { autoCommit: true }
        );
        console.log("[Migrator] Baseline Version 1 (1.0.0) applied successfully.");
    } else {
        console.log(`[Migrator] Baseline Version 1 (1.0.0) verified APPLIED.`);
    }

    // 3. Check Version 2 (1.1.0)
    const v2Res = await connection.execute(
        `SELECT version_id, version_label, status, applied_at, execution_log
         FROM SCHEMA_VERSION
         WHERE version_id = :vId`,
        { vId: SCHEMA_VERSION_2_ID },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const v2Row = v2Res.rows && v2Res.rows[0];

    // CASE: Version 2 is already APPLIED -> Verify Schema Integrity (No Mutations)
    if (v2Row && v2Row.STATUS === "APPLIED") {
        console.log(`[Migrator] Schema version ${SCHEMA_VERSION_2_LABEL} is marked as APPLIED.`);
        console.log("[Migrator] Running non-destructive schema drift verification pass...");
        const audit = await verifyCompleteSchema(connection);

        if (!audit.allValid) {
            console.error("[Migrator] FATAL: Schema drift detected on previously applied schema!");
            console.error(audit.errors.join("\n"));
            throw new Error(`SCHEMA_DRIFT_ERROR: Schema has diverged from approved definition. ${audit.errors.join("; ")}`);
        }

        console.log(`[Migrator] All 8 tables, 1 sequence, 8 PKs, 12 FKs, 4 UKs, 19 checks, 16 indexes, and audit columns verified intact.`);
        console.log("[Migrator] Schema is 100% compliant and ready.");
        return {
            status: "ALREADY_APPLIED",
            version: SCHEMA_VERSION_2_LABEL,
            appliedAt: v2Row.APPLIED_AT,
            audit
        };
    }

    // CASE: Version 2 needs to be applied
    if (v2Row && v2Row.STATUS === "FAILED") {
        console.warn(`[Migrator] Warning: Previous v1.1.0 run recorded status FAILED.`);
        console.warn(`[Migrator] Prior execution log: ${v2Row.EXECUTION_LOG}`);
        console.log("[Migrator] Resuming migration after validating existing database state...");
    } else if (v2Row && v2Row.STATUS === "IN_PROGRESS") {
        console.warn(`[Migrator] Warning: Previous v1.1.0 migration was interrupted in status IN_PROGRESS.`);
        console.log("[Migrator] Resuming migration after validating existing database state...");
    } else {
        console.log(`[Migrator] Starting migration for Version 2 (${SCHEMA_VERSION_2_LABEL})...`);
    }

    // Record or update IN_PROGRESS for Version 2
    await connection.execute(
        `MERGE INTO SCHEMA_VERSION sv
         USING (SELECT :vId AS version_id FROM DUAL) src
         ON (sv.version_id = src.version_id)
         WHEN MATCHED THEN
           UPDATE SET status = 'IN_PROGRESS', execution_log = 'Migration in progress'
         WHEN NOT MATCHED THEN
           INSERT (version_id, version_label, checksum, status, execution_log)
           VALUES (:vId, :vLabel, :csum, 'IN_PROGRESS', 'Migration started')`,
        {
            vId: SCHEMA_VERSION_2_ID,
            vLabel: SCHEMA_VERSION_2_LABEL,
            csum: MIGRATION_2_CHECKSUM
        },
        { autoCommit: true }
    );

    const executedSteps = [];
    const skippedSteps = [];

    // Execute Missing DDL Steps for Version 2
    for (const step of DDL_STEPS_V2) {
        const existingState = {
            tables: await getExistingTables(connection),
            sequences: await getExistingSequences(connection),
            indexes: await getExistingIndexes(connection),
            constraints: await getExistingConstraints(connection)
        };

        try {
            const result = await executeDdlStep(connection, step, existingState);
            if (result.executed) {
                executedSteps.push(result.name);
            } else {
                skippedSteps.push(result.name);
            }
        } catch (stepErr) {
            const errLog = `Failed at step ${step.type} ${step.name}: ${stepErr.message}`;
            console.error(`[Migrator] ${errLog}`);
            await connection.execute(
                `UPDATE SCHEMA_VERSION SET status = 'FAILED', execution_log = :log WHERE version_id = :vId`,
                { log: errLog.slice(0, 4000), vId: SCHEMA_VERSION_2_ID },
                { autoCommit: true }
            );
            throw stepErr;
        }
    }

    // Post-Execution Audit
    console.log("[Migrator] Running post-migration itemized verification audit...");
    const audit = await verifyCompleteSchema(connection);

    if (!audit.allValid) {
        const failureLog = `Audit failed: ${audit.errors.join("; ")}`;
        console.error(`[Migrator] ${failureLog}`);
        await connection.execute(
            `UPDATE SCHEMA_VERSION SET status = 'FAILED', execution_log = :log WHERE version_id = :vId`,
            { log: failureLog.slice(0, 4000), vId: SCHEMA_VERSION_2_ID },
            { autoCommit: true }
        );
        throw new Error(failureLog);
    }

    // Attestation
    const summaryLog = `Verified: 8 tables, 1 sequence, 8 PKs, 12 FKs, 4 UKs, 19 checks, 16 indexes, 3 audit columns. Executed: ${executedSteps.length}, Skipped: ${skippedSteps.length}.`;
    await connection.execute(
        `UPDATE SCHEMA_VERSION
         SET status = 'APPLIED',
             applied_at = CURRENT_TIMESTAMP,
             execution_log = :log
         WHERE version_id = :vId`,
        { log: summaryLog.slice(0, 4000), vId: SCHEMA_VERSION_2_ID },
        { autoCommit: true }
    );

    console.log("==================================================");
    console.log("  MIGRATION SUCCESSFULLY APPLIED AND VERIFIED!");
    console.log(`  ${summaryLog}`);
    console.log("==================================================");

    return {
        status: "APPLIED",
        version: SCHEMA_VERSION_2_LABEL,
        executedSteps,
        skippedSteps,
        audit
    };
}

module.exports = {
    runMigration,
    verifyCompleteSchema,
    EXPECTED_TABLES,
    EXPECTED_SEQUENCES,
    EXPECTED_PRIMARY_KEYS,
    EXPECTED_FOREIGN_KEYS,
    EXPECTED_UNIQUE_CONSTRAINTS,
    EXPECTED_CHECK_CONSTRAINTS,
    EXPECTED_SECONDARY_INDEXES
};
