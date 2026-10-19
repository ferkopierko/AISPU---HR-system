// Vytvorí admin účet, alebo existujúcemu používateľovi nastaví rolu admin.
// Použitie (z priečinka backend-1):  npm run create-admin -- <email> <heslo>

const bcrypt = require('bcrypt');
const db = require('../src/db/azureSql');
const { parseEmail, parsePassword } = require('../src/utils/validate');

async function main() {
  const [rawEmail, rawPassword] = process.argv.slice(2);
  if (!rawEmail || !rawPassword) {
    throw new Error('Použitie: npm run create-admin -- <email> <heslo>');
  }
  const email = parseEmail(rawEmail);
  const passwordHash = await bcrypt.hash(parsePassword(rawPassword), 12);

  const { recordset } = await db.query(
    `MERGE dbo.users AS t
     USING (SELECT @email AS email) AS s ON t.email = s.email
     WHEN MATCHED THEN UPDATE SET role = N'admin', password_hash = @passwordHash
     WHEN NOT MATCHED THEN INSERT (email, password_hash, role) VALUES (@email, @passwordHash, N'admin')
     OUTPUT $action AS action, inserted.id;`,
    { email, passwordHash }
  );
  const { action, id } = recordset[0];
  console.log(`${action === 'INSERT' ? 'Vytvorený' : 'Aktualizovaný'} admin ${email} (id ${id})`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.closePool());
