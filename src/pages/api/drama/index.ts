import type { APIRoute } from "astro";
import { db } from "../../../lib/firebaseAdmin";
import { getWeekFormattedString } from "../../../services/dramaCollector";

export const prerender = false;

type DramaRecord = {
  broadcaster?: string;
  title?: string;
  slot?: string;
  airDays?: string[];
  airTime?: string;
  thumbnailUrl?: string;
  directors?: string[];
  cast?: Array<{ name?: string; roleName?: string; isLead?: boolean }>;
  characters?: Array<{ name?: string; actor?: string; description?: string }>;
};

export const GET: APIRoute = async ({ url }) => {
  const countryCode = (url.searchParams.get("country") || "KR").toUpperCase();
  const week = getWeekFormattedString();
  const docId = `${countryCode}_${week}`;

  try {
    const broadcastRef = db.collection("broadcast").doc(docId);
    const [broadcastSnapshot, dramaSnapshot] = await Promise.all([
      broadcastRef.get(),
      broadcastRef.collection("drama").get(),
    ]);

    if (!broadcastSnapshot.exists) {
      return Response.json(
        { countryCode, week, docId, generatedAt: null, items: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const parent = broadcastSnapshot.data();
    const items = dramaSnapshot.docs.map((document) => {
      const drama = document.data() as DramaRecord;
      return {
        id: document.id,
        broadcaster: drama.broadcaster || "Unknown",
        title: drama.title || "Untitled",
        slot: drama.slot || "",
        airDays: Array.isArray(drama.airDays) ? drama.airDays : [],
        airTime: drama.airTime || "",
        thumbnailUrl: drama.thumbnailUrl || "",
        directors: Array.isArray(drama.directors) ? drama.directors : [],
        cast: Array.isArray(drama.cast) ? drama.cast : [],
        characters: Array.isArray(drama.characters) ? drama.characters : [],
      };
    });

    const generatedAt = parent?.createdAt?.toDate?.()?.toISOString?.() || null;
    return Response.json(
      { countryCode, week, docId, generatedAt, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { countryCode, week, docId, items: [], error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
