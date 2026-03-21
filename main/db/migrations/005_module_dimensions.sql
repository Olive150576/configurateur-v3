-- Migration 005 — Dimensions par module
ALTER TABLE modules ADD COLUMN dimensions TEXT DEFAULT '';
