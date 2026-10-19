-- =====================================================================
-- AISPU HR systém – Azure SQL Database (Backend 1)
-- Schéma: users, jobs, applications
-- Dialekt: T-SQL (Azure SQL / SQL Server)
-- Skript je idempotentný – opakované spustenie nič nepokazí.
-- =====================================================================

-- ---------------------------------------------------------------------
-- users – používatelia systému (user = uchádzač, admin = HR)
-- ---------------------------------------------------------------------
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id            INT IDENTITY(1,1) NOT NULL,
        email         NVARCHAR(255)     NOT NULL,
        password_hash NVARCHAR(255)     NOT NULL,
        role          NVARCHAR(20)      NOT NULL CONSTRAINT DF_users_role DEFAULT N'user',
        created_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_users       PRIMARY KEY (id),
        CONSTRAINT UQ_users_email UNIQUE (email),
        CONSTRAINT CK_users_role  CHECK (role IN (N'user', N'admin'))
    );
END;
GO

-- ---------------------------------------------------------------------
-- jobs – pracovné pozície
-- ---------------------------------------------------------------------
IF OBJECT_ID(N'dbo.jobs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.jobs (
        id           INT IDENTITY(1,1) NOT NULL,
        title        NVARCHAR(200)     NOT NULL,
        department   NVARCHAR(100)     NOT NULL,
        description  NVARCHAR(MAX)     NULL,
        requirements NVARCHAR(MAX)     NULL,   -- požadované zručnosti (text / JSON pole)
        status       NVARCHAR(20)      NOT NULL CONSTRAINT DF_jobs_status DEFAULT N'open',

        CONSTRAINT PK_jobs        PRIMARY KEY (id),
        CONSTRAINT CK_jobs_status CHECK (status IN (N'draft', N'open', N'closed'))
    );
END;
GO

-- ---------------------------------------------------------------------
-- applications – prihlášky uchádzača na pozíciu
-- ---------------------------------------------------------------------
IF OBJECT_ID(N'dbo.applications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.applications (
        id         INT IDENTITY(1,1) NOT NULL,
        user_id    INT               NOT NULL,
        job_id     INT               NOT NULL,
        status     NVARCHAR(20)      NOT NULL CONSTRAINT DF_applications_status DEFAULT N'submitted',
        created_at DATETIME2(0)      NOT NULL CONSTRAINT DF_applications_created_at DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_applications          PRIMARY KEY (id),
        CONSTRAINT FK_applications_users    FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
        CONSTRAINT FK_applications_jobs     FOREIGN KEY (job_id)  REFERENCES dbo.jobs(id)  ON DELETE CASCADE,
        CONSTRAINT UQ_applications_user_job UNIQUE (user_id, job_id),
        CONSTRAINT CK_applications_status   CHECK (status IN (N'submitted', N'reviewing', N'interview', N'accepted', N'rejected'))
    );

    CREATE INDEX IX_applications_job_id ON dbo.applications (job_id);
END;
GO

-- =====================================================================
-- Migrácia (fáza 2): roly user/admin a stav 'interview'
-- Pre databázu nasadenú pôvodnou schémou (candidate/hr/admin, bez interview).
-- Na novej databáze sa nič nevykoná.
-- =====================================================================

-- users.role: candidate -> user, hr -> admin
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = N'CK_users_role' AND definition LIKE N'%candidate%')
BEGIN
    ALTER TABLE dbo.users DROP CONSTRAINT CK_users_role;
    ALTER TABLE dbo.users DROP CONSTRAINT DF_users_role;

    UPDATE dbo.users SET role = N'user'  WHERE role = N'candidate';
    UPDATE dbo.users SET role = N'admin' WHERE role = N'hr';

    ALTER TABLE dbo.users ADD CONSTRAINT DF_users_role DEFAULT N'user' FOR role;
    ALTER TABLE dbo.users ADD CONSTRAINT CK_users_role CHECK (role IN (N'user', N'admin'));
END;
GO

-- applications.status: pridať 'interview' (pozvaný na pohovor)
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = N'CK_applications_status' AND definition NOT LIKE N'%interview%')
BEGIN
    ALTER TABLE dbo.applications DROP CONSTRAINT CK_applications_status;
    ALTER TABLE dbo.applications ADD CONSTRAINT CK_applications_status
        CHECK (status IN (N'submitted', N'reviewing', N'interview', N'accepted', N'rejected'));
END;
GO
