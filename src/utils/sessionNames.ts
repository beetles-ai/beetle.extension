/**
 * Generate session names in format: Review 1 - branch, Review 2 - branch
 * Checks existing sessions to determine the next sequential number
 */

export function generateSessionName(branchName: string = 'main', existingSessions: any[] = []): string {
  // Find the highest review number for this branch from existing sessions
  let maxNumber = 0;
  
  // Pattern to match: "Review 1 - branch", "Review 2 - branch", etc.
  const titlePattern = /^Review (\d+) - (.+)$/;
  
  for (const session of existingSessions) {
    if (session.title) {
      const match = session.title.match(titlePattern);
      if (match) {
        const reviewNumber = parseInt(match[1], 10);
        const sessionBranch = match[2];
        
        // Only consider sessions for the same branch
        if (sessionBranch === branchName && reviewNumber > maxNumber) {
          maxNumber = reviewNumber;
        }
      }
    }
  }
  
  // Next number is max + 1
  const nextNumber = maxNumber + 1;
  return `Review ${nextNumber} - ${branchName}`;
}

export function resetSessionCounter() {
  // No longer needed, but kept for backward compatibility
}
