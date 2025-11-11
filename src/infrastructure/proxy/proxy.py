#!/usr/bin/env python3
"""
Simple HTTP proxy for HackForums API
Validates API key and forwards requests to HackForums
"""

import os
import sys
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Configuration
PORT = int(os.getenv("PORT", "8080"))
HF_API_BASE = "https://hackforums.net/api/v2"
HF_CLIENT_ID = os.getenv("HF_CLIENT_ID")
HF_CLIENT_SECRET = os.getenv("HF_CLIENT_SECRET")
PROXY_API_KEY = os.getenv("PROXY_API_KEY")

class ProxyHandler(BaseHTTPRequestHandler):
    """HTTP request handler that proxies to HackForums API"""

    def log_message(self, format, *args):
        """Custom logging format"""
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def _validate_api_key(self):
        """Validate the X-API-Key header"""
        api_key = self.headers.get("X-API-Key", "")
        if api_key != PROXY_API_KEY:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "Invalid API key"}')
            return False
        return True

    def _proxy_request(self, method):
        """Proxy the request to HackForums API"""
        if not self._validate_api_key():
            return

        # Build target URL
        url = f"{HF_API_BASE}{self.path}"
        self.log_message(f"Proxying {method} {url}")

        # Prepare headers for HF API
        headers = {
            "Authorization": f"Bearer {HF_CLIENT_ID}",
            "Content-Type": "application/json",
        }

        # Get request body if present
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        try:
            # Make request to HF API
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=30)
            elif method == "POST":
                response = requests.post(url, headers=headers, data=body, timeout=30)
            else:
                self.send_response(405)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"Method Not Allowed")
                return

            # Send response back to client
            self.send_response(response.status_code)
            for header, value in response.headers.items():
                if header.lower() not in ["transfer-encoding", "connection"]:
                    self.send_header(header, value)
            self.end_headers()
            self.wfile.write(response.content)

        except requests.RequestException as e:
            self.log_message(f"Error proxying request: {e}")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "Bad Gateway"}')

    def do_GET(self):
        """Handle GET requests"""
        self._proxy_request("GET")

    def do_POST(self):
        """Handle POST requests"""
        self._proxy_request("POST")

def main():
    """Start the proxy server"""
    # Validate environment variables
    if not all([HF_CLIENT_ID, HF_CLIENT_SECRET, PROXY_API_KEY]):
        print("ERROR: Missing required environment variables")
        print(f"HF_CLIENT_ID: {'set' if HF_CLIENT_ID else 'missing'}")
        print(f"HF_CLIENT_SECRET: {'set' if HF_CLIENT_SECRET else 'missing'}")
        print(f"PROXY_API_KEY: {'set' if PROXY_API_KEY else 'missing'}")
        sys.exit(1)

    # Start server
    server = HTTPServer(("0.0.0.0", PORT), ProxyHandler)
    print(f"Starting HackForums API proxy on port {PORT}")
    print(f"HF Client ID: {HF_CLIENT_ID[:20]}...")
    print(f"Proxy API Key: {PROXY_API_KEY[:8]}...")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down proxy server")
        server.shutdown()

if __name__ == "__main__":
    main()
