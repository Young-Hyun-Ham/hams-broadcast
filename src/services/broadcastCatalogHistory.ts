import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";

export async function createBroadcastHistory(type:"catalog"|"detail"|"migration"|"thumbnail",fields:Record<string,unknown>={}) {
  const ref=db.collection("dramaHistory").doc();
  await ref.set({type,status:"processing",requestedAt:Timestamp.now(),...fields});
  return ref;
}
