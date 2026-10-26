"""Static server for the demo that disables caching, so rebuilt files always load."""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
# serve rsc/quill (the folder above this one), so the demo sits at /demo/ and imports ../index.js
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ThreadingHTTPServer(("", port), partial(NoCache, directory=root)).serve_forever()
