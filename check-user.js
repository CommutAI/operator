import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0';

const supabase = createClient(supabaseUrl, anonKey);

async function checkUser() {
  const email = 'operator@commutai.local';

  console.log('Checking user in staff_users...');

  try {
    const { data, error } = await supabase
      .from('staff_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error:', error);
      return;
    }

    if (data) {
      console.log('User found:');
      console.log('ID:', data.id);
      console.log('Email:', data.email);
      console.log('Full Name:', data.full_name);
      console.log('Role:', data.role);
      console.log('Is Active:', data.is_active);
      console.log('Password:', data.password ? 'SET' : 'NOT SET');
      console.log('Password value:', data.password);
    } else {
      console.log('User not found in staff_users');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkUser();
