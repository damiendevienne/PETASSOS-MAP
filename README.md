# Petassos Travel Map

Première base de l'application décrite dans la [spécification fonctionnelle](Petassos_Travel_Map_FINAL_Specification_v5.md). Le frontend React est dans `frontend/` et l'API FastAPI dans `backend/`.

À ce stade, l'interface affiche une page de test et vérifie la connexion à l'API. La carte, l'authentification et la base de données viendront ensuite.

## Prérequis

- Python 3.10 ou plus récent
- Node.js 22.12 ou plus récent et npm

## Installation (une seule fois)

Depuis la racine du projet :

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Dans un autre terminal, toujours depuis la racine du projet :

```bash
cd frontend
npm ci
```

## Lancement en développement

Terminal 1, depuis la racine du projet :

```bash
cd backend
.venv/bin/uvicorn main:app --reload
```

Terminal 2, depuis la racine du projet :

```bash
cd frontend
npm run dev
```

Ouvrir <http://127.0.0.1:5173>. La page doit afficher **FastAPI connection: Connected**. L'API peut aussi être vérifiée sur <http://127.0.0.1:8000/api/health> : elle répond `{"status":"ok"}`.

En développement, Vite transmet les requêtes `/api` au backend sur le port 8000. Le fichier `.env.example` documente des paramètres prévus pour les étapes suivantes ; ils ne sont pas encore utilisés.
