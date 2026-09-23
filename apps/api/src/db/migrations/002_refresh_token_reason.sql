ALTER TABLE refresh_tokens
  ADD COLUMN revoked_reason TEXT CHECK (revoked_reason IN ('rotated', 'logout', 'reuse_detected'));
