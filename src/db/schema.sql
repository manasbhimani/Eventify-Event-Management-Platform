-- ============================================================================
-- EVENTIFY RELATIONAL SCHEMA (ORACLE DATABASE 23ai)
-- Target Schema: eventify_admin | PDB: FREEPDB1 | Version: 1.0.0
-- ============================================================================

-- 0. SCHEMA MIGRATION TRACKING
CREATE TABLE SCHEMA_VERSION (
    version_id       NUMBER,
    version_label    VARCHAR2(50) NOT NULL,
    applied_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    checksum         VARCHAR2(64) NOT NULL,
    status           VARCHAR2(20) NOT NULL,
    execution_log    VARCHAR2(4000) NULL,
    CONSTRAINT pk_schema_version PRIMARY KEY (version_id)
);

-- 1. USERS TABLE
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
        REGEXP_LIKE(email, '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    ),
    CONSTRAINT chk_users_role CHECK (role IN ('ATTENDEE', 'ORGANIZER', 'ADMIN')),
    CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
);

-- 2. CATEGORIES TABLE
CREATE TABLE CATEGORIES (
    category_id      NUMBER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    name             VARCHAR2(50)         NOT NULL,
    description      VARCHAR2(255)        NULL,

    CONSTRAINT pk_categories PRIMARY KEY (category_id),
    CONSTRAINT uq_categories_name UNIQUE (name)
);

-- 3. EVENTS TABLE
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
);

CREATE INDEX idx_events_category ON EVENTS (category_id);
CREATE INDEX idx_events_creator ON EVENTS (creator_id);
CREATE INDEX idx_events_status_date ON EVENTS (status, event_date);
CREATE INDEX idx_events_city ON EVENTS (city);

-- 4. BOOKINGS TABLE & SEQUENCE
CREATE SEQUENCE seq_booking_id START WITH 2001 INCREMENT BY 1 NOCACHE;

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
    CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES USERS (user_id),
    CONSTRAINT fk_bookings_event FOREIGN KEY (event_id) REFERENCES EVENTS (event_id),
    CONSTRAINT chk_bookings_id_fmt CHECK (REGEXP_LIKE(booking_id, '^EVT-[0-9]+$')),
    CONSTRAINT chk_bookings_quantity CHECK (quantity >= 1 AND quantity <= 10),
    CONSTRAINT chk_bookings_unit_price CHECK (unit_price_snapshot >= 0),
    CONSTRAINT chk_bookings_amount CHECK (amount >= 0),
    CONSTRAINT chk_bookings_amount_calc CHECK (amount = (unit_price_snapshot * quantity)),
    CONSTRAINT chk_bookings_status CHECK (status IN ('CONFIRMED', 'CANCELLED'))
);

CREATE INDEX idx_bookings_user ON BOOKINGS (user_id);
CREATE INDEX idx_bookings_event_status ON BOOKINGS (event_id, status);
CREATE INDEX idx_bookings_date ON BOOKINGS (booking_date);

-- 5. SESSIONS TABLE
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
);

CREATE INDEX idx_sessions_user ON SESSIONS (user_id);
CREATE INDEX idx_sessions_expires ON SESSIONS (expires_at);
