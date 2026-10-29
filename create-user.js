import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0';

const supabase = createClient(supabaseUrl, anonKey);

async function createUser() {
  const email = 'operator@commutai.local';
  const password = 'operator123!';

  console.log('Creating user in staff_users...');

  try {
    const { data, error } = await supabase
      .from('staff_users')
      .insert({
        id: crypto.randomUUID(),
        full_name: 'operator',
        email,
        password,
        role: 'operator',
        is_active: true,
        phone: '09927268704',
        emergency_contact: '09927268704',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return;
    }

    console.log('User created successfully!');
    console.log('ID:', data.id);
    console.log('Email:', data.email);
    console.log('Password:', data.password);

    console.log('\nYou can now login with:');
    console.log('Email:', email);
    console.log('Password:', password);
  } catch (error) {
    console.error('Error:', error);
  }
}

createUser();
