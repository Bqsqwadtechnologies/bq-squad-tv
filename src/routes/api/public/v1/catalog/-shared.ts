// Shared catalogue mapping for the BQ SQWAD TV API.

export type ChannelDoc = Record<string, unknown> & { __id: string };

export type ChannelSummary = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  isLive: boolean;
  currentProgramme: string | null;
  language: string | null;
};

/** Maps a Firestore channel document to the Android ChannelSummary contract. */
export function toChannelSummary(doc: ChannelDoc): ChannelSummary {
  return {
    id: doc.__id,
    title: typeof doc["title"] === "string" ? (doc["title"] as string) : "Untitled channel",
    category: typeof doc["category"] === "string" ? (doc["category"] as string) : "Channel",
    posterUrl: typeof doc["posterUrl"] === "string" ? (doc["posterUrl"] as string) : null,
    isLive: doc["isLive"] === true,
    currentProgramme: typeof doc["currentProgramme"] === "string" ? (doc["currentProgramme"] as string) : null,
    language: typeof doc["language"] === "string" ? (doc["language"] as string) : null,
  };
}

/** Adult-tagged channels are removed entirely for viewers who are not adult-eligible. */
export function visibleChannels(docs: ChannelDoc[], adultEligible: boolean): ChannelDoc[] {
  return docs.filter((doc) => doc["published"] === true && (adultEligible || doc["adultOnly"] !== true));
}
