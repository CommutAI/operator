import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'your-supabase-project-url';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-supabase-service-role-key';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function registerLocalBackend() {
  console.log('Registering local backend in pi_devices table...\n');

  try {
    // Insert or update the local backend entry
    const { data, error } = await supabase
      .from('pi_devices')
      .upsert({
        bus_number: 1,
        ip_address: '192.168.1.41',
        port: 8000,
        hostname: 'local-backend',
        last_seen: new Date().toISOString()
      }, {
        onConflict: 'bus_number'
      });

    if (error) {
      console.error('Error registering backend:', error);
      return;
    }

    console.log('✅ Local backend registered successfully!');
    console.log('   Bus Number: 1');
    console.log('   IP Address: 192.168.1.41:8000');
    console.log('   Hostname: local-backend');
    console.log('\nThe Pi will now auto-discover this backend from Supabase.');

  } catch (error) {
    console.error('Error:', error);
  }
}

registerLocalBackend();
