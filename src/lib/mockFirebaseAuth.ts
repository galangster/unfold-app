// Mock Firebase Auth for UI debugging without native modules
// This file replaces @react-native-firebase/auth during development

export interface FirebaseAuthTypes {
  User: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerData: Array<{
      providerId: string;
      uid?: string;
      displayName?: string | null;
      email?: string | null;
      phoneNumber?: string | null;
      photoURL?: string | null;
    }>;
  };
}

const mockUser: FirebaseAuthTypes['User'] = {
  uid: 'mock-user-123',
  email: 'test@unfold.app',
  displayName: 'Test User',
  photoURL: null,
  emailVerified: true,
  isAnonymous: false,
  providerData: [{ 
    providerId: 'apple.com',
    uid: 'mock-user-123',
    displayName: 'Test User',
    email: 'test@unfold.app',
    phoneNumber: null,
    photoURL: null,
  }],
};

const auth = () => {
  return {
    currentUser: mockUser,
    onAuthStateChanged: (callback: (user: any) => void) => {
      // Immediately return mock user
      setTimeout(() => callback(mockUser), 100);
      // Return unsubscribe function
      return () => {};
    },
    signInAnonymously: async () => ({ user: mockUser }),
    signOut: async () => {},
    signInWithCredential: async () => ({ user: mockUser }),
  };
};

export const FirebaseAuthTypes = {};
export default auth;
