import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import type { MongoDBService } from "@/core/mongodb";
import { parseLocalDate } from "@/utils/date";

export async function getCachedMealDataOrThrow<TData>(db: MongoDBService, dateParam: string): Promise<TData> {
  const cachedData = await db.getMealData<TData>(dateParam);
  if (cachedData) {
    return cachedData;
  }

  const collection = db.getCollection();
  const [earliest] = await collection.find().sort({ _id: 1 }).limit(1).toArray();
  const [latest] = await collection.find().sort({ _id: -1 }).limit(1).toArray();

  if (!earliest || !latest) {
    throw new MealNotFoundError();
  }

  const targetDate = parseLocalDate(dateParam);
  const earliestDate = parseLocalDate(earliest._id);
  const latestDate = parseLocalDate(latest._id);

  if (targetDate < earliestDate || targetDate > latestDate) {
    throw new MealNotFoundError();
  }

  throw new MealNoOperationError();
}
