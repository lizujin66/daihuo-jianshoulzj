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

// ---------------------------------------------------------------------
// 旧库（历史数据）可能缺少 product_id 列，这里在运行时补齐
// ---------------------------------------------------------------------
try {
  const hasProductId = sqlite
    .prepare(`PRAGMA table_info(projects)`)
    .all()
    // `col` 为查询结果的行对象，这里用 any 以便访问 name 属性
    .some((col: any) => col.name === "product_id");

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

// ---------------------------------------------------------------------
// Drizzle 迁移
// ---------------------------------------------------------------------
export const db = drizzle(sqlite, { schema });

try {
  // 迁移目录采用项目根目录的 drizzle 文件夹
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  console.log("Migrations folder resolved to:", migrationsFolder);
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
    console.log("Database migrations applied successfully.");
  } else {
    console.error("Migrations folder not found at:", migrationsFolder);
  }
} catch (error) {
  console.error("Failed to run database migrations:", error);
}

// 兼容函数式调用
export function getDb() {
  return db;
}
