-- Add avatar_instructions column to templates table
-- Run this in the Supabase SQL editor
ALTER TABLE templates ADD COLUMN IF NOT EXISTS avatar_instructions text DEFAULT '';
