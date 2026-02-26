import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = "announcement_banner_app";

let client: MongoClient | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
  }
  return client;
}

export interface AnnouncementRecord {
  text: string;
  timestamp: Date;
  shopId: string;
  shopDomain?: string;
}

const COLLECTION = "announcement_history";

export async function insertAnnouncementHistory(
  record: AnnouncementRecord
): Promise<void> {
  const c = await getMongoClient();
  await c.db(DB_NAME).collection(COLLECTION).insertOne({
    ...record,
    timestamp: record.timestamp || new Date(),
  });
}
