// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://uyojzeqovrpfrzsuwsys.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5b2p6ZXFvdnJwZnJ6c3V3c3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTQzNjcsImV4cCI6MjA3OTk5MDM2N30.Mx302lQNo7KG8tQRppQn6IWkOGVgwnCL1h7H5f1__J0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)