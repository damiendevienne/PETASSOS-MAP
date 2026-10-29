# Petassos Travel Map

Première base de l'application décrite dans la [spécification fonctionnelle](Petassos_Travel_Map_FINAL_Specification_v5.md). Le frontend React est dans `frontend/` et l'API FastAPI dans `backend/`.

L'interface Admin comprend la connexion, la carte de Crète, la gestion des lieux, des notes, de leurs images et des zones rectangulaires, ainsi que le partage de cartes avec les clients.

## Prérequis

- Python 3.10 ou plus récent
- Node.js 22.12 ou plus récent et npm

## Installation (une seule fois)

Depuis la racine du projet :

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python setup_admin.py
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

Ouvrir <http://127.0.0.1:5173>. La page de connexion Admin s'affiche. Une fois connecté, la carte de Crète apparaît. Les onglets Places / Notes / Zones changent le panneau sans recharger la carte ; le menu Admin permet de se déconnecter. La carte utilise des tuiles en ligne et nécessite une connexion Internet.

L'API peut aussi être vérifiée sur <http://127.0.0.1:8000/api/health> : elle répond `{"status":"ok"}`.

Le script `setup_admin.py` demande un identifiant et un mot de passe, puis crée `../.env` avec un hash du mot de passe et un secret de session. Ce compte est **Superadmin** ; le compte existant le devient après la migration. Le fichier `.env` est ignoré par Git. Il faut le créer avant le premier démarrage du backend. En production HTTPS, régler `SESSION_COOKIE_SECURE=true`.

Pour créer un compte **Admin**, depuis `backend/` :

```bash
.venv/bin/python manage_admin.py add alice
```

Le même script accepte `reset alice` pour changer son mot de passe et `remove alice` pour supprimer le compte. Les Admins peuvent créer, modifier, archiver et restaurer les lieux, notes et zones. Seul le Superadmin peut supprimer définitivement un élément archivé. L'archive se trouve dans le menu Admin, séparément des filtres Published/Draft. Une zone utilisée par une carte partagée doit d'abord être retirée de cette carte avant d'être archivée.

Pour changer le mot de passe Superadmin, depuis `backend/` :

```bash
.venv/bin/python change_password.py
```

Le script demande l'ancien et le nouveau mot de passe (5 caractères minimum), puis remplace le secret de session. Redémarrer le backend ensuite ; les anciennes sessions seront invalidées.

Les routes `/api/admin/login`, `/api/admin/session` et `/api/admin/logout` peuvent aussi être essayées dans <http://127.0.0.1:8000/docs>. En développement, Vite transmet les requêtes `/api` au backend sur le port 8000.
