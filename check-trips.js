import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA3MDEzMywiZXhwIjoyMTA2NjQ2MTMzfQ.5-RIUyTvWz5yE6VaqMCD8DRvaLejY8wroJjBCdYiA4A';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkTrips() {
  console.log('Checking active trips...\n');

  try {
    // Check active trips
    const { data: trips, error: tripsError } = await supabase
      .from('trips')
      .select('*, buses(*), conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*)')
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false });

    if (tripsError) {
      console.error('Error fetching trips:', tripsError);
      return;
    }

    console.log(`Found ${trips?.length || 0} active trips:\n`);

    if (trips && trips.length > 0) {
      trips.forEach((trip, index) => {
        console.log(`Trip ${index + 1}:`);
        console.log(`  ID: ${trip.id}`);
        console.log(`  Bus: ${trip.buses?.plate_number || 'N/A'} (Route: ${trip.buses?.route || 'N/A'})`);
        console.log(`  Conductor: ${trip.conductor?.full_name || 'N/A'}`);
        console.log(`  Driver: ${trip.driver?.full_name || 'N/A'}`);
        console.log(`  Status: ${trip.status}`);
        console.log(`  Started: ${trip.started_at}`);
        console.log(`  GPS: ${trip.current_lat ? `${trip.current_lat}, ${trip.current_lng}` : 'Not set'}`);
        console.log('');
      });
    } else {
      console.log('No active trips found.');
    }

    // Check recent GPS locations
    console.log('\nChecking recent GPS locations...\n');
    const { data: gpsData, error: gpsError } = await supabase
      .from('gps_locations')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(10);

    if (gpsError) {
      console.error('Error fetching GPS data:', gpsError);
    } else {
      console.log(`Found ${gpsData?.length || 0} recent GPS locations:\n`);
      if (gpsData && gpsData.length > 0) {
        gpsData.forEach((gps, index) => {
          console.log(`GPS ${index + 1}:`);
          console.log(`  Trip ID: ${gps.trip_id || 'N/A'}`);
          console.log(`  Lat: ${gps.lat}, Lng: ${gps.lng}`);
          console.log(`  Source: ${gps.source || 'N/A'}`);
          console.log(`  Recorded: ${gps.recorded_at}`);
          console.log('');
        });
      } else {
        console.log('No recent GPS locations found.');
      }
    }

    // Check recent passenger counts
    console.log('\nChecking recent passenger counts...\n');
    const { data: passengerData, error: passengerError } = await supabase
      .from('passenger_counts')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(10);

    if (passengerError) {
      console.error('Error fetching passenger counts:', passengerError);
    } else {
      console.log(`Found ${passengerData?.length || 0} recent passenger counts:\n`);
      if (passengerData && passengerData.length > 0) {
        passengerData.forEach((pc, index) => {
          console.log(`Passenger Count ${index + 1}:`);
          console.log(`  Trip ID: ${pc.trip_id || 'N/A'}`);
          console.log(`  Count: ${pc.count}`);
          console.log(`  Recorded: ${pc.recorded_at}`);
          console.log('');
        });
      } else {
        console.log('No recent passenger counts found.');
      }
    }

    // Check pi_devices table
    console.log('\nChecking registered Pi devices...\n');
    const { data: piDevices, error: piError } = await supabase
      .from('pi_devices')
      .select('*');

    if (piError) {
      console.error('Error fetching Pi devices:', piError);
    } else {
      console.log(`Found ${piDevices?.length || 0} registered Pi devices:\n`);
      if (piDevices && piDevices.length > 0) {
        piDevices.forEach((pi, index) => {
          console.log(`Pi Device ${index + 1}:`);
          console.log(`  Bus Number: ${pi.bus_number}`);
          console.log(`  Bus ID: ${pi.bus_id || 'N/A'}`);
          console.log(`  IP Address: ${pi.ip_address}:${pi.port}`);
          console.log(`  Hostname: ${pi.hostname || 'N/A'}`);
          console.log(`  Last Seen: ${pi.last_seen}`);
          console.log('');
        });
      } else {
        console.log('No Pi devices registered in the database.');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkTrips();
