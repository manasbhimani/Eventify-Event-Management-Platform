-- ============================================================================
-- EVENTIFY MIGRATION v1.1.0 (ORACLE DATABASE 23ai)
-- Version ID: 2 | Label: 1.1.0 | Checksum: phase11-v1.1.0-cancellation-notifications-refunds
-- Target Schema: eventify_admin | PDB: FREEPDB1
-- Purpose:
--   1. Event cancellation audit tracking columns on EVENTS (cancelled_by, cancelled_at, cancellation_reason).
--   2. Persistent attendee notifications table (NOTIFICATIONS) with duplicate prevention.
--   3. Development simulated refund tracking table (EVENT_REFUNDS) for cancelled paid bookings.
--
-- Note on Payment & Refunds:
--   Eventify has no payment gateway integration and collects zero actual money.
--   EVENT_REFUNDS records simulated development outcomes and internal refund obligations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EVENT CANCELLATION AUDIT TRACKING ON EVENTS
-- ----------------------------------------------------------------------------
ALTER TABLE EVENTS ADD (
    cancelled_by          NUMBER                           NULL,
    cancelled_at          TIMESTAMP WITH TIME ZONE         NULL,
    cancellation_reason   VARCHAR2(500)                    NULL
);

ALTER TABLE EVENTS ADD CONSTRAINT fk_events_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES USERS (user_id) ON DELETE SET NULL;

CREATE INDEX idx_events_cancelled_by ON EVENTS (cancelled_by);

-- ----------------------------------------------------------------------------
-- 2. PERSISTENT ATTENDEE NOTIFICATIONS TABLE
-- ----------------------------------------------------------------------------
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
);

CREATE INDEX idx_notif_user_status ON NOTIFICATIONS (user_id, status);
CREATE INDEX idx_notif_event ON NOTIFICATIONS (event_id);
CREATE INDEX idx_notif_booking ON NOTIFICATIONS (booking_id);

-- ----------------------------------------------------------------------------
-- 3. DEVELOPMENT SIMULATED REFUND RECORDS TABLE
-- ----------------------------------------------------------------------------
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
);

CREATE INDEX idx_refunds_event ON EVENT_REFUNDS (event_id);
CREATE INDEX idx_refunds_user ON EVENT_REFUNDS (user_id);
CREATE INDEX idx_refunds_status ON EVENT_REFUNDS (status);
