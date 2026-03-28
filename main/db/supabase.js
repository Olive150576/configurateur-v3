/**
 * Supabase — Client singleton
 * Utilisé par ProductService, SupplierService, ClientService
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://uditxoxeyieknknyvkoa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaXR4b3hleWlla25rbnl2a29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjcxMDIsImV4cCI6MjA5MDMwMzEwMn0.0gxY8gsphzwopAIKhrUTK3lRdVrVT9OUXGeJJ22zFsI';

let client = null;

function getSupabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

module.exports = { getSupabase };
