const express = require('express');
const db = require('../db/azureSql');
const { requireRole } = require('../middleware/auth');
const { parseId } = require('../utils/validate');
const HttpError = require('../utils/httpError');
const router = express.Router();
const ROLES = ['user', 'admin', 'sysadmin'];
router.use(requireRole('sysadmin'));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/users', async (req, res) => {
  const { recordset } = await db.query(`SELECT id, email, full_name AS fullName, role, created_at AS createdAt
    FROM dbo.users ORDER BY created_at DESC, id DESC`);
  res.json({ users: recordset });
});

router.get('/role-history', async (req, res) => {
  const { recordset } = await db.query(`SELECT TOP (100) h.id, h.previous_role AS previousRole,
    h.new_role AS newRole, h.changed_at AS changedAt, u.email AS targetEmail, a.email AS actorEmail
    FROM dbo.user_role_history h JOIN dbo.users u ON u.id=h.user_id
    LEFT JOIN dbo.users a ON a.id=h.changed_by ORDER BY h.id DESC`);
  res.json({ history: recordset });
});

router.patch('/users/:id/role', async (req, res) => {
  const id = parseId(req.params.id);
  const { role, previousRole } = req.body ?? {};
  if (!ROLES.includes(role) || !ROLES.includes(previousRole)) throw new HttpError(400, 'Neplatná rola');
  if (id === req.session.userId) throw new HttpError(409, 'Vlastnú rolu nemôžete meniť.');
  try {
    // Serialize role changes across all server instances and recheck the actor
    // inside the transaction. The update and its audit record commit together.
    const { recordset } = await db.query(`SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @lockResult int;
        EXEC @lockResult = sys.sp_getapplock @Resource=N'user-role-management',
          @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000;
        IF @lockResult < 0 THROW 51004, 'Správa rolí je zaneprázdnená. Skúste znova.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id=@actorId AND role=N'sysadmin')
          THROW 51003, 'Nedostatočné oprávnenie', 1;
        DECLARE @oldRole nvarchar(20);
        SELECT @oldRole=role FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE id=@id;
        IF @oldRole IS NULL THROW 51001, 'Používateľ neexistuje', 1;
        IF @oldRole <> @previousRole THROW 51002, 'Rola sa medzičasom zmenila. Obnovte zoznam.', 1;
        IF @oldRole=N'sysadmin' AND @role<>N'sysadmin'
          AND (SELECT COUNT(*) FROM dbo.users WHERE role=N'sysadmin') <= 1
          THROW 51002, 'Posledný správca systému musí zostať zachovaný.', 1;
        IF @oldRole <> @role
        BEGIN
          UPDATE dbo.users SET role=@role WHERE id=@id;
          INSERT INTO dbo.user_role_history(user_id,previous_role,new_role,changed_by)
            VALUES(@id,@oldRole,@role,@actorId);
        END;
        COMMIT;
        SELECT id,email,full_name AS fullName,role FROM dbo.users WHERE id=@id;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
      END CATCH;`, { id, role, previousRole, actorId: req.session.userId });
    res.json({ user: recordset[0] });
  } catch (err) {
    const status = { 51001: 404, 51002: 409, 51003: 403, 51004: 409 }[err.number];
    if (status) throw new HttpError(status, err.message);
    throw err;
  }
});
module.exports = router;
