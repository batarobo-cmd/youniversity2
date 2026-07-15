CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  category varchar(32) NOT NULL,
  event_type varchar(64) NOT NULL,
  outcome varchar(16) NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email varchar(255),
  method varchar(32),
  ip_address varchar(45),
  reason_code varchar(64),
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS security_events_category_created_idx
  ON security_events (category, created_at);

CREATE INDEX IF NOT EXISTS security_events_event_type_created_idx
  ON security_events (event_type, created_at);
