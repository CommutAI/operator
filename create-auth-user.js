const supabaseUrl = process.env.VITE_SUPABASE_URL || 'your-supabase-project-url';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key';

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
