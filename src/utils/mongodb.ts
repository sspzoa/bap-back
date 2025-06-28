import { MongoClient, type Db, type Collection } from 'mongodb';
import { CONFIG } from '../config';
import { logger } from './logger';
import type { CafeteriaResponse } from '../types';

interface MealDataDocument {
  _id: string;
  data: CafeteriaResponse;
  documentId: string;
  updatedAt: Date;
  createdAt: Date;
}

class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    if (this.client && this.db) {
      logger.info('MongoDB already connected');
      return;
    }

    try {
      logger.info('Connecting to MongoDB...');
      this.client = new MongoClient(CONFIG.MONGODB.URI, {
        tls: true,
        tlsAllowInvalidCertificates: true,
        tlsAllowInvalidHostnames: true,
      });

      await this.client.connect();
      this.db = this.client.db(CONFIG.MONGODB.DB_NAME);

      await this.createIndexes();
      logger.info(`Connected to MongoDB database: ${CONFIG.MONGODB.DB_NAME}`);
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    logger.info('Creating MongoDB indexes...');
    const collection = this.db.collection<MealDataDocument>(CONFIG.MONGODB.COLLECTION);
    await collection.createIndex({ updatedAt: -1 });
    await collection.createIndex({ documentId: 1 });
    logger.info('MongoDB indexes created');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      logger.info('Disconnecting from MongoDB...');
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

  async saveMealData(date: string, data: CafeteriaResponse, documentId: string): Promise<void> {
    const collection = this.getMealDataCollection();
    const now = new Date();

    logger.info(`Saving meal data for ${date}`);

    const result = await collection.findOneAndUpdate(
      { _id: date },
      {
        $set: {
          data,
          documentId,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        }
      },
      { upsert: true, returnDocument: 'before' }
    );

    const isUpdate = result !== null;
    logger.info(`Meal data ${isUpdate ? 'updated' : 'created'} for ${date}`);
  }

  async getMealData(date: string): Promise<CafeteriaResponse | null> {
    const collection = this.getMealDataCollection();
    logger.info(`Querying meal data for ${date}`);

    const document = await collection.findOne({ _id: date });

    if (document) {
      logger.info(`Found meal data for ${date}`);
      return document.data;
    }

    logger.info(`No meal data found for ${date}`);
    return null;
  }

  async getStats(): Promise<{
    totalMealData: number;
    lastUpdated: Date | null;
  }> {
    logger.info('Getting MongoDB statistics');
    const collection = this.getMealDataCollection();
    const totalMealData = await collection.countDocuments();
    const lastMealData = await collection.findOne({}, { sort: { updatedAt: -1 } });

    const stats = {
      totalMealData,
      lastUpdated: lastMealData?.updatedAt || null,
    };

    logger.info(`MongoDB stats: ${totalMealData} documents, last updated: ${stats.lastUpdated?.toISOString() || 'never'}`);
    return stats;
  }
}

export const mongoDB = new MongoDBService();