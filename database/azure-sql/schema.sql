-- =====================================================================
-- AISPU HR systém – Azure SQL Database (Backend 1)
-- Schéma: users, jobs, applications
-- Dialekt: T-SQL (Azure SQL / SQL Server)
-- Skript je idempotentný – opakované spustenie nič nepokazí.
-- =====================================================================

-- ---------------------------------------------------------------------
-- users – používatelia systému (uchádzači, HR, admin)
-- ---------------------------------------------------------------------
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id            INT IDENTITY(1,1) NOT NULL,
        email         NVARCHAR(255)     NOT NULL,
        password_hash NVARCHAR(255)     NOT NULL,
        role          NVARCHAR(20)      NOT NULL CONSTRAINT DF_users_role DEFAULT N'candidate',
        created_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_users       PRIMARY KEY (id),
        CONSTRAINT UQ_users_email UNIQUE (email),
        CONSTRAINT CK_users_role  CHECK (role IN (N'candidate', N'hr', N'admin'))
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
        CONSTRAINT CK_applications_status   CHECK (status IN (N'submitted', N'reviewing', N'accepted', N'rejected'))
    );

    CREATE INDEX IX_applications_job_id ON dbo.applications (job_id);
END;
GO
