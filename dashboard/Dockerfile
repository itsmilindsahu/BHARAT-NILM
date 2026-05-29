FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Copy dependency list
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire project
COPY . .

# Expose port (Fly.io / Railway compatible)
EXPOSE 8000

# Start the server
CMD ["python", "app.py"]
