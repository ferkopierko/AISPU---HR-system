"""Slovník rozpoznávaných zručností a vzdelania.

Kľúč = kanonický názov (interný, malými písmenami), hodnota = synonymá a varianty
zápisu vrátane slovenských. Kanonický názov sa hľadá tiež. Porovnáva sa bez ohľadu
na veľkosť písmen – okrem názvov v CASE_SENSITIVE. V API sa zručnosť vracia ako
DISPLAY[kľúč], resp. v tvare, ako je napísaná v požiadavkách pozície.

Slovenské varianty sú v základnom tvare a v najčastejších pádoch – anglický model
slovenčinu nelematizuje, iný pád sa nenájde.
"""

SKILLS: dict[str, list[str]] = {
    # programovacie jazyky
    "python": ["python3", "python 3"],
    "java": ["java se", "java ee", "jakarta ee", "j2ee", "java 17", "java 21"],
    "javascript": ["js", "ecmascript", "es6", "vanilla js"],
    "typescript": [],
    "c++": ["cpp"],
    "c#": ["csharp", "c sharp"],
    "c": ["c language", "ansi c", "embedded c", "jazyk c"],
    "go": ["golang", "go lang"],
    "rust": [],
    "php": [],
    "ruby": [],
    "kotlin": [],
    "swift": [],
    "scala": [],
    "r": ["r language", "rstudio", "jazyk r"],
    "matlab": [],
    "bash": ["shell scripting", "shell scripts", "bash scripting"],
    "powershell": [],
    # web / frameworky
    "html": ["html5"],
    "css": ["css3"],
    "sass": ["scss"],
    "react": ["react.js", "reactjs", "react js"],
    "angular": ["angularjs", "angular.js"],
    "vue": ["vue.js", "vuejs", "vue js"],
    "next.js": ["nextjs"],
    "node.js": ["nodejs", "node js"],
    "express": ["express.js", "expressjs"],
    "django": [],
    "flask": [],
    "fastapi": [],
    "spring": ["spring boot", "spring framework"],
    ".net": ["dotnet", "asp.net", "asp.net core", ".net core", "dotnet core"],
    "laravel": [],
    "graphql": [],
    "rest api": ["restful", "restful api", "rest apis", "restful services", "rest služby",
                 "rest rozhranie", "rest rozhrania"],
    "microservices": ["microservice", "mikroslužby", "mikroservisy"],
    # dáta / ML
    "sql": [],
    "databases": ["database", "rdbms", "relational databases", "databázy", "databáza", "databáz",
                  "relačné databázy", "databázové systémy"],
    "mysql": [],
    "postgresql": ["postgres", "psql", "postgre sql"],
    "sql server": ["mssql", "ms sql", "t-sql", "tsql", "azure sql", "microsoft sql server"],
    "oracle": [],
    "mongodb": ["mongo", "mongo db"],
    "redis": [],
    "elasticsearch": ["elastic search"],
    "pandas": [],
    "numpy": [],
    "scikit-learn": ["sklearn", "scikit learn"],
    "tensorflow": [],
    "pytorch": ["torch"],
    "machine learning": ["ml", "strojové učenie", "strojového učenia"],
    "deep learning": ["neural networks", "hlboké učenie", "neurónové siete"],
    "nlp": ["natural language processing", "spracovanie prirodzeného jazyka"],
    "spacy": [],
    "data analysis": ["data analytics", "analýza dát", "analýza údajov", "dátová analýza", "analýzy dát"],
    "power bi": ["powerbi", "power-bi", "microsoft power bi"],
    "tableau": [],
    "excel": ["ms excel", "microsoft excel"],
    # DevOps / cloud
    "docker": ["docker compose", "docker-compose"],
    "kubernetes": ["k8s", "kubectl"],
    "azure": ["microsoft azure", "azure cloud"],
    "aws": ["amazon web services", "amazon aws"],
    "gcp": ["google cloud", "google cloud platform"],
    "linux": ["ubuntu", "debian", "centos", "red hat linux"],
    "git": [],
    "github": [],
    "gitlab": [],
    "ci/cd": ["ci cd", "continuous integration", "continuous delivery", "continuous deployment",
              "github actions", "gitlab ci", "azure devops pipelines"],
    "jenkins": [],
    "terraform": [],
    "ansible": [],
    # metodiky, testovanie
    "agile": ["agilné metodiky", "agilný vývoj", "agile methodology"],
    "scrum": [],
    "jira": [],
    "unit testing": ["pytest", "jest", "junit", "unit tests", "unit testy", "jednotkové testy"],
    "software testing": ["test automation", "automated testing", "qa testing", "testovanie softvéru",
                         "automatizované testovanie"],
    "oop": ["object-oriented programming", "object oriented programming",
            "objektovo orientované programovanie", "objektové programovanie"],
    # biznis a mäkké zručnosti
    "project management": ["riadenie projektov", "projektový manažment", "projektové riadenie"],
    "communication": ["communication skills", "komunikácia", "komunikačné zručnosti", "komunikatívnosť"],
    "teamwork": ["team work", "team player", "tímová práca", "práca v tíme"],
    "accounting": ["bookkeeping", "účtovníctvo", "účtovníctva", "podvojné účtovníctvo"],
    # jazyky
    "english": ["angličtina", "anglický jazyk", "english language", "anglicky"],
    "german": ["nemčina", "nemecký jazyk", "german language", "nemecky"],
}

# Zobrazovaný názov zručnosti (správna veľkosť písmen). Zručnosť, ktorá tu chýba,
# sa zobrazí ako kľúč – test kontroluje, že sú tu všetky.
DISPLAY: dict[str, str] = {
    "python": "Python", "java": "Java", "javascript": "JavaScript", "typescript": "TypeScript",
    "c++": "C++", "c#": "C#", "c": "C", "go": "Go", "rust": "Rust", "php": "PHP", "ruby": "Ruby",
    "kotlin": "Kotlin", "swift": "Swift", "scala": "Scala", "r": "R", "matlab": "MATLAB",
    "bash": "Bash", "powershell": "PowerShell",
    "html": "HTML", "css": "CSS", "sass": "Sass", "react": "React", "angular": "Angular", "vue": "Vue.js",
    "next.js": "Next.js", "node.js": "Node.js", "express": "Express", "django": "Django", "flask": "Flask",
    "fastapi": "FastAPI", "spring": "Spring", ".net": ".NET", "laravel": "Laravel", "graphql": "GraphQL",
    "rest api": "REST API", "microservices": "Microservices",
    "sql": "SQL", "databases": "Databázy", "mysql": "MySQL", "postgresql": "PostgreSQL",
    "sql server": "SQL Server", "oracle": "Oracle", "mongodb": "MongoDB", "redis": "Redis",
    "elasticsearch": "Elasticsearch", "pandas": "pandas", "numpy": "NumPy", "scikit-learn": "scikit-learn",
    "tensorflow": "TensorFlow", "pytorch": "PyTorch", "machine learning": "Machine Learning",
    "deep learning": "Deep Learning", "nlp": "NLP", "spacy": "spaCy", "data analysis": "Data Analysis",
    "power bi": "Power BI", "tableau": "Tableau", "excel": "Excel",
    "docker": "Docker", "kubernetes": "Kubernetes", "azure": "Azure", "aws": "AWS", "gcp": "GCP",
    "linux": "Linux", "git": "Git", "github": "GitHub", "gitlab": "GitLab", "ci/cd": "CI/CD",
    "jenkins": "Jenkins", "terraform": "Terraform", "ansible": "Ansible",
    "agile": "Agile", "scrum": "Scrum", "jira": "Jira", "unit testing": "Unit testing",
    "software testing": "Testovanie softvéru", "oop": "OOP",
    "project management": "Riadenie projektov", "communication": "Komunikácia", "teamwork": "Tímová práca",
    "accounting": "Účtovníctvo", "english": "English", "german": "German",
}

# Názvy, ktoré sú zároveň bežné slová („react quickly“, „excel at“, „C level“).
# Hľadajú sa iba v presnom tvare (veľkosť písmen) – varianty v SKILLS platia ďalej.
CASE_SENSITIVE: dict[str, list[str]] = {
    "c": ["C"],
    "r": ["R"],
    "go": ["Go"],
    "react": ["React", "REACT"],
    "express": ["Express"],
    "excel": ["Excel", "EXCEL"],
    "swift": ["Swift"],
    "spring": ["Spring"],
    "node.js": ["Node", "NODE"],
    "rust": ["Rust"],
    "scala": ["Scala"],
    "ruby": ["Ruby"],
    "oracle": ["Oracle", "ORACLE"],
    "agile": ["Agile", "AGILE"],
    "rest api": ["REST"],
    "typescript": ["TS"],
}

# úroveň vzdelania -> výrazy (aj slovenské tituly)
DEGREES: dict[str, list[str]] = {
    "phd": ["phd", "ph.d.", "ph.d", "doctorate", "doctoral", "phdr.", "doktorandské"],
    "master": ["master's", "master of", "master degree", "masters degree", "msc", "m.sc.", "mba", "ing.", "mgr.", "inžinierske", "magisterské"],
    "bachelor": ["bachelor", "bachelor's", "bachelors", "bsc", "b.sc.", "bc.", "bakalárske"],
    "high school": ["high school", "secondary school", "gymnázium", "stredná škola", "maturita"],
}
