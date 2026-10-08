// TODO: Implement actual Raspberry Pi integration
// These are stub functions for hardware integration - not yet implemented
// For production, connect to actual Raspberry Pi camera and GPIO interfaces

export const getPiVideoFeedUrl = (_busId: string): string => {
  // STUB: Returns empty string - implement actual Pi camera stream URL
  return '';
};

export const clearPiTrip = async (tripId: string): Promise<void> => {
  // STUB: No-op - implement actual command to clear trip on Raspberry Pi
};
