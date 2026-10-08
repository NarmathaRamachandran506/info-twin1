import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from backend.config import DEBUG, BASE_DIR
from backend.database import init_db
from backend.routes.documents import router as documents_router

from contextlib import asynccontextmanager

# Setup logging
logging.basicConfig(
    level=logging.INFO if not DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("DocUnderstanding")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database on startup
    init_db()
    logger.info("SQLite database and tables initialized.")
    yield

app = FastAPI(
    title="Intelligent Information Understanding & Processing",
    description="MVP for automated document ingestion, multi-format parsing, and claim extraction (PDF, DOCX, XLSX).",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(documents_router)

# Health Check Endpoint
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Intelligent Information Understanding & Processing MVP",
        "version": "1.0.0",
        "supported_formats": ["PDF", "DOCX", "XLSX"]
    }

# Serve Frontend Static Assets
frontend_dir = BASE_DIR / "frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

    @app.get("/")
    def serve_frontend_index():
        index_file = frontend_dir / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return JSONResponse({"message": "Frontend index.html not found."})

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled server exception: %s", str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "InternalServerError", "detail": str(exc)}
    )
