import { type Collection, type Db, MongoClient } from 'mongodb';
import { CONFIG } from '../config';
import type { CafeteriaData, MealDataDocument } from '../types';
import { logger } from './logger';

class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    if (this.client && this.db) {
      return;
    }

    try {
      logger.info('Connecting to MongoDB');
      this.client = new MongoClient(CONFIG.MONGODB.URI, {
        tls: true,
        tlsAllowInvalidCertificates: true,
        tlsAllowInvalidHostnames: true,
      });

      await this.client.connect();
      this.db = this.client.db(CONFIG.MONGODB.DB_NAME);
      await this.createIndexes();

      logger.info(`Connected to MongoDB: ${CONFIG.MONGODB.DB_NAME}`);
    } catch (error) {
      logger.error('MongoDB connection failed', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const collection = this.db.collection<MealDataDocument>(CONFIG.MONGODB.COLLECTION);
    await collection.createIndex({ documentId: 1 });
    await collection.createIndex({ createdAt: 1 });
    await collection.createIndex({ updatedAt: 1 });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info('MongoDB disconnected');
    }
  }

  private getDb(): Db {
    if (!this.db) throw new Error('Database not connected');
    return this.db;
  }

  private getMealDataCollection(): Collection<MealDataDocument> {
    return this.getDb().collection<MealDataDocument>(CONFIG.MONGODB.COLLECTION);
  }

  async saveMealData(date: string, data: CafeteriaData, documentId: string): Promise<void> {
    const collection = this.getMealDataCollection();
    const now = new Date();

    const existingDoc = await collection.findOne({ _id: date });

    if (existingDoc) {
      await collection.updateOne(
        { _id: date },
        {
          $set: {
            data,
            documentId,
            updatedAt: now,
          },
        },
      );
      logger.info(`Updated meal data: ${date}`);
    } else {
      await collection.insertOne({
        _id: date,
        data,
        documentId,
        createdAt: now,
        updatedAt: now,
      });
      logger.info(`Saved meal data: ${date}`);
    }
  }

  async getMealData(date: string): Promise<CafeteriaData | null> {
    const collection = this.getMealDataCollection();
    const document = await collection.findOne({ _id: date });
    return document?.data || null;
  }

  async getStats(): Promise<{
    totalMealData: number;
    lastUpdated: Date | null;
  }> {
    const collection = this.getMealDataCollection();
    const totalMealData = await collection.countDocuments();

    const lastDocument = await collection.findOne({}, { sort: { updatedAt: -1 } });

    return {
      totalMealData,
      lastUpdated: lastDocument?.updatedAt || null,
    };
  }

  async getDateRange(): Promise<{ earliest: string | null; latest: string | null }> {
    const collection = this.getMealDataCollection();

    const [earliest] = await collection.find().sort({ _id: 1 }).limit(1).toArray();
    const [latest] = await collection.find().sort({ _id: -1 }).limit(1).toArray();

    return {
      earliest: earliest?._id || null,
      latest: latest?._id || null,
    };
  }
}

export const mongoDB = new MongoDBService();
