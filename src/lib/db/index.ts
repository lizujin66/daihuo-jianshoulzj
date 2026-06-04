import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

// 数据库文件路径，放在项目根目录的 data 目录下
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "sqlite.db");

let dbInstance: any = null;

// 补齐 projects 表中历史版本可能缺失的列
function ensureColumn(sqlite: any, table: string, column: string, definition: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c: any) => c.name === column)) {
      sqlite.exec(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition};`);
      console.log(`Patched: Added missing column \`${column}\` to \`${table}\`.`);
    }
  } catch (e) {
    console.error(`Failed to patch column \`${column}\` on \`${table}\`:`, e);
  }
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

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

  try {
    // 1. projects 表
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`projects\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL,
        \`status\` text DEFAULT 'draft' NOT NULL,
        \`product_name\` text,
        \`product_category\` text,
        \`product_description\` text,
        \`product_images\` text DEFAULT '[]',
        \`product_analysis\` text,
        \`product_id\` text,
        \`brand_id\` text,
        \`template_id\` text,
        \`video_mode\` text DEFAULT 'product_closeup',
        \`source_type\` text DEFAULT 'manual',
        \`source_video_url\` text,
        \`character_id\` text,
        \`created_at\` integer,
        \`updated_at\` integer
      )
    `);

    // 2. scripts 表
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

    // 3. assets 表
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

    // 4. video_clips 表
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
        \`transition_type\` text DEFAULT 'ai_start_end',
        \`status\` text DEFAULT 'pending' NOT NULL,
        \`created_at\` integer,
        FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade,
        FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON UPDATE no action ON DELETE no action
      )
    `);

    // 5. compositions 表
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

    // 6. products 表
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL,
        \`category\` text NOT NULL,
        \`description\` text,
        \`images\` text DEFAULT '[]',
        \`price\` text,
        \`target_audience\` text,
        \`analysis\` text,
        \`video_count\` integer DEFAULT 0,
        \`created_at\` integer,
        \`updated_at\` integer
      )
    `);

    // 7. brand_settings 表
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`brand_settings\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL,
        \`logo_path\` text,
        \`primary_color\` text,
        \`secondary_color\` text,
        \`font_family\` text,
        \`watermark\` text,
        \`intro_template_path\` text,
        \`outro_template_path\` text,
        \`is_default\` integer DEFAULT true,
        \`created_at\` integer
      )
    `);

    // 8. script_templates 表
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`script_templates\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL,
        \`description\` text,
        \`category\` text,
        \`video_mode\` text,
        \`style_type\` text,
        \`shots\` text DEFAULT '[]',
        \`source_project_id\` text,
        \`use_count\` integer DEFAULT 0,
        \`created_at\` integer
      )
    `);

    // 9. characters 表
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`characters\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL,
        \`description\` text,
        \`appearance\` text,
        \`reference_images\` text DEFAULT '[]',
        \`voice_profile\` text,
        \`is_default\` integer DEFAULT false,
        \`created_at\` integer,
        \`updated_at\` integer
      )
    `);

    // 10. settings 表
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`settings\` (
        \`key\` text PRIMARY KEY NOT NULL,
        \`value\` text,
        \`updated_at\` integer
      )
    `);

    console.log("Database tables ensured successfully.");
  } catch (e) {
    console.error("Failed to initialize database tables:", e);
  }

  // 补齐 projects 表中历史版本可能缺失 of 字段
  ensureColumn(sqlite, "projects", "product_id", "text");
  ensureColumn(sqlite, "projects", "brand_id", "text");
  ensureColumn(sqlite, "projects", "template_id", "text");
  ensureColumn(sqlite, "projects", "video_mode", "text DEFAULT 'product_closeup'");
  ensureColumn(sqlite, "projects", "source_type", "text DEFAULT 'manual'");
  ensureColumn(sqlite, "projects", "source_video_url", "text");
  ensureColumn(sqlite, "projects", "character_id", "text");

  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}

// 导出 db 作为一个 Getter Proxy，确保如果任何文件直接 import { db }，它也能懒加载
export const db = new Proxy({} as any, {
  get(target, prop) {
    return getDb()[prop];
  }
});
