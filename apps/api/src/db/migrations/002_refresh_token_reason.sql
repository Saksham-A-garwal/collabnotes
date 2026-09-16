-- Distinguishes why a refresh token row stopped being active, so reuse
-- detection (SRS FR-5) can tell "already rotated" (expected) apart from
-- "presented after being rotated/logged out" (reuse signal) without
-- deleting rows. Ported from the Cortex project's revokedReason field.
ALTER TABLE refresh_tokens
  ADD COLUMN revoked_reason TEXT CHECK (revoked_reason IN ('rotated', 'logout', 'reuse_detected'));
