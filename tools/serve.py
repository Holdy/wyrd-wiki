# The development server: python's http.server, but telling the browser to check every file each time it is used,
# so an edited script (even one loaded later with import(), which a hard reload doesn't refetch) is always the new one.
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
