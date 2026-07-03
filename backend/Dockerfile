FROM python:3.12-slim

# Install curl for Temporal CLI installation
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install Temporal CLI
RUN curl -sSf https://temporal.download/cli.sh | sh
ENV PATH="/root/.temporalio/bin:${PATH}"

WORKDIR /app

# Install deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Expose ports
EXPOSE 8000
EXPOSE 8080

# Run the startup script that starts temporal dev server, worker, and FastAPI
CMD ["bash", "start.sh"]
