-- Allows the application user to create the ephemeral databases used by integration tests.
ALTER USER cryptoarena CREATEDB;
CREATE DATABASE cryptoarena_test OWNER cryptoarena;
