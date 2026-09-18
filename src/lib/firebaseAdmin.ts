import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = import.meta.env.FIREBASE_PROJECT_ID;
const clientEmail = import.meta.env.FIREBASE_CLIENT_EMAIL;
const privateKey = import.meta.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!getApps().length) {
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase 환경 변수(FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)가 필요합니다.",
    );
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export const db = getFirestore();
