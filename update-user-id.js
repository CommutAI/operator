import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0';

const supabase = createClient(supabaseUrl, anonKey);

async function updateUserId() {
  const email = 'operator@commutai.local';
  const newId = '0ebd83ba-700b-411c-89ec-d9cf44998c87';

  console.log('Updating user ID in staff_users...');

  try {
    const { data, error } = await supabase
      .from('staff_users')
      .update({ id: newId })
      .eq('email', email)
      .select()
      .single();

    if (error) {
      console.error('Error updating user ID:', error);
      return;
    }

    console.log('User ID updated successfully!');
    console.log('New ID:', data.id);
    console.log('Email:', data.email);
  } catch (error) {
    console.error('Error:', error);
  }
}

updateUserId();
