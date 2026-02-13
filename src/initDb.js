require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("./db");

async function main() {
  const schemaPath = path.join(process.cwd(), "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await db.query(sql);
  console.log("✅ Database schema applied");
  await db.close();
}

main().catch(err => {
  console.error("❌ DB init failed:", err);
  process.exit(1);
});
