BioHim 4.0.2

Страници:
- /              начална страница
- /biology.html  Биология (зелено)
- /chemistry.html Химия (синьо)
- /law.html       Право (#5e1426)

Ново в 4.0.2:
1. Право като трети предмет.
2. Отделна цветова тема за всеки предмет.
3. Изчистване на статистиката по предмет без изтриване на тестетата.
4. Gemini генератор на флаш карти от тема, урок, конспект или глава от книга (текст/TXT/MD).
5. Отделни HTML страници за Биология, Химия и Право.
6. Запазени тестета и статистика в localStorage, споделени между страниците на същия домейн.

Render:
- Качи файловете в GitHub.
- Задай GEMINI_API_KEY като Environment Variable в Render.
- Deploy.


LAUNCHER HOTFIX:
- START_BIOHIM.bat now opens a reliable PowerShell prompt for GEMINI_API_KEY.
- Browser opens only after http://127.0.0.1:8787 responds.
- BAT files use Windows CRLF line endings and always run from their own folder.
