/**
 * Migration script to hash existing plain text passwords
 * Run this once to upgrade all plain text passwords to bcrypt
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migratePasswords() {
  try {
    console.log('Fetching all staff users...');

    const { data: users, error } = await supabase
      .from('staff_users')
      .select('id, email, password');

    if (error) {
      throw error;
    }

    console.log(`Found ${users.length} users`);

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      // Check if password is already hashed
      if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
        console.log(`Skipping ${user.email} - already hashed`);
        skipped++;
        continue;
      }

      console.log(`Migrating ${user.email}...`);

      // Hash the password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);

      // Update the user
      const { error: updateError } = await supabase
        .from('staff_users')
        .update({ password: hashedPassword })
        .eq('id', user.id);

      if (updateError) {
        console.error(`Failed to migrate ${user.email}:`, updateError);
      } else {
        console.log(`✓ Migrated ${user.email}`);
        migrated++;
      }
    }

    console.log(`\nMigration complete:`);
    console.log(`- Migrated: ${migrated}`);
    console.log(`- Skipped: ${skipped}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migratePasswords();
