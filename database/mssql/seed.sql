-- =====================================================================
-- Testovacie dáta pre Backend 1 (idempotentné – dá sa spustiť opakovane).
--
-- Účty (heslá sú iba na lokálne testovanie):
--   hr@firma.sk   / Admin1234   – HR (admin)
--   jan@test.sk   / Heslo1234   – uchádzač (user)
-- =====================================================================

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = N'hr@firma.sk')
    INSERT INTO dbo.users (email, password_hash, role)
    VALUES (N'hr@firma.sk', N'$2a$12$wTdIv6kd4Q.iCmLig7TxKuKfwBt0ojy0WzV12dVGVTuJxPj3pQvui', N'admin');

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = N'jan@test.sk')
    INSERT INTO dbo.users (email, password_hash, role)
    VALUES (N'jan@test.sk', N'$2a$12$OdBYGVv4PiMHIDlsyJK91.NPtW.xXPAoobxzcPBesBm7NaFQQ.noi', N'user');

IF NOT EXISTS (SELECT 1 FROM dbo.jobs WHERE title = N'Junior Backend Developer')
    INSERT INTO dbo.jobs (title, department, description, requirements)
    VALUES (
        N'Junior Backend Developer', N'IT',
        N'Hľadáme junior vývojára do backend tímu, ktorý bude vyvíjať REST API pre interné systémy firmy.',
        N'["Java","SQL","REST API","Docker","Git","English"]'
    );

IF NOT EXISTS (SELECT 1 FROM dbo.jobs WHERE title = N'Data Analyst')
    INSERT INTO dbo.jobs (title, department, description, requirements)
    VALUES (
        N'Data Analyst', N'Financie',
        N'Spracovanie a vizualizácia firemných dát, príprava reportov pre manažment.',
        N'["Python","SQL","Power BI","Excel","Data Analysis","English"]'
    );

IF NOT EXISTS (SELECT 1 FROM dbo.jobs WHERE title = N'DevOps Engineer')
    INSERT INTO dbo.jobs (title, department, description, requirements)
    VALUES (
        N'DevOps Engineer', N'IT',
        N'Správa cloudovej infraštruktúry a CI/CD pipeline.',
        N'["Docker","Kubernetes","Azure","Linux","CI/CD","Terraform"]'
    );
GO
