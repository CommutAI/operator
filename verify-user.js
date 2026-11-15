import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'your-supabase-project-url';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key';

const supabase = createClient(supabaseUrl, anonKey);

async function verifyUser() {
  const email = 'operator@commutai.local';
  const password = 'operator123!';

  console.log('Testing login query...');

  try {
    // First, check if user exists at all
    const { data: allUsers, error: listError } = await supabase
      .from('staff_users')
      .select('email, is_active, password')
      .eq('email', email);

    if (listError) {
      console.log('List error:', listError.message);
    } else {
      console.log('Users found:', allUsers);
    }

    // Now try the login query
    const { data: user, error } = await supabase
      .from('staff_users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .eq('is_active', true)
      .single();

    if (error) {
      console.log('Query error:', error.message);
      console.log('Error code:', error.code);
      console.log('Error details:', error);
    } else {
      console.log('Query succeeded!');
      console.log('User found:', user);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

verifyUser();
