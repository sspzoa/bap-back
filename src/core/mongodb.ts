import { type Collection, type Db, type IndexDescription, MongoClient } from "mongodb";
import { logger } from "@/core/logger";

interface BaseMealDocument {
  _id: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  constructor(
    private readonly mongoUri: string,
    private readonly dbName: string,
    private readonly collectionName: string,
  ) {}

  async connect(): Promise<void> {
    if (this.client && this.db) {
      return;
    }

    try {
      logger.info(`Connecting to MongoDB: ${this.dbName}`);
      this.client = new MongoClient(this.mongoUri, {
        tls: true,
        tlsAllowInvalidCertificates: true,
        tlsAllowInvalidHostnames: true,
      });

      await this.client.connect();
      this.db = this.client.db(this.dbName);

      logger.info(`Connected to MongoDB: ${this.dbName}`);
    } catch (error) {
      logger.error(`MongoDB connection failed: ${this.dbName}`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info(`MongoDB disconnected: ${this.dbName}`);
    }
  }

  getDb(): Db {
    if (!this.db) throw new Error(`Database not connected: ${this.dbName}`);
    return this.db;
  }

  getCollection<TDoc extends BaseMealDocument = BaseMealDocument>(): Collection<TDoc> {
    return this.getDb().collection<TDoc>(this.collectionName);
  }

  async createIndexes(indexes: IndexDescription[]): Promise<void> {
    if (!this.db) throw new Error(`Database not connected: ${this.dbName}`);
    const collection = this.getCollection();
    if (indexes.length > 0) {
      await collection.createIndexes(indexes);
    }
  }

  async saveMealData<TData>(date: string, data: TData, extra?: Record<string, unknown>): Promise<void> {
    const collection = this.getCollection();
    const now = new Date();

    const existingDoc = await collection.findOne({ _id: date });

    if (existingDoc) {
      await collection.updateOne({ _id: date }, { $set: { data, ...extra, updatedAt: now } });
      logger.info(`Updated meal data [${this.dbName}]: ${date}`);
    } else {
      await collection.insertOne({
        _id: date,
        data,
        ...extra,
        createdAt: now,
        updatedAt: now,
      } as never);
      logger.info(`Saved meal data [${this.dbName}]: ${date}`);
    }
  }

  async getMealData<TData>(date: string): Promise<TData | null> {
    const collection = this.getCollection();
    const document = await collection.findOne({ _id: date });
    return (document?.data as TData) || null;
  }

  async getStats(): Promise<{ totalMealData: number; lastUpdated: Date | null }> {
    const collection = this.getCollection();
    const totalMealData = await collection.countDocuments();
    const lastDocument = await collection.findOne({}, { sort: { updatedAt: -1 } });

    return {
      totalMealData,
      lastUpdated: lastDocument?.updatedAt || null,
    };
  }
}
