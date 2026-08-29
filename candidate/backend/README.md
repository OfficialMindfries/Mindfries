# Mindfries FastAPI Backend

## Getting Started

### 1. Set up Virtual Environment
```bash
python -m venv venv
```

### 2. Activate Virtual Environment
- **Windows (PowerShell)**: `.\venv\Scripts\Activate.ps1`
- **Linux/macOS**: `source venv/bin/activate`

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run Development Server
```bash
uvicorn app.main:app --reload --port 8000
```

- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/v1/health`
