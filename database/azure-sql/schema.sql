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
        consent_at DATETIME2(0)      NULL,   -- čas súhlasu so spracovaním osobných údajov (GDPR)
        candidate_name  NVARCHAR(200) NULL,  -- meno z CV (rozpozná Backend 2)
        candidate_phone NVARCHAR(50)  NULL,  -- telefón z CV (rozpozná Backend 2)

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

-- applications.consent_at: čas GDPR súhlasu (fáza 4 – prepojenie s frontendom)
IF COL_LENGTH(N'dbo.applications', N'consent_at') IS NULL
    ALTER TABLE dbo.applications ADD consent_at DATETIME2(0) NULL;
GO

-- applications.candidate_name / candidate_phone: kontakt vytiahnutý z CV (Backend 2)
IF COL_LENGTH(N'dbo.applications', N'candidate_name') IS NULL
    ALTER TABLE dbo.applications ADD candidate_name NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.applications', N'candidate_phone') IS NULL
    ALTER TABLE dbo.applications ADD candidate_phone NVARCHAR(50) NULL;
GO

-- ---------------------------------------------------------------------
-- application_cvs – súbor CV k prihláške (posiela ho Backend 2 po analýze)
-- Samostatná tabuľka, aby zoznamy prihlášok nenačítavali veľké binárne dáta.
-- ---------------------------------------------------------------------
IF OBJECT_ID(N'dbo.application_cvs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.application_cvs (
        application_id INT            NOT NULL,
        filename       NVARCHAR(255)  NOT NULL,
        content_type   NVARCHAR(100)  NOT NULL,
        size_bytes     INT            NOT NULL,
        data           VARBINARY(MAX) NOT NULL,
        uploaded_at    DATETIME2(0)   NOT NULL CONSTRAINT DF_application_cvs_uploaded_at DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_application_cvs              PRIMARY KEY (application_id),
        CONSTRAINT FK_application_cvs_applications FOREIGN KEY (application_id)
            REFERENCES dbo.applications(id) ON DELETE CASCADE,
        CONSTRAINT CK_application_cvs_content_type CHECK (content_type IN (
            N'application/pdf',
            N'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
    );
END;
GO

-- ---------------------------------------------------------------------
-- application_notes – poznámky HR k prihláške (iba pridávanie, bez úprav)
-- author_id je bez ON DELETE CASCADE: SQL Server nepovolí dve kaskádové
-- cesty z users (users -> applications -> notes a users -> notes).
-- ---------------------------------------------------------------------
IF OBJECT_ID(N'dbo.application_notes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.application_notes (
        id             INT IDENTITY(1,1) NOT NULL,
        application_id INT               NOT NULL,
        author_id      INT               NOT NULL,
        text           NVARCHAR(2000)    NOT NULL,
        created_at     DATETIME2(0)      NOT NULL CONSTRAINT DF_application_notes_created_at DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_application_notes              PRIMARY KEY (id),
        CONSTRAINT FK_application_notes_applications FOREIGN KEY (application_id)
            REFERENCES dbo.applications(id) ON DELETE CASCADE,
        CONSTRAINT FK_application_notes_users        FOREIGN KEY (author_id) REFERENCES dbo.users(id)
    );

    CREATE INDEX IX_application_notes_application_id ON dbo.application_notes (application_id);
END;
GO

-- =====================================================================
-- Profil uchádzača a rozšírené údaje o pozícii
-- Stĺpce sa pridávajú iba tu (aj pre novú DB), CHECK v samostatnej dávke,
-- lebo nový stĺpec musí existovať už pri preklade dávky.
-- =====================================================================

-- users: meno a telefón z registrácie / profilu
IF COL_LENGTH(N'dbo.users', N'full_name') IS NULL
    ALTER TABLE dbo.users ADD full_name NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.users', N'phone') IS NULL
    ALTER TABLE dbo.users ADD phone NVARCHAR(50) NULL;
GO

-- jobs: lokalita, úväzok, režim práce, plat, náplň, benefity, zverejnenie, uzávierka
IF COL_LENGTH(N'dbo.jobs', N'location') IS NULL
    ALTER TABLE dbo.jobs ADD location NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.jobs', N'employment_type') IS NULL
    ALTER TABLE dbo.jobs ADD employment_type NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.jobs', N'work_mode') IS NULL
    ALTER TABLE dbo.jobs ADD work_mode NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.jobs', N'salary_min') IS NULL
    ALTER TABLE dbo.jobs ADD salary_min INT NULL;
IF COL_LENGTH(N'dbo.jobs', N'salary_max') IS NULL
    ALTER TABLE dbo.jobs ADD salary_max INT NULL;
IF COL_LENGTH(N'dbo.jobs', N'salary_period') IS NULL
    ALTER TABLE dbo.jobs ADD salary_period NVARCHAR(10) NULL;
IF COL_LENGTH(N'dbo.jobs', N'responsibilities') IS NULL
    ALTER TABLE dbo.jobs ADD responsibilities NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.jobs', N'benefits') IS NULL
    ALTER TABLE dbo.jobs ADD benefits NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.jobs', N'published_at') IS NULL
    ALTER TABLE dbo.jobs ADD published_at DATETIME2(0) NULL;  -- prvé otvorenie (status open)
IF COL_LENGTH(N'dbo.jobs', N'deadline') IS NULL
    ALTER TABLE dbo.jobs ADD deadline DATE NULL;              -- posledný deň na prihlásenie
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_jobs_employment_type')
    ALTER TABLE dbo.jobs ADD CONSTRAINT CK_jobs_employment_type
        CHECK (employment_type IN (N'full_time', N'part_time', N'contract', N'internship'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_jobs_work_mode')
    ALTER TABLE dbo.jobs ADD CONSTRAINT CK_jobs_work_mode
        CHECK (work_mode IN (N'onsite', N'hybrid', N'remote'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_jobs_salary')
    ALTER TABLE dbo.jobs ADD CONSTRAINT CK_jobs_salary
        CHECK (salary_min >= 0 AND salary_max >= 0 AND salary_min <= salary_max);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_jobs_salary_period')
    ALTER TABLE dbo.jobs ADD CONSTRAINT CK_jobs_salary_period
        CHECK (salary_period IN (N'month', N'year', N'hour'));

-- už otvorené pozície dostanú dátum zverejnenia (iba raz, potom už nie sú NULL)
UPDATE dbo.jobs SET published_at = SYSUTCDATETIME() WHERE status = N'open' AND published_at IS NULL;
GO
