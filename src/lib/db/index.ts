import { drizzle } from "drizzle-orm/better-sqlite3";
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

// 开启 WAL 模式，提升并发读写性能
sqlite.pragma("journal_mode = WAL");
// 开启外键约束
sqlite.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------
// 在启动时内联建表（IF NOT EXISTS），无需依赖外部迁移文件
// 生产环境和开发环境均适用
// ---------------------------------------------------------------------
try {
  // 创建 projects 表（含 product_id）
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS \`projects\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`name\` text NOT NULL,
      \`status\` text DEFAULT 'draft' NOT NULL,
      \`product_id\` text,
      \`product_name\` text,
      \`product_category\` text,
      \`product_description\` text,
      \`product_images\` text DEFAULT '[]',
      \`product_analysis\` text,
      \`created_at\` integer,
      \`updated_at\` integer
    )
  `);

  // 创建 assets 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS \`assets\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`project_id\` text NOT NULL,
      \`shot_id\` integer NOT NULL,
      \`type\` text NOT NULL,
      \`file_path\` text,
      \`thumbnail_path\` text,
      \`provider\` text,
      \`model\` text,
      \`prompt\` text,
      \`status\` text DEFAULT 'pending' NOT NULL,
      \`created_at\` integer,
      FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `);

  // 创建 compositions 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS \`compositions\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`project_id\` text NOT NULL,
      \`output_path\` text,
      \`resolution\` text DEFAULT '1080p',
      \`aspect_ratio\` text DEFAULT '9:16',
      \`duration\` integer,
      \`bgm_path\` text,
      \`tts_enabled\` integer DEFAULT false,
      \`subtitle_style\` text,
      \`status\` text DEFAULT 'pending' NOT NULL,
      \`created_at\` integer,
      FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `);

  // 创建 scripts 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS \`scripts\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`project_id\` text NOT NULL,
      \`version\` integer DEFAULT 1 NOT NULL,
      \`style_type\` text NOT NULL,
      \`title\` text,
      \`total_duration\` integer,
      \`shots\` text DEFAULT '[]',
      \`selected\` integer DEFAULT false,
      \`created_at\` integer,
      FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `);

  // 创建 settings 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS \`settings\` (
      \`key\` text PRIMARY KEY NOT NULL,
      \`value\` text,
      \`updated_at\` integer
    )
  `);

  // 创建 video_clips 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS \`video_clips\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`project_id\` text NOT NULL,
      \`shot_id\` integer NOT NULL,
      \`asset_id\` text,
      \`file_path\` text,
      \`duration\` integer,
      \`provider\` text,
      \`model\` text,
      \`transition_type\` text DEFAULT 'cut',
      \`status\` text DEFAULT 'pending' NOT NULL,
      \`created_at\` integer,
      FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON UPDATE no action ON DELETE no action
    )
  `);

  console.log("Database tables ensured successfully.");
} catch (e) {
  console.error("Failed to initialize database tables:", e);
}

// ---------------------------------------------------------------------
// 兼容旧库：若 projects 表已存在但缺少 product_id 列，则动态补列
// ---------------------------------------------------------------------
try {
  const cols = sqlite.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>;
  const hasProductId = cols.some((col) => col.name === "product_id");
  if (!hasProductId) {
    sqlite.exec(`ALTER TABLE \`projects\` ADD COLUMN \`product_id\` text;`);
    console.log("Patched: Added missing `product_id` column to `projects` table.");
  }
} catch (e) {
  console.error("Failed to patch `product_id` column:", e);
}

export const db = drizzle(sqlite, { schema });

// 兼容函数式调用
export function getDb() {
  return db;
}
