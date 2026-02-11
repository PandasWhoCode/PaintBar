-- +goose Up
CREATE TABLE rate_limits (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INT NOT NULL DEFAULT 1,
    UNIQUE(key, window_start)
);
CREATE INDEX idx_rate_limits_key_window ON rate_limits(key, window_start);

-- +goose Down
DROP TABLE rate_limits;
