import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0';

const supabase = createClient(supabaseUrl, anonKey);

async function checkRLS() {
  console.log('Testing RLS on staff_users...');

  try {
    // Try to query without authentication
    const { data, error } = await supabase
      .from('staff_users')
      .select('email, is_active, password')
      .eq('email', 'operator@commutai.local');

    if (error) {
      console.log('RLS is blocking the query. Error:', error.message);
      console.log('Error code:', error.code);
    } else {
      console.log('Query succeeded!');
      console.log('User:', data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRLS();
