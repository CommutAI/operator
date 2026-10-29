const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0';

async function checkAuthUser() {
  const email = 'operator@commutai.local';
  const password = 'operator123!';

  console.log('Checking if auth user exists by attempting sign in...');

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();

    if (response.ok && data.user) {
      console.log('Auth user exists!');
      console.log('User ID:', data.user.id);
      console.log('Email:', data.user.email);

      console.log('\nNow run this SQL in Supabase SQL Editor to update staff_users:');
      console.log(`UPDATE public.staff_users SET id = '${data.user.id}' WHERE email = '${email}';`);

      console.log('\nYou can now login with:');
      console.log('Email:', email);
      console.log('Password:', password);
    } else {
      console.log('Auth user does not exist or password is wrong');
      console.log('Error:', data);
      console.log('\nYou need to create the user via Supabase Dashboard:');
      console.log('1. Go to: https://supabase.com/dashboard/project/iyacktzzktwrpeibcena');
      console.log('2. Authentication → Users → Add user');
      console.log('3. Email: operator@commutai.local');
      console.log('4. Password: operator123!');
      console.log('5. Auto Confirm: checked');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkAuthUser();
