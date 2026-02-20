import { db } from "./db";
import { users, userCollections, type User, type InsertUser } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getCollection(userId: string): Promise<Record<string, any>>;
  saveCollection(userId: string, data: Record<string, any>): Promise<void>;
  upgradeToPremium(userId: string): Promise<void>;
  setVerificationCode(userId: string, code: string, expiry: Date): Promise<void>;
  verifyUser(userId: string): Promise<void>;
  setResetCode(userId: string, code: string, expiry: Date): Promise<void>;
  clearResetCode(userId: string): Promise<void>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
}

export const storage: IStorage = {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  },

  async createUser(insertUser: InsertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  },

  async deleteUser(id: string) {
    await db.delete(userCollections).where(eq(userCollections.userId, id));
    await db.delete(users).where(eq(users.id, id));
  },

  async getCollection(userId: string) {
    const [row] = await db.select().from(userCollections).where(eq(userCollections.userId, userId));
    return (row?.data as Record<string, any>) || {};
  },

  async saveCollection(userId: string, data: Record<string, any>) {
    const [existing] = await db.select().from(userCollections).where(eq(userCollections.userId, userId));
    if (existing) {
      await db.update(userCollections)
        .set({ data, updatedAt: new Date() })
        .where(eq(userCollections.userId, userId));
    } else {
      await db.insert(userCollections).values({ userId, data });
    }
  },

  async upgradeToPremium(userId: string) {
    await db.update(users)
      .set({ isPremium: true })
      .where(eq(users.id, userId));
  },

  async setVerificationCode(userId: string, code: string, expiry: Date) {
    await db.update(users)
      .set({ verificationCode: code, verificationExpiry: expiry })
      .where(eq(users.id, userId));
  },

  async verifyUser(userId: string) {
    await db.update(users)
      .set({ isVerified: true, verificationCode: null, verificationExpiry: null })
      .where(eq(users.id, userId));
  },

  async setResetCode(userId: string, code: string, expiry: Date) {
    await db.update(users)
      .set({ resetCode: code, resetExpiry: expiry })
      .where(eq(users.id, userId));
  },

  async clearResetCode(userId: string) {
    await db.update(users)
      .set({ resetCode: null, resetExpiry: null })
      .where(eq(users.id, userId));
  },

  async updatePassword(userId: string, hashedPassword: string) {
    await db.update(users)
      .set({ password: hashedPassword, resetCode: null, resetExpiry: null })
      .where(eq(users.id, userId));
  },
};
