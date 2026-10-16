/**
 * LALA DENTIST - GOOGLE DRIVE BACKUP SERVICE
 * Real Google Drive v3 REST API integration using Firebase Client-Side OAuth.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser,
  signOut
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Scopes configured in applet
export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file"
];

// Initialize or reuse Firebase App instance
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
GOOGLE_DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUser: FirebaseUser | null = null;

/**
 * Initializes Google Auth state listener.
 */
export const initGoogleDriveAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    if (user) {
      cachedUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token not in memory; user needs to click Sign In with Google
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedUser = null;
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger official Sign In with Google popup.
 */
export const signInWithGoogleDrive = async (): Promise<{
  user: FirebaseUser;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Gagal memperoleh access token Google Drive dari autentikasi.");
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (
      error?.code === "auth/popup-closed-by-user" ||
      error?.code === "auth/cancelled-popup-request" ||
      error?.message?.includes("popup-closed-by-user")
    ) {
      // User closed the popup window or cancelled the sign-in prompt; return null gracefully
      return null;
    }
    if (error?.code === "auth/popup-blocked") {
      throw new Error("Jendela pop-up Google diblokir oleh browser. Harap izinkan pop-up untuk situs ini.");
    }
    if (error?.message?.includes("access_denied") || error?.code === "auth/access-denied") {
      throw new Error("Akses ditolak oleh Google: Akun ini belum terdaftar sebagai penguji di Google Cloud Console. Silakan gunakan tombol 'Unduh File' atau gunakan akun pemilik project.");
    }
    console.warn("Google Drive sign-in warning:", error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getGoogleUser = (): FirebaseUser | null => {
  return cachedUser;
};

export const signOutGoogleDrive = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedUser = null;
};

/**
 * Helper to find or create the root backup folder in Google Drive.
 */
export const getOrCreateBackupFolder = async (
  token: string,
  folderName: string = "LALA DENTIST BACKUP"
): Promise<string> => {
  // Search for existing folder
  const query = encodeURIComponent(
    `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mencari folder di Google Drive: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder if not found
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder"
    })
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gagal membuat folder LALA DENTIST BACKUP di Google Drive");
  }

  const folderData = await createRes.json();
  return folderData.id;
};

export interface DriveUploadedFile {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  createdTime?: string;
}

/**
 * Uploads a file directly into the user's Google Drive.
 */
export const uploadFileToGoogleDrive = async (
  filename: string,
  content: string,
  mimeType: string = "application/sql"
): Promise<DriveUploadedFile> => {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error("Akun Google Drive belum terhubung. Silakan klik 'Hubungkan Google Drive' terlebih dahulu.");
  }

  const folderId = await getOrCreateBackupFolder(token);

  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType
  };

  const boundary = "-------LalaDentistBackupBoundary" + Date.now();
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content +
    closeDelim;

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink,webContentLink,createdTime",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mengunggah file ke Google Drive: ${uploadRes.statusText}`);
  }

  const fileData = await uploadRes.json();
  return fileData;
};
