import uvicorn
from backend.config import HOST, PORT, DEBUG

if __name__ == "__main__":
    print(f"Starting Intelligent Information Understanding & Processing MVP at http://{HOST}:{PORT}")
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=DEBUG)
