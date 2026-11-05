// Bootstrap a trusted, existing account without changing its password.
// npm run create-system-admin -- email@example.com
const db = require('../src/db/azureSql');
const { parseEmail } = require('../src/utils/validate');
async function main() {
  const email = parseEmail(process.argv[2]);
  const { recordset } = await db.query(`SET XACT_ABORT ON;
    BEGIN TRY
      BEGIN TRANSACTION;
      DECLARE @lockResult int;
      EXEC @lockResult=sys.sp_getapplock @Resource=N'user-role-management',
        @LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
      IF @lockResult < 0 THROW 51004,'Správa rolí je zaneprázdnená.',1;
      IF NOT EXISTS(SELECT 1 FROM dbo.users WHERE email=@email)
        THROW 51001,'Účet neexistuje. Najprv ho zaregistrujte.',1;
      DECLARE @changes TABLE(user_id int,previous_role nvarchar(20),new_role nvarchar(20));
      UPDATE dbo.users SET role=N'sysadmin'
        OUTPUT inserted.id,deleted.role,inserted.role INTO @changes
        WHERE email=@email AND role<>N'sysadmin';
      INSERT INTO dbo.user_role_history(user_id,previous_role,new_role)
        SELECT user_id,previous_role,new_role FROM @changes;
      COMMIT;
      SELECT id,email,role FROM dbo.users WHERE email=@email;
    END TRY
    BEGIN CATCH
      IF @@TRANCOUNT > 0 ROLLBACK;
      THROW;
    END CATCH;`, { email });
  console.log(`Správca systému: ${recordset[0].email} (id ${recordset[0].id})`);
}
main().catch((err) => { console.error(err.message); process.exitCode=1; }).finally(() => db.closePool());
