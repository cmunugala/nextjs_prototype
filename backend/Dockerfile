# Use the official stable Python image
FROM python:3.12-slim

# Copy the 'uv' binary from the latest Astral image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# The rest of your Dockerfile stays exactly the same
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache
# ... rest of your file

# Set working directory
WORKDIR /app

# Copy dependency files from the root (since they are at the top level)
# Note: In docker-compose we will handle the context
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-cache

# Copy the backend code
COPY backend/ ./backend/

# Expose the FastAPI port
EXPOSE 8000

# Run the application
# We use --host 0.0.0.0 to allow connections from outside the container
CMD ["uv", "run", "--with", "uvicorn", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
