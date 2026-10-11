-- Migration for Entrega 2: Atención y Respuesta Trazable

-- 1. Create table for official responses
CREATE TABLE IF NOT EXISTS complaint_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    admin_user_id UUID NOT NULL REFERENCES admin_users(id),
    response_body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying responses by complaint
CREATE INDEX IF NOT EXISTS idx_complaint_responses_complaint_id ON complaint_responses(complaint_id);

-- Optional: Create an index on the time events if it's not already indexed, 
-- useful for the UI timeline.
CREATE INDEX IF NOT EXISTS idx_complaint_time_events_complaint_id_event_type 
ON complaint_time_events(complaint_id, event_type);
