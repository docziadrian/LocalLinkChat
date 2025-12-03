import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "locallinkchat.db");
const db = new Database(dbPath);

try {
  // Find users with "Dóczi" in name or full_name
  const usersToUpdate = db
    .prepare(`
      SELECT id, name, full_name, email 
      FROM users 
      WHERE name LIKE '%Dóczi%' OR full_name LIKE '%Dóczi%'
    `)
    .all() as Array<{ id: string; name: string | null; full_name: string | null; email: string }>;

  if (usersToUpdate.length === 0) {
    console.log("No users found with 'Dóczi' in name");
    db.close();
    process.exit(0);
  }

  console.log(`Found ${usersToUpdate.length} user(s) to update:\n`);
  
  const updateStmt = db.prepare(`
    UPDATE users 
    SET name = ?, full_name = ? 
    WHERE id = ?
  `);

  for (const user of usersToUpdate) {
    const newName = user.name ? user.name.replace(/Dóczi/g, "Daczi") : user.name;
    const newFullName = user.full_name ? user.full_name.replace(/Dóczi/g, "Daczi") : user.full_name;
    
    console.log(`Before:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name || '(null)'}`);
    console.log(`  FullName: ${user.full_name || '(null)'}`);
    
    updateStmt.run(newName, newFullName, user.id);
    
    console.log(`After:`);
    console.log(`  Name: ${newName || '(null)'}`);
    console.log(`  FullName: ${newFullName || '(null)'}`);
    console.log(`✓ Updated user ${user.id}\n`);
  }

  console.log("✅ Update completed successfully!");
  db.close();
} catch (error) {
  console.error("❌ Error updating user name:", error);
  db.close();
  process.exit(1);
}
