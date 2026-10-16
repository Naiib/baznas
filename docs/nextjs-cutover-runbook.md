# Next.js Cutover & Reverse Proxy Runbook

Dokumen ini menjelaskan alur operasional deployment dan safe cutover Nginx dari static build Vite ke Next.js 16 App Router (Blue/Green Deployment).

---

## 1. Topologi Arsitektur Port di VPS

- **Next.js Production**: `127.0.0.1:3002` (PM2 Service: `baznas-frontend-next`)
- **Express Backend API**: `127.0.0.1:5000` (PM2 Service: `baznas-backend`)
- **PostgreSQL Database**: `127.0.0.1:5432`

---

## 2. Langkah Safe Cutover Nginx (`/etc/nginx/sites-available/default`)

Ketika versi Next.js di `frontend-next/` telah selesai diuji dan siap menggantikan Vite, update konfigurasi Nginx:

```nginx
server {
    server_name muhammadrofiq.my.id;

    # 1. API Reverse Proxy ke Express (tetap di port 5000)
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 2. Next.js App Router (Proxy ke port 3002)
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Uji dan reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 3. Prosedur Rollback Cepat (< 1 Menit)
Jika terjadi kendala saat cutover, cukup kembalikan blok `location /` di Nginx ke direktori statis Vite:

```nginx
location / {
    root /var/www/baznas-tangkot-v2;
    try_files $uri $uri/ /index.html;
}
```
Dan jalankan `sudo systemctl reload nginx`.
