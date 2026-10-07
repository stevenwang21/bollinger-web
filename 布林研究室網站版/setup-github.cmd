@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   布林研究室網站版：第一次上傳到 GitHub
echo ============================================
echo.
echo 請先在 https://github.com/new 建立一個「Public」空白 repo（不要勾 README）
echo 例如名稱：bollinger-web
echo.
set /p REPO=貼上 repo 網址（例如 https://github.com/stevenwang21/bollinger-web.git）： 
if "%REPO%"=="" goto :eof
if not exist ".github\workflows" mkdir ".github\workflows"
copy /y "github-workflow\update-site.yml" ".github\workflows\update-site.yml" >nul
git init -b main
git add .
git commit -m "布林研究室網站版"
git remote remove origin 2>nul
git remote add origin %REPO%
git push -u origin main
echo.
echo 上傳完成後：repo 的 Settings → Pages → Source 選「GitHub Actions」
echo 再到 Actions 分頁，點「每日更新布林選股網站」→ Run workflow。
pause
