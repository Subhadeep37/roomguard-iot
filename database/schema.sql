-- ============================================================================
-- RoomGuard IoT — PostgreSQL schema
-- Column names here match exactly what backend/src/database/db.js queries,
-- so this schema is safe to apply as-is for a production Postgres deployment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS devices (
    device_id         VARCHAR(64) PRIMARY KEY,
    name              VARCHAR(128) NOT NULL DEFAULT 'ESP32 Device',
    firmware_version  VARCHAR(32) DEFAULT '1.0.0',
    wifi_rssi         INTEGER,
    uptime_seconds    BIGINT DEFAULT 0,
    bmp280_available  BOOLEAN DEFAULT FALSE,
    rc522_available   BOOLEAN DEFAULT FALSE,
    dht11_available   BOOLEAN DEFAULT FALSE,
    last_ping         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS authorized_rfid_cards (
    id          SERIAL PRIMARY KEY,
    uid         VARCHAR(32) UNIQUE NOT NULL,
    name        VARCHAR(128) NOT NULL,
    enabled     BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS access_events (
    id          SERIAL PRIMARY KEY,
    device_id   VARCHAR(64) REFERENCES devices(device_id) ON DELETE SET NULL,
    uid         VARCHAR(32) NOT NULL,
    event_type  VARCHAR(32) NOT NULL CHECK (event_type IN ('ACCESS_GRANTED', 'ACCESS_DENIED')),
    card_label  VARCHAR(128),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS environment_readings (
    id           BIGSERIAL PRIMARY KEY,
    device_id    VARCHAR(64) REFERENCES devices(device_id) ON DELETE CASCADE,
    temperature  NUMERIC(5, 2) NOT NULL,
    pressure     NUMERIC(7, 2) NOT NULL,
    recorded_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_commands (
    id            SERIAL PRIMARY KEY,
    device_id     VARCHAR(64) REFERENCES devices(device_id) ON DELETE CASCADE,
    command       VARCHAR(64) NOT NULL,
    status        VARCHAR(32) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    result        JSONB,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dht11_readings (
    id           BIGSERIAL PRIMARY KEY,
    device_id    VARCHAR(64) REFERENCES devices(device_id) ON DELETE CASCADE,
    command_id   INTEGER REFERENCES device_commands(id) ON DELETE SET NULL,
    temperature  NUMERIC(4, 1) NOT NULL,
    humidity     NUMERIC(4, 1) NOT NULL,
    recorded_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for the query patterns the API actually uses.
CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_device_id  ON access_events(device_id);
CREATE INDEX IF NOT EXISTS idx_access_events_event_type ON access_events(event_type);

CREATE INDEX IF NOT EXISTS idx_env_readings_device_recorded ON environment_readings(device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_commands_poll ON device_commands(device_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_dht11_readings_device_recorded ON dht11_readings(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_dht11_readings_command_id      ON dht11_readings(command_id);

-- ============================================================================
-- Seed data
-- ============================================================================

INSERT INTO devices (device_id, name, firmware_version)
VALUES ('ROOMGUARD-01', 'Server Room Sentinel', '1.0.0')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO authorized_rfid_cards (uid, name, enabled) VALUES
    ('A1B2C3D4', 'Master Admin Keycard', TRUE),
    ('E5F60718', 'Lead Engineer Badge', TRUE),
    ('04A25F82', 'Facility Security Token', TRUE)
ON CONFLICT (uid) DO UPDATE SET
    name = EXCLUDED.name,
    enabled = EXCLUDED.enabled,
    updated_at = CURRENT_TIMESTAMP;
