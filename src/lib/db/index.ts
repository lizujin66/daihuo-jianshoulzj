import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

// 数据库文件路径，放在项目根目录的 data 目录下
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "sqlite.db");

// 确保 data 目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 创建 better-sqlite3 连接实例
const sqlite = new Database(DB_PATH);

// Ensure the `product_id` column exists in `projects` (for older DBs)
try {
  const hasProductId = sqlite
    .prepare(`PRAGMA table_info(projects)`)
    .all()
    .some((col) => col.name === "product_id");
  if (!hasProductId) {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN product_id text;`);
    console.log("Added missing `product_id` column to `projects` table.");
  }
} catch (e) {
  console.error("Failed to ensure `product_id` column:", e);
}

// 开启 WAL 模式，提升并发读写性能
sqlite.pragma("journal_mode = WAL");
// 开启外键约束
sqlite.pragma("foreign_keys = ON");

// 创建 drizzle ORM 实例，绑定 schema 以支持关系查询
export const db = drizzle(sqlite, { schema });

// 服务启动时，自动运行数据库迁移
try {
  // Debug info – show cwd and candidates for migrations folder
  console.log("process.cwd():", process.cwd());
  console.log("migration candidates:", migrationCandidates);

} catch (error) {
  console.error("Failed to run database migrations:", error);
}

// 兼容函数式调用
export function getDb() {
  return db;
}
