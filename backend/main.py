"""FastAPI entry point for the Petassos Travel Map."""

from fastapi import FastAPI

app = FastAPI(title="Petassos Travel Map API")


@app.get("/api/health")
def health() -> dict[str, str]:
    """A small end-to-end check for the first development step."""
    return {"status": "ok"}
