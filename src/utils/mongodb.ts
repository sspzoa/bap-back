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
      return;
    }

    try {
      this.client = new MongoClient(CONFIG.MONGODB.URI, {
        tls: true,
        tlsAllowInvalidCertificates: true,
        tlsAllowInvalidHostnames: true,
      });

      await this.client.connect();
      this.db = this.client.db(CONFIG.MONGODB.DB_NAME);

      await this.createIndexes();

      logger.info('MongoDB connected successfully');
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const collection = this.db.collection<MealDataDocument>(CONFIG.MONGODB.COLLECTION);
    await collection.createIndex({ updatedAt: -1 });
    await collection.createIndex({ documentId: 1 });

    logger.info('MongoDB indexes created');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info('MongoDB disconnected');
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  getMealDataCollection(): Collection<MealDataDocument> {
    return this.getDb().collection<MealDataDocument>(CONFIG.MONGODB.COLLECTION);
  }

  async saveMealData(date: string, data: CafeteriaResponse, documentId: string): Promise<void> {
    const collection = this.getMealDataCollection();
    const now = new Date();

    const document: MealDataDocument = {
      _id: date,
      data,
      documentId,
      updatedAt: now,
      createdAt: now,
    };

    await collection.replaceOne(
      { _id: date },
      document,
      { upsert: true }
    );

    logger.info(`Meal data saved for date: ${date}`);
  }

  async getMealData(date: string): Promise<CafeteriaResponse | null> {
    const collection = this.getMealDataCollection();
    const document = await collection.findOne({ _id: date });

    if (document) {
      logger.info(`Meal data found in MongoDB for date: ${date}`);
      return document.data;
    }

    return null;
  }

  async getStats(): Promise<{
    totalMealData: number;
    lastUpdated: Date | null;
  }> {
    const collection = this.getMealDataCollection();

    const totalMealData = await collection.countDocuments();

    const lastMealData = await collection
      .findOne({}, { sort: { updatedAt: -1 } });

    return {
      totalMealData,
      lastUpdated: lastMealData?.updatedAt || null,
    };
  }
}

export const mongoDB = new MongoDBService();