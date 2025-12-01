/**
 * Simple hash function for client-side hash calculation
 * Uses a basic string hashing algorithm since crypto is not available in webview
 */
export function calculateSimpleHash(str: string): string {
  if (!str || str.trim() === '') {
    return '';
  }
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to hex string
  return Math.abs(hash).toString(16).padStart(8, '0');
}
