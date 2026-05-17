# 🔧 HandyRO — Ghid de publicare pe Railway

## Ce este Railway?
Railway.app este o platformă de hosting gratuită pentru aplicații Node.js.
Nu ai nevoie de experiență tehnică — urmează pașii de mai jos.

---

## PASUL 1 — Instalează Node.js pe calculatorul tău

1. Mergi la: https://nodejs.org
2. Descarcă versiunea **LTS** (butonul verde)
3. Instalează-l (next, next, finish)
4. Verificare: deschide CMD/Terminal și scrie:
   ```
   node --version
   ```
   Ar trebui să vezi ceva ca: `v20.0.0`

---

## PASUL 2 — Creează cont pe Railway

1. Mergi la: https://railway.app
2. Click **"Start a New Project"**
3. Loghează-te cu GitHub (sau creează un cont nou)

---

## PASUL 3 — Instalează dependențele local (o singură dată)

1. Deschide CMD/Terminal
2. Navighează în folderul proiectului:
   ```
   cd calea/catre/handyro
   ```
3. Instalează pachetele:
   ```
   npm install
   ```
4. Testează local:
   ```
   npm start
   ```
5. Deschide browserul la: http://localhost:3000
   Ar trebui să vezi site-ul HandyRO!

---

## PASUL 4 — Publică pe Railway (varianta simplă cu GitHub)

### 4a. Creează un repository pe GitHub
1. Mergi la: https://github.com/new
2. Nume: `handyro`
3. Click **Create repository**

### 4b. Încarcă codul
În CMD/Terminal, în folderul handyro:
```
git init
git add .
git commit -m "HandyRO initial"
git branch -M main
git remote add origin https://github.com/USERNAME/handyro.git
git push -u origin main
```
*(înlocuiește USERNAME cu username-ul tău GitHub)*

### 4c. Conectează Railway la GitHub
1. Pe Railway, click **"New Project"**
2. Click **"Deploy from GitHub repo"**
3. Selectează `handyro`
4. Railway detectează automat că e Node.js și îl pornește

### 4d. Configurează variabila de mediu
1. În Railway, click pe proiectul tău
2. Mergi la **Variables**
3. Adaugă:
   - `JWT_SECRET` = `o_parola_secreta_lunga_handyro_2026`
   - `NODE_ENV` = `production`

---

## PASUL 5 — Domeniu personalizat

1. În Railway, mergi la **Settings → Domains**
2. Click **"Generate Domain"** pentru un URL gratuit (ex: `handyro-production.up.railway.app`)
3. SAU conectează `handyro.ro` dacă ai cumpărat domeniul

---

## Conturi demo incluse în baza de date:

| Rol | Email | Parolă |
|-----|-------|--------|
| Admin | admin@handyro.ro | admin123 |
| Meșter (Ionuț) | ionut@handyro.ro | ionut123 |
| Client demo | maria@handyro.ro | maria123 |

---

## Funcționalități incluse:

✅ Autentificare cu JWT (token securizat)
✅ Înregistrare clienți și meseriași
✅ Aprobare meseriași de către admin
✅ Admin editează prețul fiecărui meșter
✅ Joburi — creare, acceptare, finalizare
✅ Mesagerie internă client ↔ meșter
✅ Blocare automată numere de telefon din mesaje
✅ Admin poate bloca/activa orice cont
✅ Admin vede toate conversațiile

---

## Structura proiectului:

```
handyro/
├── server.js          ← Serverul principal
├── db.js              ← Baza de date SQLite
├── package.json       ← Dependențe npm
├── middleware/
│   └── auth.js        ← Verificare JWT
├── routes/
│   ├── auth.js        ← Login / Register / Logout
│   ├── workers.js     ← Meseriași
│   ├── jobs.js        ← Joburi
│   ├── messages.js    ← Mesagerie internă
│   └── admin.js       ← Panou administrator
└── public/
    └── index.html     ← Frontend complet
```

---

## Ai nevoie de ajutor?
Trimite un mesaj la contact@handyro.ro sau deschide un chat cu meșterul 😄
