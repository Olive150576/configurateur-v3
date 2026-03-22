-- Migration 007 — Dimensions par gamme
ALTER TABLE ranges ADD COLUMN dimensions TEXT DEFAULT '';
