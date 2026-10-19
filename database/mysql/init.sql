-- =====================================================================
-- AISPU HR systém – MySQL 8.0 (Backend 2 – analýza CV)
-- Schéma: cv_analyses, match_scores
-- Spúšťa sa automaticky pri prvom štarte kontajnera
-- (/docker-entrypoint-initdb.d/init.sql).
--
-- Pozn.: application_id odkazuje na applications.id v Azure SQL (Backend 1).
-- Ide o inú databázu, preto tu nie je FOREIGN KEY – väzbu stráži aplikácia.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS hr_analysis
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE hr_analysis;

-- ---------------------------------------------------------------------
-- cv_analyses – výsledok extrakcie textu a zručností z CV
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_analyses (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    application_id   INT UNSIGNED  NOT NULL,
    raw_text         LONGTEXT      NULL,
    skills_json      JSON          NULL,           -- napr. ["python", "sql", "docker"]
    education_json   JSON          NULL,           -- {"degrees": [...], "institutions": [...]} (fáza 3)
    experience_years DECIMAL(4,1)  NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_cv_analyses_application (application_id),
    CONSTRAINT ck_cv_analyses_experience CHECK (experience_years IS NULL OR experience_years >= 0)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- match_scores – zhoda CV s požiadavkami pozície
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_scores (
    id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    application_id      INT UNSIGNED  NOT NULL,
    score_percentage    DECIMAL(5,2)  NOT NULL,
    text_similarity     DECIMAL(5,2)  NULL,          -- kosínusová podobnosť textov 0-100 (fáza 3)
    skill_coverage      DECIMAL(5,2)  NULL,          -- podiel splnených zručností 0-100 (fáza 3)
    missing_skills_json JSON          NULL,
    matched_skills_json JSON          NULL,
    analyzed_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY ix_match_scores_application (application_id),
    CONSTRAINT ck_match_scores_score CHECK (score_percentage BETWEEN 0 AND 100)
) ENGINE = InnoDB;
