// Stub functions for Raspberry Pi integration
// These are placeholder implementations to prevent runtime errors

export const getPiVideoFeedUrl = (_busId: string): string => {
  // Return placeholder URL - in production this would connect to actual Pi camera
  return '';
};

export const clearPiTrip = async (tripId: string): Promise<void> => {
  // Stub implementation - in production this would send command to Raspberry Pi
  console.log('Clearing trip on Pi:', tripId);
};
