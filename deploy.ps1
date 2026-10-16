Write-Error "[Deploy] Retired: the Vite shell is not a deployable frontend. Use deploy/release-vps.sh to build and release frontend-next."
exit 1

# 1. Run Linter
Write-Host "[Deploy] Running linter checks..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Deploy] Linter checks failed. Deployment aborted."
    exit
}

# 2. Build local
Write-Host "[Deploy] Building production assets..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Deploy] Build failed. Deployment aborted."
    exit
}

# 3. Zip/Tar dist
Write-Host "[Deploy] Creating local deployment archive..." -ForegroundColor Yellow
if (Test-Path dist-deploy.tar.gz) { Remove-Item dist-deploy.tar.gz }
tar -czf dist-deploy.tar.gz -C dist .

# 4. Upload to VPS
Write-Host "[Deploy] Uploading archive to VPS..." -ForegroundColor Yellow
scp -i C:\Users\xrunc\.ssh\id_ed25519 -o StrictHostKeyChecking=no dist-deploy.tar.gz xruncy@103.189.235.61:/home/xruncy/dist-deploy.tar.gz
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Deploy] Upload failed. Deployment aborted."
    exit
}

# 5. Extract on VPS and clean up
Write-Host "[Deploy] Deploying on VPS Nginx directory..." -ForegroundColor Yellow
ssh -i C:\Users\xrunc\.ssh\id_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 xruncy@103.189.235.61 'sudo mkdir -p /var/www/baznas-tangkot-v2 && sudo tar -xzf /home/xruncy/dist-deploy.tar.gz -C /var/www/baznas-tangkot-v2/ && sudo chown -R www-data:www-data /var/www/baznas-tangkot-v2 && rm -f /home/xruncy/dist-deploy.tar.gz'
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Deploy] Extraction on VPS failed."
    exit
}

# 6. Clean up local archive
Remove-Item dist-deploy.tar.gz -ErrorAction SilentlyContinue

Write-Host "[Deploy] Deployment completed successfully! Accessible at http://103.189.235.61:8080/" -ForegroundColor Green
