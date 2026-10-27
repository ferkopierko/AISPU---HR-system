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

-- Profil a rozšírené údaje pozícií (doplní sa iba raz – kým sú prázdne)
UPDATE dbo.users SET full_name = N'Hana Rybárová' WHERE email = N'hr@firma.sk' AND full_name IS NULL;
UPDATE dbo.users SET full_name = N'Ján Testovací', phone = N'+421 905 000 000'
WHERE email = N'jan@test.sk' AND full_name IS NULL;

UPDATE dbo.jobs SET location = N'Košice', employment_type = N'full_time', work_mode = N'hybrid',
       salary_min = 1600, salary_max = 2200, salary_period = N'month',
       responsibilities = N'Vývoj a údržba REST API v Jave, návrh databázových tabuliek, code review v tíme.',
       benefits = N'Stravné lístky, 25 dní dovolenky, multisport karta, 2 dni home office týždenne.',
       deadline = DATEADD(MONTH, 2, CAST(SYSUTCDATETIME() AS DATE))
WHERE title = N'Junior Backend Developer' AND location IS NULL;

UPDATE dbo.jobs SET location = N'Bratislava', employment_type = N'full_time', work_mode = N'onsite',
       salary_min = 1800, salary_max = 2400, salary_period = N'month',
       responsibilities = N'Príprava mesačných reportov, dashboardy v Power BI, analýza predajných dát.',
       benefits = N'13. plat, firemné školenia, príspevok na doplnkové dôchodkové sporenie.'
WHERE title = N'Data Analyst' AND location IS NULL;

UPDATE dbo.jobs SET location = N'Slovensko', employment_type = N'contract', work_mode = N'remote',
       salary_min = 35, salary_max = 50, salary_period = N'hour',
       responsibilities = N'Správa Kubernetes klastrov v Azure, CI/CD pipeline, infraštruktúra ako kód (Terraform).',
       benefits = N'Plne remote, flexibilný pracovný čas, rozpočet na certifikácie.',
       deadline = DATEADD(MONTH, 1, CAST(SYSUTCDATETIME() AS DATE))
WHERE title = N'DevOps Engineer' AND location IS NULL;
GO
