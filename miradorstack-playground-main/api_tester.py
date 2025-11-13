import requests
import random
import string
import time
import signal
import sys
import logging
import json

try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk._logs import LoggingHandler
    from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
    from opentelemetry.sdk._logs.export import BatchLogProcessor
    from opentelemetry.sdk._logs import LoggerProvider, set_logger_provider
    OTEL_AVAILABLE = True
except ImportError:
    print("OpenTelemetry not available. Install with: pip install opentelemetry-distro opentelemetry-exporter-otlp-proto-http")
    OTEL_AVAILABLE = False

# Configuration
BASE_URL = "http://localhost:8081/api"  # Change to your server's IP if not localhost
MAX_KEYS = 10  # Maximum number of keys to keep before forcing deletions
OTEL_ENDPOINT = "http://localhost:4318"  # OTEL collector HTTP endpoint

# Global variables
keys = set()
running = True

# Set up OpenTelemetry if available
if OTEL_AVAILABLE:
    resource = Resource.create({"service.name": "api-tester", "service.version": "1.0.0"})
    trace.set_tracer_provider(TracerProvider(resource=resource))
    tracer = trace.get_tracer(__name__)

    # Set up logging with OTEL export
    logger_provider = LoggerProvider(resource=resource)
    set_logger_provider(logger_provider)

    # OTLP log exporter
    log_exporter = OTLPLogExporter(endpoint=f"{OTEL_ENDPOINT}/v1/logs", headers={})
    logger_provider.add_log_processor(BatchLogProcessor(log_exporter))

# JSON formatter for console logging
class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Console handler with JSON formatter
console_handler = logging.StreamHandler()
console_handler.setFormatter(JSONFormatter())
logger.addHandler(console_handler)

if OTEL_AVAILABLE:
    # OTEL logging handler
    otel_handler = LoggingHandler()
    logger.addHandler(otel_handler)

def signal_handler(sig, frame):
    global running
    logger.info("Stopping the script...")
    running = False

def generate_random_string(length=8):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def create_key():
    key = generate_random_string()
    value = generate_random_string(16)
    try:
        response = requests.post(f"{BASE_URL}/create", params={"key": key, "value": value})
        if response.status_code == 200:
            keys.add(key)
            logger.info("Created key: %s", key)
        else:
            logger.warning("Failed to create key: %s, Status: %s", key, response.status_code)
    except Exception as e:
        logger.error("Error creating key: %s", e)

def read_key():
    if keys:
        key = random.choice(list(keys))
        try:
            response = requests.get(f"{BASE_URL}/read/{key}")
            if response.status_code == 200:
                logger.info("Read key: %s, Data: %s", key, response.json())
            else:
                logger.warning("Failed to read key: %s, Status: %s", key, response.status_code)
        except Exception as e:
            logger.error("Error reading key: %s", e)
    else:
        logger.info("No keys available to read")

def modify_key():
    if keys:
        key = random.choice(list(keys))
        value = generate_random_string(16)
        try:
            response = requests.put(f"{BASE_URL}/modify/{key}", params={"value": value})
            if response.status_code == 200:
                logger.info("Modified key: %s", key)
            else:
                logger.warning("Failed to modify key: %s, Status: %s", key, response.status_code)
        except Exception as e:
            logger.error("Error modifying key: %s", e)
    else:
        logger.info("No keys available to modify")

def delete_key():
    if keys:
        key = random.choice(list(keys))
        try:
            response = requests.delete(f"{BASE_URL}/delete/{key}")
            if response.status_code == 200:
                keys.remove(key)
                logger.info("Deleted key: %s", key)
            else:
                logger.warning("Failed to delete key: %s, Status: %s", key, response.status_code)
        except Exception as e:
            logger.error("Error deleting key: %s", e)
    else:
        logger.info("No keys available to delete")

def list_keys():
    try:
        response = requests.get(f"{BASE_URL}/list")
        if response.status_code == 200:
            keys_list = response.json()
            logger.info("Listed keys: %s", keys_list)
            # Update global keys set to match server state
            global keys
            keys = set(keys_list)
        else:
            logger.warning("Failed to list keys, Status: %s", response.status_code)
    except Exception as e:
        logger.error("Error listing keys: %s", e)

def main():
    signal.signal(signal.SIGINT, signal_handler)
    operations = [create_key, read_key, modify_key, delete_key, list_keys]

    logger.info("Starting API invocation script. Press Ctrl+C to stop.")
    logger.info("Base URL: %s", BASE_URL)
    logger.info("Max keys: %s", MAX_KEYS)

    while running:
        # Force deletion if too many keys
        if len(keys) >= MAX_KEYS:
            delete_key()
        else:
            # Random operation
            op = random.choice(operations)
            op()

        # Wait before next operation
        time.sleep(random.randint(1, 5))

    logger.info("Script stopped.")

if __name__ == "__main__":
    main()