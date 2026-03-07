FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY agents/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent code
COPY agents/ ./agents/

# Set Python path so agents can import from the agents package
ENV PYTHONPATH=/app

CMD ["python", "-m", "agents.runner"]
