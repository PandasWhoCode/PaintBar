export interface User {
  // Firebase Auth fields
  uid: string;
  email: string;
  
  // Profile fields
  username?: string;
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  
  // Social media handles
  githubUrl?: string;
  linkedinProfile?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  blueskyHandle?: string;
  
  // Blockchain
  hbarAddress?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

